import { expect, it, vi } from 'vitest';
import { SupabaseAuth, type SupabaseContext } from '../src/lib/auth/supabase';
import { AccountAuthSchema } from '../src/lib/contracts';
import { readConfig } from '../src/lib/config';
function setup(existing: unknown = null, google = true) {
  const user = { id: 'verified-provider-id', email: 'verified@example.test', user_metadata: { id: 'forged-metadata-id', display_name: 'Alex', devils_onboarded: true } };
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const getUser = vi.fn().mockResolvedValue({ data: { user }, error: null });
  const signUp = vi.fn().mockResolvedValue({ data: { session: null }, error: null });
  const signInWithOAuth = vi.fn().mockResolvedValue({ data: { url: 'https://project.supabase.co/auth/v1/authorize?provider=google' }, error: null });
  const resend = vi.fn().mockResolvedValue({ error: null });
  const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
  let authEvent: ((event: string) => void) | undefined;
  const onAuthStateChange = vi.fn((callback: (event: string) => void) => { authEvent = callback; return { data: { subscription: { unsubscribe: vi.fn() } } }; });
  const exchangeCodeForSession = vi.fn(async () => { authEvent?.('PASSWORD_RECOVERY'); return { data: { session: {} }, error: null }; });
  const client = { auth: { getUser, signUp, signInWithOAuth, resend, resetPasswordForEmail, exchangeCodeForSession, onAuthStateChange }, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: existing, error: null }) }) }) }) };
  const context = { client, admin: { from: () => ({ upsert }) }, cookies: [], headers: {} } as unknown as SupabaseContext;
  const cfg = { ...readConfig({ DEVILS_RUNTIME_MODE: 'local', DEVILS_LOCAL_AUTH_SECRET: 'x'.repeat(32) }), supabaseUrl: 'https://project.supabase.co', supabaseAnonKey: 'synthetic-anon', appUrl: 'https://app.example.test' };
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ external: { google } })));
  return { auth: new SupabaseAuth(cfg, context, fetcher), upsert, getUser, signUp, signInWithOAuth, resend, resetPasswordForEmail };
}
it('bootstraps only the verified identity with an insert that cannot overwrite disabled profiles', async () => {
  const { auth, upsert } = setup();
  expect(await auth.getIdentity()).toMatchObject({ id: 'verified-provider-id', email: 'verified@example.test', name: 'Alex', onboarded: true });
  expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'verified-provider-id', data: expect.objectContaining({ id: 'verified-provider-id', disabled: false }) }), { onConflict: 'user_id', ignoreDuplicates: true });
  const disabled = setup({ data: { disabled: true, deletionState: 'pending' } });
  await disabled.auth.getIdentity(); expect(disabled.upsert).not.toHaveBeenCalled();
});
it('uses the SDK Google PKCE flow and fails gracefully when its provider is not configured', async () => {
  const active = setup();
  expect(await (await active.auth.authenticate({ action: 'google' }, new Request('https://app.example.test'))).json()).toHaveProperty('url');
  expect(active.signInWithOAuth).toHaveBeenCalledWith({ provider: 'google', options: { redirectTo: 'https://app.example.test/auth/callback', skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } } });
  const missing = setup(null, false);
  await expect(missing.auth.authenticate({ action: 'google' }, new Request('https://app.example.test'))).rejects.toMatchObject({ code: 'AUTH_UNAVAILABLE' });
  expect(missing.signInWithOAuth).not.toHaveBeenCalled();
});
it('requires email confirmation without creating an application profile from unverified signup data', async () => {
  const { auth, signUp, getUser, upsert } = setup();
  const response = await auth.authenticate({ action: 'signup', email: 'new@example.test', password: 'a long unique password', name: 'New user' }, new Request('https://app.example.test'));
  expect(await response.json()).toMatchObject({ signedIn: false, confirmationRequired: true });
  expect(signUp).toHaveBeenCalledWith(expect.objectContaining({ options: { emailRedirectTo: 'https://app.example.test/auth/callback', data: { display_name: 'New user' } } }));
  expect(getUser).not.toHaveBeenCalled(); expect(upsert).not.toHaveBeenCalled();
});

it('uses the registered callback URL for password recovery and preserves the SDK recovery flow marker', async () => {
  const { auth, resetPasswordForEmail } = setup();
  await auth.authenticate({ action: 'reset', email: 'verified@example.test' }, new Request('https://app.example.test'));
  expect(resetPasswordForEmail).toHaveBeenCalledWith('verified@example.test', { redirectTo: 'https://app.example.test/auth/callback' });
  expect(await auth.callback('synthetic-code')).toBe('recovery');
});

it('carries a validated billing destination through Google and email confirmation', async () => {
  const { auth, signInWithOAuth, signUp, resend } = setup();
  const response = await auth.authenticate({ action: 'google', next: '/billing' }, new Request('https://app.example.test'));
  expect(response.headers.get('set-cookie')).toContain('devils-auth-next=billing');
  expect(response.headers.get('set-cookie')).toContain('HttpOnly');
  expect(signInWithOAuth).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({ redirectTo: 'https://app.example.test/auth/callback' }) }));
  const signup = await auth.authenticate({ action: 'signup', email: 'new@example.test', password: 'a long unique password', name: 'New', next: '/billing' }, new Request('https://app.example.test'));
  for (const value of ['devils-auth-next=billing', 'Path=/auth/callback', 'Max-Age=3600', 'Secure', 'HttpOnly', 'SameSite=Lax']) expect(signup.headers.get('set-cookie')).toContain(value);
  const resent = await auth.authenticate({ action: 'resend', email: 'new@example.test', next: '/billing' }, new Request('https://app.example.test'));
  for (const value of ['devils-auth-next=billing', 'Path=/auth/callback', 'Max-Age=3600', 'Secure', 'HttpOnly', 'SameSite=Lax']) expect(resent.headers.get('set-cookie')).toContain(value);
  expect(resend).toHaveBeenCalledWith({ type: 'signup', email: 'new@example.test', options: { emailRedirectTo: 'https://app.example.test/auth/callback' } });
  expect(signUp).toHaveBeenCalledWith(expect.objectContaining({ options: expect.objectContaining({ emailRedirectTo: 'https://app.example.test/auth/callback' }) }));
});

it('rejects external and unexpected subscription return destinations at the input boundary', () => {
  for (const next of ['https://evil.example', '//evil.example', '/account', '/billing?plan=annual']) {
    expect(AccountAuthSchema.safeParse({ action: 'google', next }).success).toBe(false);
  }
  expect(AccountAuthSchema.safeParse({ action: 'google', next: '/billing' }).success).toBe(true);
});
