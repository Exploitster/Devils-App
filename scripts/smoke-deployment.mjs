import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// Read-only checks: no signup, email, model calls, payments or customer data.
export async function smokeDeployment(origin, fetcher = fetch) {
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.origin !== origin || (!base.hostname.endsWith('.vercel.app') && origin !== 'https://www.devils-advocate.app')) {
    throw new Error('Use a canonical HTTPS Vercel deployment origin.');
  }
  const headers = process.env.VERCEL_AUTOMATION_BYPASS_SECRET
    ? { 'x-vercel-protection-bypass': process.env.VERCEL_AUTOMATION_BYPASS_SECRET } : {};
  async function request(path, status) {
    const response = await fetcher(new URL(path, base), { headers, redirect: 'error', signal: AbortSignal.timeout(20000), cache: 'no-store' });
    if (response.status !== status) {
      await response.body?.cancel();
      throw new Error(`Deployment check failed: ${path} expected ${status}, received ${response.status}.`);
    }
    return response;
  }
  await (await request('/', 200)).body?.cancel();
  const login = await (await request('/login', 200)).text();
  if (!login.includes('Welcome back')) throw new Error('Deployment check failed: sign-in page is missing.');
  const health = await (await request('/api/health', 200)).json();
  if (health.status !== 'ok' || health.configured !== true || health.runtimeMode !== 'services') throw new Error('Deployment check failed: backend is not configured for hosted services.');
  const auth = await (await request('/api/auth', 200)).json();
  if (auth.user !== null || auth.config?.runtimeMode !== 'services') throw new Error('Deployment check failed: anonymous authentication contract changed.');
  await (await request('/api/sessions', 401)).body?.cancel();
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await smokeDeployment(process.argv[2]);
  console.log('Deployment checks passed: homepage, sign-in, configured backend and anonymous access boundary.');
}
