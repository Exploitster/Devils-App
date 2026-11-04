import { createServer, type Server } from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const moduleUrl = new URL('../scripts/smoke-deployment.mjs', import.meta.url).href;
let server: Server;
let localOrigin: string;
let scenario = 'healthy';
let smoke: (origin: string, fetcher: typeof fetch) => Promise<void>;
beforeAll(async () => {
  ({ smokeDeployment: smoke } = await import(moduleUrl));
  server = createServer((request, response) => {
    const path = request.url;
    if (scenario === 'network' && path === '/login') { response.destroy(); return; }
    if (scenario === 'redirect' && path === '/login') { response.writeHead(302, { location: '/' }); response.end(); return; }
    let status = path === '/api/sessions' ? 401 : 200;
    let body = path === '/login' ? 'Welcome back' : 'Devils Advocate';
    if (path === '/api/health') body = JSON.stringify({ status: 'ok', configured: true, runtimeMode: 'services' });
    if (path === '/api/auth') body = JSON.stringify({ user: null, config: { runtimeMode: 'services' } });
    if (scenario === 'starter' && path === '/login') { status = 404; body = 'NOT_FOUND'; }
    if (scenario === 'generic' && path === '/login') body = 'Starter website';
    if (scenario === 'unconfigured' && path === '/api/health') { status = 503; body = '{}'; }
    if (scenario === 'false-health' && path === '/api/health') body = JSON.stringify({ status: 'ok', configured: false, runtimeMode: 'services' });
    if (scenario === 'malformed-auth' && path === '/api/auth') body = '{';
    if (scenario === 'identified' && path === '/api/auth') body = JSON.stringify({ user: { id: 'unexpected-user' }, config: { runtimeMode: 'services' } });
    if (scenario === 'open-private-api' && path === '/api/sessions') status = 200;
    response.writeHead(status); response.end(body);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture server did not listen.');
  localOrigin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
const localFetch: typeof fetch = (input, options) => fetch(new URL(new URL(String(input)).pathname, localOrigin), options);

describe('release HTTP checks with real local HTTP responses', () => {
  it('executes the CLI entry point and rejects an unsafe origin before fetching', () => {
    const result = spawnSync(process.execPath, [fileURLToPath(moduleUrl), 'http://invalid.test'], { env: { NODE_ENV: 'test' }, encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Use a canonical HTTPS Vercel deployment origin.');
  });
  it('accepts a configured hosted app with private APIs protected', async () => {
    scenario = 'healthy'; await expect(smoke('https://candidate.vercel.app', localFetch)).resolves.toBeUndefined();
  });
  it.each(['starter', 'generic', 'unconfigured', 'false-health', 'malformed-auth', 'identified', 'open-private-api', 'redirect', 'network'])('rejects %s without declaring the candidate healthy', async value => {
    scenario = value; await expect(smoke('https://candidate.vercel.app', localFetch)).rejects.toThrow();
  });
});
