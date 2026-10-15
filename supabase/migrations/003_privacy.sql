-- Account closure keeps a pseudonymous profile as the foreign-key anchor for
-- subscription reconciliation and provider-attempt spend. It is independent of
-- auth.users so deleting the authentication identity cannot erase accounting.
-- Enforce the privacy state invariant even for privileged server writes.
alter table public.profiles add constraint profile_deletion_state_private check (
  coalesce(data->>'deletionState','') in ('none','pending','complete')
  and (data->>'deletionState' = 'none' or coalesce(data->'disabled' = 'true'::jsonb,false))
  and (data->>'deletionState' <> 'complete' or coalesce(data->>'email' = '',false))
);
comment on table public.profiles is 'Account closure retains a disabled pseudonymous anchor; complete deletion requires an empty email.';
comment on table public.spend_attempts is 'Retained provider cost accounting without conversation text; deletion must not reset the global spend budget.';
comment on table public.billing_context is 'Service-only retained provider/customer links for billing reconciliation; no conversation text or email.';
-- The owner profile remains readable for authenticated closure retries. Its RLS
-- predicate is nonrecursive, so checking it requires no privileged helper.
-- A still-valid JWT must not expose private content after access is disabled.
alter policy owner_read on public.sessions using (
 user_id=auth.uid() and exists(select 1 from public.profiles p
 where p.user_id=auth.uid() and p.data->'disabled'='false'::jsonb)
);
alter policy owner_read on public.turn_operations using (
 user_id=auth.uid() and exists(select 1 from public.profiles p
 where p.user_id=auth.uid() and p.data->'disabled'='false'::jsonb)
);
alter policy owner_read on public.usage_events using (
 user_id=auth.uid() and exists(select 1 from public.profiles p
 where p.user_id=auth.uid() and p.data->'disabled'='false'::jsonb)
);
