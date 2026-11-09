import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readConfig } from '../src/lib/config';
import { assertStudioWritable, isOwner, requireOwner } from '../src/lib/studio/access';
import { GET, POST } from '../src/app/api/auth/route';

const local = { DEVILS_RUNTIME_MODE: 'local', DEVILS_LOCAL_AUTH_SECRET: 'a-development-signing-secret-with-32-characters' };
const config = readConfig({ ...local, DEVILS_OWNER_EMAILS: 'sam@example.test' });
describe('owner check', () => {
  it('requires a listed and confirmed email, in any letter case', () => {
    expect(isOwner({ id: 'u', email: 'sam@example.test', emailConfirmed: false }, config)).toBe(false);
    expect(isOwner({ id: 'u', email: 'alex@example.test', emailConfirmed: true }, config)).toBe(false);
    expect(isOwner({ id: 'u', email: ' SAM@Example.TEST ', emailConfirmed: true }, config)).toBe(true);
    expect(isOwner({ id: 'u', email: 'sam@example.test', emailConfirmed: true }, readConfig(local))).toBe(false);
  });
  it('makes the Studio read-only on the shared-data rehearsal site, leaving reads alone', () => {
    expect(() => assertStudioWritable(config)).not.toThrow();
    expect(() => assertStudioWritable({ ...config, sharedDataRehearsal: true })).toThrow(expect.objectContaining({ code: 'STUDIO_READ_ONLY', status: 403 }));
  });
});

const origin = 'http://127.0.0.1:3000'; let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'devils-studio-access-')); vi.stubEnv('DEVILS_RUNTIME_MODE', 'local'); vi.stubEnv('DEVILS_LOCAL_AUTH_SECRET', local.DEVILS_LOCAL_AUTH_SECRET); vi.stubEnv('DEVILS_SQLITE_PATH', join(dir, 'access.sqlite')); vi.stubEnv('DEVILS_APP_URL', origin); vi.stubEnv('NODE_ENV', 'test'); vi.stubEnv('DEVILS_PAYMENTS_ENABLED', 'false'); vi.stubEnv('DEVILS_OWNER_EMAILS', 'Sam@Example.test,second-owner@example.test'); });
afterEach(() => { vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
async function signIn(email: string) {
  const response = await POST(new Request(origin + '/api/auth', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify({ email }) }));
  return response.headers.get('set-cookie')!.split(';')[0];
}
const authed = (cookie: string) => new Request(origin + '/api/auth', { headers: { cookie } });
describe('owner access over requests', () => {
  it('lets the listed owner through and gives everyone else the standard not-found error', async () => {
    const owner = await signIn('sam@example.test'); const other = await signIn('alex@example.test');
    expect(await requireOwner(authed(owner))).toMatchObject({ email: 'sam@example.test', emailConfirmed: true });
    await expect(requireOwner(authed(other))).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    await expect(requireOwner(new Request(origin + '/api/auth'))).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
  });
  it('tells the browser whether the user is the owner without revealing the list', async () => {
    const ownerBody = await (await GET(authed(await signIn('sam@example.test')))).text();
    expect(JSON.parse(ownerBody).owner).toBe(true);
    const otherBody = await (await GET(authed(await signIn('alex@example.test')))).text();
    expect(JSON.parse(otherBody).owner).toBe(false);
    expect(JSON.parse(await (await GET(new Request(origin + '/api/auth'))).text()).owner).toBe(false);
    for (const body of [ownerBody, otherBody]) expect(body).not.toContain('second-owner@example.test');
  });
});
