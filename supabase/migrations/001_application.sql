-- Server-generated data is readable by its owner, but writable only by server RPC.
-- Never expose the service-role key. Public Supabase registration must be disabled.
create table public.profiles (user_id uuid primary key, data jsonb not null);
create table public.invites (user_id uuid primary key references public.profiles(user_id), data jsonb not null);
create table public.subscriptions (user_id uuid primary key references public.profiles(user_id), data jsonb not null);
create table public.sessions (id text primary key, user_id uuid not null references public.profiles(user_id), data jsonb not null, unique(user_id,id));
create table public.turn_operations (user_id uuid not null, session_id text not null, id text not null, data jsonb not null, primary key(user_id,id), foreign key(user_id,session_id) references public.sessions(user_id,id) on delete cascade);
create table public.usage_events (user_id uuid not null, session_id text not null, id text not null, data jsonb not null, primary key(user_id,id), foreign key(user_id,session_id) references public.sessions(user_id,id) on delete cascade);
create table public.submissions (id bigint generated always as identity primary key, user_id uuid not null references public.profiles(user_id), submitted_at timestamptz not null);
-- Spend and billing metadata survive conversation deletion; these contain no text.
create table public.spend_attempts (id text primary key, user_id uuid not null references public.profiles(user_id), data jsonb not null);
create table public.webhook_events (id text primary key, data jsonb not null);

alter table public.profiles enable row level security;
alter table public.invites enable row level security;
alter table public.subscriptions enable row level security;
alter table public.sessions enable row level security;
alter table public.turn_operations enable row level security;
alter table public.usage_events enable row level security;
alter table public.submissions enable row level security;
alter table public.spend_attempts enable row level security;
alter table public.webhook_events enable row level security;
create policy owner_read on public.profiles for select to authenticated using(user_id=auth.uid());
create policy owner_read on public.invites for select to authenticated using(user_id=auth.uid());
create policy owner_read on public.subscriptions for select to authenticated using(user_id=auth.uid());
create policy owner_read on public.sessions for select to authenticated using(user_id=auth.uid());
create policy owner_read on public.turn_operations for select to authenticated using(user_id=auth.uid());
create policy owner_read on public.usage_events for select to authenticated using(user_id=auth.uid());
create policy owner_read on public.spend_attempts for select to authenticated using(user_id=auth.uid());
revoke all on public.profiles,public.invites,public.subscriptions,public.sessions,public.turn_operations,public.usage_events,public.submissions,public.spend_attempts,public.webhook_events from anon,authenticated;
grant select on public.profiles,public.invites,public.subscriptions,public.sessions,public.turn_operations,public.usage_events,public.spend_attempts to authenticated;
grant all on public.profiles,public.invites,public.subscriptions,public.sessions,public.turn_operations,public.usage_events,public.submissions,public.spend_attempts,public.webhook_events to service_role;
grant usage,select on sequence public.submissions_id_seq to service_role;

create function public.app_error(code text) returns void language plpgsql set search_path=public,pg_temp as $$ begin raise exception '%',code using errcode='P0001'; end; $$;
revoke all on function public.app_error(text) from public,anon,authenticated;

