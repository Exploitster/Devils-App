import { afterEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ profileError: true, recovery: false }));
vi.mock('@supabase/ssr', async importOriginal => {
  const actual = await importOriginal<typeof import('@supabase/ssr')>();
  return { ...actual, createServerClient: (_url: string, _key: string, options: { cookies: { setAll: (cookies: unknown[]) => void } }) => ({
    auth: {
      onAuthStateChange: (fn: (event: string) => void) => { if (state.recovery) fn('PASSWORD_RECOVERY'); return { data: { subscription: { unsubscribe() {} } } }; },
      exchangeCodeForSession: async () => {
        options.cookies.setAll([{ name: 'sb-test-session', value: 'verified-session', options: {} }]);
        return { error: null };
      },
      signUp: async () => ({ data: { session: null }, error: null }),
      resend: async () => ({ error: null }),
      getUser: async () => ({ data: { user: { id: 'verified-id', email: 'test@example.test' } }, error: null }),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => (state.profileError ? { error: new Error('temporary profile outage') } : { data: { data: { disabled: false } }, error: null }) }) }) }),
  }) };
});
import { GET } from '../src/app/auth/callback/route';
import { POST as authenticate } from '../src/app/api/auth/account/route';
afterEach(() => { vi.unstubAllEnvs(); state.profileError = true; state.recovery = false; });
function services() {
  vi.stubEnv('DEVILS_RUNTIME_MODE', 'services'); vi.stubEnv('DEVILS_MODEL_PROVIDER', 'gateway');
  vi.stubEnv('DEVILS_SUPABASE_URL', 'https://project.supabase.co'); vi.stubEnv('DEVILS_SUPABASE_ANON_KEY', 'test-anon');
  vi.stubEnv('DEVILS_SUPABASE_SERVICE_ROLE_KEY', 'test-service'); vi.stubEnv('DEVILS_APP_URL', 'https://app.example.test');
}
it('preserves session cookies and a usable error redirect when profile loading fails after code exchange', async () => {
  vi.stubEnv('DEVILS_RUNTIME_MODE', 'services');
  vi.stubEnv('DEVILS_MODEL_PROVIDER', 'gateway');
  vi.stubEnv('DEVILS_SUPABASE_URL', 'https://project.supabase.co');
  vi.stubEnv('DEVILS_SUPABASE_ANON_KEY', 'test-anon');
  vi.stubEnv('DEVILS_SUPABASE_SERVICE_ROLE_KEY', 'test-service');
  vi.stubEnv('DEVILS_APP_URL', 'https://app.example.test');
  const response = await GET(new Request('https://app.example.test/auth/callback?code=synthetic-code'));
  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('https://app.example.test/login?error=callback');
  expect(response.headers.get('set-cookie')).toContain('sb-test-session=verified-session');
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('vary')).toBe('Cookie');
});

it('exchanges the session and consumes billing intent without changing the registered callback URL', async () => {
  services(); state.profileError = false;
  const response = await GET(new Request('https://app.example.test/auth/callback?code=synthetic-code', { headers: { cookie: 'devils-auth-next=billing' } }));
  expect(response.status).toBe(303);
  expect(response.headers.get('location')).toBe('https://app.example.test/billing');
  expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
  expect(response.headers.get('set-cookie')).toContain('sb-test-session=verified-session');
});
it('a recovery session takes precedence over billing intent', async () => {
  services(); state.profileError = false; state.recovery = true;
  const response = await GET(new Request('https://app.example.test/auth/callback?code=synthetic-code', { headers: { cookie: 'devils-auth-next=billing' } }));
  expect(response.headers.get('location')).toBe('https://app.example.test/reset-password');
});

it.each(['signup', 'resend'] as const)('the emitted %s cookie survives the real account API and callback chain', async action => {
  services(); state.profileError = false;
  const response = await authenticate(new Request('https://app.example.test/api/auth/account', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://app.example.test' },
    body: JSON.stringify({ action, email: 'new@example.test', next: '/billing', ...(action === 'signup' ? { name: 'New', password: 'a long unique password' } : {}) }),
  }));
  expect(response.status).toBe(200);
  const cookie = response.headers.get('set-cookie')!.split(';', 1)[0];
  expect(cookie).toBe('devils-auth-next=billing');
  const returned = await GET(new Request('https://app.example.test/auth/callback?code=synthetic-code', { headers: { cookie } }));
  expect(returned.headers.get('location')).toBe('https://app.example.test/billing');
  expect(returned.headers.get('set-cookie')).toContain('devils-auth-next=; Max-Age=0');
  expect(returned.headers.get('set-cookie')).toContain('sb-test-session=verified-session');
});
it('callback failure preserves the billing destination and exchanged session while clearing intent', async () => {
  services();
  const response = await GET(new Request('https://app.example.test/auth/callback?code=synthetic-code', { headers: { cookie: 'devils-auth-next=billing' } }));
  expect(response.headers.get('location')).toBe('https://app.example.test/login?error=callback&next=%2Fbilling');
  expect(response.headers.get('set-cookie')).toContain('devils-auth-next=; Max-Age=0');
  expect(response.headers.get('set-cookie')).toContain('sb-test-session=verified-session');
});
