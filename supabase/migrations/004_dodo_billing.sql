-- Add a fenced save without replacing existing Stripe or billing data.
create or replace function public.billing_context_save_guarded(context jsonb, guard jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(context->>'userId',901));
 perform 1 from billing_sync_leases where customer_id=guard->>'key'
  and token=guard->>'token' and expires_at>extract(epoch from clock_timestamp())*1000 for update;
 if not found then raise exception 'Billing lease expired';end if;
 insert into billing_context values ((context->>'userId')::uuid,context)
 on conflict(user_id) do update set data=excluded.data;
 return context;
end $$;
revoke all on function public.billing_context_save_guarded(jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.billing_context_save_guarded(jsonb,jsonb) to service_role;
