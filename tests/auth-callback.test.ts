import { afterEach, expect, it, vi } from 'vitest';
vi.mock('@supabase/ssr', async importOriginal => {
  const actual = await importOriginal<typeof import('@supabase/ssr')>();
  return { ...actual, createServerClient: (_url: string, _key: string, options: { cookies: { setAll: (cookies: unknown[]) => void } }) => ({
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      exchangeCodeForSession: async () => {
        options.cookies.setAll([{ name: 'sb-test-session', value: 'verified-session', options: {} }]);
        return { error: null };
      },
      getUser: async () => ({ data: { user: { id: 'verified-id', email: 'test@example.test' } }, error: null }),
    },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ error: new Error('temporary profile outage') }) }) }) }),
  }) };
});
import { GET } from '../src/app/auth/callback/route';
afterEach(() => vi.unstubAllEnvs());
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
