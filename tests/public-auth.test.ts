import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { POST } from '../src/app/api/auth/account/route';
import { GET } from '../src/app/api/auth/route';
import { POST as createSession } from '../src/app/api/sessions/route';
const origin = 'http://127.0.0.1:3000'; let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'devils-public-auth-')); vi.stubEnv('DEVILS_RUNTIME_MODE', 'local'); vi.stubEnv('DEVILS_LOCAL_AUTH_SECRET', 'test-secret-'.repeat(4)); vi.stubEnv('DEVILS_SQLITE_PATH', join(dir, 'auth.sqlite')); vi.stubEnv('DEVILS_APP_URL', origin); vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('DEVILS_PAYMENTS_ENABLED', 'false'); });
afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
function request(body: unknown, cookie = '', requestOrigin = origin) { return new Request(origin + '/api/auth/account', { method: 'POST', headers: { origin: requestOrigin, cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
it('signs up a new user, grants free access, saves onboarding, signs in again and creates a conversation', async () => {
  const signup = await POST(request({ action: 'signup', email: 'new@example.test', password: 'a strong test password', name: 'Alex' }));
  expect(signup.status).toBe(200); const cookie = signup.headers.get('set-cookie')!.split(';')[0];
  expect((await (await GET(new Request(origin + '/api/auth', { headers: { cookie } }))).json()).access).toMatchObject({ allowed: true, reason: 'free' });
  expect((await POST(request({ action: 'complete-onboarding', name: 'Alex' }, cookie))).status).toBe(200);
  const signin = await POST(request({ action: 'signin', email: 'new@example.test', password: 'a strong test password' }));
  expect(signin.status).toBe(200);
  const signed = signin.headers.get('set-cookie')!.split(';')[0];
  expect((await (await GET(new Request(origin + '/api/auth', { headers: { cookie: signed } }))).json()).user).toMatchObject({ name: 'Alex', onboarded: true });
  const session = await createSession(new Request(origin + '/api/sessions', { method: 'POST', headers: { origin, cookie: signed, 'content-type': 'application/json' }, body: JSON.stringify({ mode: 'business', topic: 'startup' }) }));
  expect(session.status).toBe(201);
});
it('rejects weak signup, incorrect passwords, cross-origin writes, and unauthenticated password changes', async () => {
  expect((await POST(request({ action: 'signup', email: 'new@example.test', password: 'short', name: 'Alex' }))).status).toBe(400);
  expect((await POST(request({ action: 'signin', email: 'missing@example.test', password: 'not the password' }))).status).toBe(401);
  expect((await POST(request({ action: 'signup', email: 'new@example.test', password: 'long enough password' }, '', 'https://attacker.test'))).status).toBe(403);
  expect((await POST(request({ action: 'update-password', password: 'long enough password' }))).status).toBe(401);
});
it('removes local password credentials and the saved name when an account is deleted', async () => {
  const { DELETE } = await import('../src/app/api/account/route');
  const { getStore } = await import('../src/lib/auth/service');
  const { LocalStore } = await import('../src/lib/store/local');
  const signup = await POST(request({ action: 'signup', email: 'erase@example.test', password: 'a strong test password', name: 'Private name' }));
  const cookie = signup.headers.get('set-cookie')!.split(';')[0];
  const auth = await (await GET(new Request(origin + '/api/auth', { headers: { cookie } }))).json();
  const store = await getStore(new Request(origin + '/api/account', { headers: { cookie } }));
  expect(store).toBeInstanceOf(LocalStore);
  const deleted = await DELETE(new Request(origin + '/api/account', { method: 'DELETE', headers: { origin, cookie, 'content-type': 'application/json' }, body: JSON.stringify({ confirmation: 'DELETE' }) }));
  expect(deleted.status).toBe(200);
  expect((store as InstanceType<typeof LocalStore>).getCredential('erase@example.test')).toBeNull();
  expect((await store.getProfile(auth.user.id))?.name).toBeUndefined();
});
