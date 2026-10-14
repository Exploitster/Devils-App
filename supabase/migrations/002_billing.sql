-- Only the server's service role may access durable customer and checkout authority.
create table public.billing_context (user_id uuid primary key references public.profiles(user_id), data jsonb not null);
create unique index billing_customer_unique on public.billing_context ((data->>'customerId')) where data->>'customerId' is not null;
alter table public.billing_context enable row level security;
revoke all on public.billing_context from anon, authenticated;
create or replace function public.billing_context_operation(action text,value jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare old jsonb; result jsonb;
begin
 if action='customer' then select data into result from billing_context where data->>'customerId'=value->>'customerId';return result;end if;
 if action='get' then select data into result from billing_context where user_id=(value->>'userId')::uuid;return result;end if;
 perform pg_advisory_xact_lock(hashtextextended(value->>'userId',901));
 select data into old from billing_context where user_id=(value->>'userId')::uuid for update;
 if action='claim' then
 if old is not null and (old->>'expiresAt')::bigint > extract(epoch from clock_timestamp())*1000 then return old;end if;
 result:=value;if old->>'customerId' is not null then result:=result||jsonb_build_object('customerId',old->>'customerId');end if;
 elsif action='save' then result:=value;
 else raise exception 'Invalid billing operation';end if;
 insert into billing_context values ((value->>'userId')::uuid,result) on conflict(user_id) do update set data=excluded.data;
 return result;
end $$;
revoke all on function public.billing_context_operation(text,jsonb) from public, anon, authenticated;
grant execute on function public.billing_context_operation(text,jsonb) to service_role;
