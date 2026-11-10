-- The owner's private knowledge library and versioned question sets. Case prep reads
-- them during every user's turn, so they are owner-wide rather than per-user: only the
-- server's service role reaches them, through knowledge_operation. This migration only
-- adds objects; until it runs, the app uses the built-in question sets and no guidance.
create table public.knowledge_items (id text primary key, created_at timestamptz not null, data jsonb not null);
-- Passages exist only while their item is approved. Title words weigh more than passage text.
create table public.knowledge_passages (
 id text primary key,
 item_id text not null references public.knowledge_items(id) on delete cascade,
 title text not null,
 text text not null,
 search tsvector generated always as (setweight(to_tsvector('english'::regconfig, title), 'A') || setweight(to_tsvector('english'::regconfig, text), 'B')) stored
);
create index knowledge_passages_item on public.knowledge_passages(item_id);
create index knowledge_passages_search on public.knowledge_passages using gin(search);
-- Append-only. The highest version is live; version 0 is the code default and is never stored.
create table public.framework_versions (mode text not null check (mode in ('business','philosophy')), version integer not null check (version > 0), areas jsonb not null, note text, created_at timestamptz not null, unique(mode, version));

alter table public.knowledge_items enable row level security;
alter table public.knowledge_passages enable row level security;
alter table public.framework_versions enable row level security;
revoke all on public.knowledge_items, public.knowledge_passages, public.framework_versions from anon, authenticated;
grant all on public.knowledge_items, public.knowledge_passages, public.framework_versions to service_role;

create or replace function public.knowledge_operation(action text, value jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare item jsonb; result jsonb; match_query tsquery; rank_query tsquery; next_version integer; stamp timestamptz;
begin
 if action='createItem' then
  insert into knowledge_items values (value->>'id', (value->>'createdAt')::timestamptz, value) returning data into result;
  return result;
 elsif action='getItem' then
  select data into result from knowledge_items where id=value->>'id';
  return result;
 elsif action='listItems' then
  select coalesce(jsonb_agg(data - 'text' order by created_at desc, id), '[]'::jsonb) into result from knowledge_items;
  return result;
 elsif action='search' then
  -- Answer words decide inclusion (ANDs rewritten to ORs); ranking words only add to the score.
  if coalesce(value->>'match', '') = '' then return '[]'::jsonb; end if;
  match_query := replace(plainto_tsquery('english', value->>'match')::text, ' & ', ' | ')::tsquery;
  if numnode(match_query) = 0 then return '[]'::jsonb; end if;
  if coalesce(value->>'rank', '') <> '' then rank_query := replace(plainto_tsquery('english', value->>'rank')::text, ' & ', ' | ')::tsquery; end if;
  select coalesce(jsonb_agg(jsonb_build_object('text', ranked.text) order by ranked.score desc, ranked.id), '[]'::jsonb) into result from (
   select p.id, p.text, ts_rank_cd(p.search, match_query) + case when numnode(rank_query) > 0 then ts_rank_cd(p.search, rank_query) else 0 end as score
   from knowledge_passages p join knowledge_items i on i.id = p.item_id
   where i.data->>'status' = 'approved' and p.search @@ match_query
   order by score desc, p.id limit greatest((value->>'limit')::integer, 0)
  ) ranked;
  return result;
 elsif action='listVersions' then
  select coalesce(jsonb_agg(jsonb_build_object('mode', mode, 'version', version, 'createdAt', to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) || case when note is null then '{}'::jsonb else jsonb_build_object('note', note) end order by version desc), '[]'::jsonb)
   into result from framework_versions where mode=value->>'mode';
  return result;
 elsif action='getVersion' then
  select jsonb_build_object('mode', mode, 'version', version, 'areas', areas, 'createdAt', to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) || case when note is null then '{}'::jsonb else jsonb_build_object('note', note) end into result
   from framework_versions where mode=value->>'mode' and (not value ? 'version' or version=(value->>'version')::integer) order by version desc limit 1;
  return result;
 elsif action='publishVersion' then
  perform pg_advisory_xact_lock(hashtextextended('framework_versions:' || (value->>'mode'), 905));
  select coalesce(max(version), 0) + 1 into next_version from framework_versions where mode=value->>'mode';
  stamp := (value->>'now')::timestamptz;
  insert into framework_versions values (value->>'mode', next_version, value->'areas', value->>'note', stamp);
  return jsonb_build_object('mode', value->>'mode', 'version', next_version, 'areas', value->'areas', 'createdAt', to_char(stamp at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) || case when value ? 'note' then jsonb_build_object('note', value->>'note') else '{}'::jsonb end;
 end if;

 select data into item from knowledge_items where id=value->>'id' for update;
 if item is null then perform app_error('NOT_FOUND'); end if;
 if action='deleteItem' then
  delete from knowledge_items where id=value->>'id';
  return item;
 elsif action='updateItem' then
  if item->>'status'='approved' then perform app_error('INVALID_STATUS'); end if;
  result := item || ((value->'patch') - 'id' - 'status' - 'createdAt') || jsonb_build_object('updatedAt', value->>'now');
 elsif action='setStatus' then
  if item->>'status'='approved' or value->'change'->>'status' in ('approved','uploading') then perform app_error('INVALID_STATUS'); end if;
  -- Status details are replaced on every change.
  result := (item - 'failureReason' - 'processingStartedAt') || (value->'change') || jsonb_build_object('updatedAt', value->>'now');
 elsif action='approveItem' then
  if item->>'status'<>'review' then perform app_error('INVALID_STATUS'); end if;
  delete from knowledge_passages where item_id=item->>'id';
  insert into knowledge_passages(id, item_id, title, text)
   select (item->>'id') || ':' || lpad(passage.position::text, 4, '0'), item->>'id', item->>'title', passage.text
   from jsonb_array_elements_text(value->'passages') with ordinality as passage(text, position);
  result := item || jsonb_build_object('status', 'approved', 'updatedAt', value->>'now');
 elsif action='withdrawItem' then
  if item->>'status'<>'approved' then perform app_error('INVALID_STATUS'); end if;
  delete from knowledge_passages where item_id=item->>'id';
  result := item || jsonb_build_object('status', 'review', 'updatedAt', value->>'now');
 else
  raise exception 'Invalid knowledge operation';
 end if;
 update knowledge_items set data=result where id=item->>'id';
 return result;
end $$;
revoke all on function public.knowledge_operation(text, jsonb) from public, anon, authenticated;
grant execute on function public.knowledge_operation(text, jsonb) to service_role;

-- Private bucket for uploaded notes and recordings, 50 MB per file. No storage.objects
-- policies: only the service role reads or writes it. Skipped where Supabase Storage is absent.
do $bucket$
begin
 if to_regclass('storage.buckets') is not null then
  execute $insert$insert into storage.buckets (id, name, public, file_size_limit) values ('owner-knowledge', 'owner-knowledge', false, 52428800) on conflict (id) do nothing$insert$;
 end if;
end $bucket$;