-- p_owner is derived by the server from getUser(), never from the submitted body.
-- Execute is deliberately denied to anon/authenticated: they cannot forge cards,
-- usage, invitations, subscription state, or privileged administration.
create function public.app_store(p_method text,p_args jsonb,p_owner uuid default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare u uuid; sid text; oid text; s jsonb; op jsonb; v jsonb; old jsonb; moment timestamptz; total bigint; count_recent integer;
begin
 u:=nullif(p_args->>'userId','')::uuid; sid:=p_args->>'sessionId';oid:=p_args->>'operationId';
 if p_method in ('createSession','listSessions','getSession','renameSession','deleteSession','reserveTurn','commitTurn','failTurn','cancelTurn','getOperation','listUsage','beginAccountDeletion','deleteAccountData') then
   if p_owner is null or u is distinct from p_owner then perform app_error('NOT_FOUND');end if;
 end if;
 -- A user lock serializes revision changes, deletion, reservation and lease recovery.
 if u is not null then perform pg_advisory_xact_lock(hashtextextended(u::text,0));end if;
 if p_method in ('createSession','renameSession','reserveTurn','commitTurn') then
   if not exists(select 1 from profiles where user_id=u and not coalesce((data->>'disabled')::boolean,true)) then perform app_error('NOT_FOUND');end if;
 end if;
 if p_method in ('getSession','renameSession','deleteSession','reserveTurn','commitTurn','failTurn','cancelTurn','getOperation') then
   select data into s from sessions where id=sid and user_id=u for update;
   if s is null then perform app_error('NOT_FOUND');end if;
 end if;
 case p_method
 when 'getProfile' then select data into v from profiles where user_id=u;
 when 'putProfile' then v:=p_args->'profile';insert into profiles values((v->>'id')::uuid,v) on conflict(user_id) do update set data=excluded.data;
 when 'getInvite' then select data into v from invites where user_id=u;
 when 'putInvite' then v:=p_args->'invite';insert into invites values((v->>'userId')::uuid,v) on conflict(user_id) do update set data=excluded.data;
 when 'getSubscription' then select data into v from subscriptions where user_id=u;
 when 'putSubscription' then v:=p_args->'subscription';insert into subscriptions values((v->>'userId')::uuid,v) on conflict(user_id) do update set data=excluded.data where (subscriptions.data->>'updatedAt')::timestamptz<=(excluded.data->>'updatedAt')::timestamptz;
 when 'findUserByCustomer' then select p.data into v from profiles p join subscriptions b using(user_id) where b.data->>'customerId'=p_args->>'customerId';
 when 'createSession' then
   sid:=gen_random_uuid()::text;v:=jsonb_build_object('id',sid,'ownerId',u,'mode',coalesce(p_args->'input'->>'mode','business'),'topic',p_args->'input'->>'topic','title',coalesce(p_args->'input'->>'title','Untitled conversation'),'revision',0,'state',jsonb_build_object('phase','description','position','','underlyingQuestion','','clarifications','[]'::jsonb,'strengths','[]'::jsonb,'counterpoints','[]'::jsonb,'openQuestions','[]'::jsonb,'nextStep','','usedArgumentIds','[]'::jsonb,'usedEvidenceIds','[]'::jsonb,'summary',''),'messages','[]'::jsonb,'cards','[]'::jsonb,'createdAt',p_args->>'now','updatedAt',p_args->>'now');insert into sessions values(sid,u,v);
 when 'listSessions' then select coalesce(jsonb_agg(data order by data->>'updatedAt' desc),'[]'::jsonb) into v from sessions where user_id=u;
 when 'getSession' then v:=s;
 when 'renameSession' then
   if (s->>'revision')::integer<>(p_args->>'expectedRevision')::integer then perform app_error('REVISION_CONFLICT');end if;
   v:=s||jsonb_build_object('title',p_args->>'title','revision',(s->>'revision')::integer+1,'updatedAt',p_args->>'now');update sessions set data=v where id=sid and user_id=u;
 when 'deleteSession' then delete from sessions where id=sid and user_id=u;
 when 'reserveTurn' then
   select data into op from turn_operations where user_id=u and id=oid;
   if op is not null then
     if op->>'sessionId'<>sid or op->>'fingerprint'<>p_args->>'fingerprint' then perform app_error('IDEMPOTENCY_CONFLICT');end if;
     return jsonb_build_object('kind','duplicate','operation',op,'session',s);
   end if;
   moment:=(p_args->>'now')::timestamptz;
   update turn_operations set data=data||jsonb_build_object('status','failed','errorCode','LEASE_EXPIRED') where user_id=u and data->>'status'='pending' and (data->>'leaseExpiresAt')::timestamptz<=moment;
   if exists(select 1 from turn_operations where user_id=u and data->>'status'='pending') then perform app_error('TURN_IN_PROGRESS');end if;
   if (s->>'revision')::integer<>(p_args->>'expectedRevision')::integer or (p_args->>'leaseExpiresAt')::timestamptz<=moment then perform app_error('REVISION_CONFLICT');end if;
   select count(*) into count_recent from submissions where user_id=u and submitted_at>moment-interval '1 minute';if count_recent>=10 then perform app_error('RATE_LIMITED');end if;
   op:=jsonb_build_object('id',oid,'userId',u,'sessionId',sid,'fingerprint',p_args->>'fingerprint','expectedRevision',(p_args->>'expectedRevision')::integer,'status','pending','leaseExpiresAt',p_args->>'leaseExpiresAt','createdAt',p_args->>'now');insert into turn_operations values(u,sid,oid,op);insert into submissions(user_id,submitted_at)values(u,moment);v:=jsonb_build_object('kind','reserved','operation',op,'session',s);
 when 'commitTurn' then
   select data into op from turn_operations where user_id=u and id=oid and session_id=sid for update;
   if op->>'status'='committed' then return s;end if;
   if op is null or op->>'status'<>'pending' or (op->>'leaseExpiresAt')::timestamptz<=(p_args->>'now')::timestamptz or (op->>'expectedRevision')::integer<>(p_args->>'expectedRevision')::integer or (s->>'revision')::integer<>(p_args->>'expectedRevision')::integer then perform app_error('REVISION_CONFLICT');end if;
   v:=s||jsonb_build_object('state',p_args->'state','messages',(s->'messages')||coalesce(p_args->'messages','[]'::jsonb),'revision',(s->>'revision')::integer+1,'updatedAt',p_args->>'now');
   if p_args->'card' is not null and p_args->'card'<>'null'::jsonb then
     if (p_args->'card'->>'sessionRevision')::integer<>(v->>'revision')::integer then perform app_error('REVISION_CONFLICT');end if;
     v:=v||jsonb_build_object('cards',(s->'cards')||jsonb_build_array(p_args->'card'));
   end if;
   update sessions set data=v where id=sid and user_id=u;update turn_operations set data=op||jsonb_build_object('status','committed','resultRevision',(v->>'revision')::integer) where user_id=u and id=oid;
   insert into usage_events values(u,sid,oid,(p_args->'usage')||jsonb_build_object('operationId',oid,'userId',u,'sessionId',sid,'committedAt',p_args->>'now')) on conflict do nothing;
 when 'failTurn','cancelTurn' then
   if exists(select 1 from turn_operations where user_id=u and id=oid and session_id<>sid) then perform app_error('NOT_FOUND');end if;
   update turn_operations set data=data||jsonb_build_object('status',case p_method when 'failTurn' then 'failed' else 'cancelled' end,'errorCode',p_args->>'code') where user_id=u and session_id=sid and id=oid and data->>'status'='pending';
 when 'getOperation' then
   if exists(select 1 from turn_operations where user_id=u and id=oid and session_id<>sid) then perform app_error('NOT_FOUND');end if;
   select data into v from turn_operations where user_id=u and id=oid and session_id=sid;
 when 'listUsage' then select coalesce(jsonb_agg(data),'[]'::jsonb) into v from usage_events where user_id=u and (data->>'committedAt')::timestamptz>=(p_args->>'since')::timestamptz;
 when 'reserveSpend' then
   perform pg_advisory_xact_lock(hashtextextended('devils-spend',0));v:=p_args->'attempt';select data into old from spend_attempts where id=v->>'id';
   if old is not null then if old<>v then perform app_error('IDEMPOTENCY_CONFLICT');end if;return null;end if;
   select coalesce(sum(coalesce((data->>'actualMicros')::bigint,(data->>'reservedMicros')::bigint)),0) into total from spend_attempts where left(data->>'createdAt',10)=left(v->>'createdAt',10);
   if (v->>'reservedMicros')::bigint<0 or total+(v->>'reservedMicros')::bigint>(p_args->>'dailyLimitMicros')::bigint then perform app_error('SPEND_LIMIT');end if;
   insert into spend_attempts values(v->>'id',(v->>'userId')::uuid,v);
 when 'reconcileSpend' then
   perform pg_advisory_xact_lock(hashtextextended('devils-spend',0));select data into old from spend_attempts where id=p_args->>'attemptId' for update;if old is null then perform app_error('NOT_FOUND');end if;
   if (p_args->>'actualMicros')::bigint<0 then perform app_error('INVALID_SPEND');end if;
   update spend_attempts set data=old||jsonb_build_object('actualMicros',greatest((p_args->>'actualMicros')::bigint,coalesce((old->>'actualMicros')::bigint,0))) where id=p_args->>'attemptId';
 when 'beginWebhook' then
   perform pg_advisory_xact_lock(hashtextextended('devils-webhooks',0));oid:=p_args->>'eventId';select data into old from webhook_events where id=oid for update;
   if old is not null and (old->>'status'='complete' or (old->>'status'='processing' and (old->>'leaseExpiresAt')::timestamptz>(p_args->>'now')::timestamptz)) then return '"duplicate"'::jsonb;end if;
   v:=jsonb_build_object('id',oid,'status','processing','leaseExpiresAt',p_args->>'leaseExpiresAt','attempts',coalesce((old->>'attempts')::integer,0)+1);insert into webhook_events values(oid,v) on conflict(id) do update set data=excluded.data;return '"process"'::jsonb;
 when 'completeWebhook' then
   perform pg_advisory_xact_lock(hashtextextended('devils-webhooks',0));oid:=p_args->>'eventId';select data into old from webhook_events where id=oid for update;if old is null then perform app_error('NOT_FOUND');end if;
   v:=p_args->'subscription';if v is not null and v<>'null'::jsonb then insert into subscriptions values((v->>'userId')::uuid,v) on conflict(user_id) do update set data=excluded.data where (subscriptions.data->>'updatedAt')::timestamptz<=(excluded.data->>'updatedAt')::timestamptz;end if;update webhook_events set data=old||jsonb_build_object('status','complete') where id=oid;
 when 'failWebhook' then
   perform pg_advisory_xact_lock(hashtextextended('devils-webhooks',0));update webhook_events set data=data||jsonb_build_object('status','failed') where id=p_args->>'eventId' and data->>'status'<>'complete';
 when 'beginAccountDeletion' then
   update profiles set data=data||jsonb_build_object('disabled',true,'deletionState','pending') where user_id=u;if not found then perform app_error('NOT_FOUND');end if;
   update turn_operations set data=data||jsonb_build_object('status','cancelled') where user_id=u and data->>'status'='pending';
 when 'deleteAccountData' then
   select data into old from profiles where user_id=u;if old is null then perform app_error('NOT_FOUND');end if;if not (old->>'disabled')::boolean then perform app_error('REVISION_CONFLICT');end if;
   delete from sessions where user_id=u;delete from invites where user_id=u;delete from submissions where user_id=u;update profiles set data=old||jsonb_build_object('deletionState','complete','email','') where user_id=u;
 else perform app_error('INVALID_OPERATION');
 end case;
 return v;
end; $$;
revoke all on function public.app_store(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.app_store(text,jsonb,uuid) to service_role;
