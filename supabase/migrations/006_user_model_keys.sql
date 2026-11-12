-- A person's own AI provider key (bring your own Claude or GPT). One row per account.
-- The app server encrypts the key before it is stored; the database never holds it in
-- the clear. Only the server's service role reaches this table. This migration only adds
-- objects; until it runs, every conversation uses the app's own AI.
create table public.user_model_keys (
 user_id uuid primary key references public.profiles(user_id) on delete cascade,
 data jsonb not null,
 updated_at timestamptz not null
);
alter table public.user_model_keys enable row level security;
revoke all on public.user_model_keys from anon, authenticated;
grant all on public.user_model_keys to service_role;
