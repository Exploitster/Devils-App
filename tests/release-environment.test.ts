import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const script = fileURLToPath(new URL('../scripts/verify-release-environment.mjs', import.meta.url));
const production = {
  DEVILS_DEPLOYMENT_ENV: 'production', VERCEL_PROJECT_ID: 'prj_RtFOuKfu3erBBiaiU7uIuvGPndEt',
  DEVILS_SUPABASE_URL: 'https://fttulbecvnxlutpqjrky.supabase.co',
  DEVILS_APP_URL: 'https://www.devils-advocate.app', DEVILS_PAYMENTS_ENABLED: 'false',
};
const staging = { ...production, DEVILS_DEPLOYMENT_ENV: 'staging', VERCEL_PROJECT_ID: 'prj_testing',
  DEVILS_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  DEVILS_APP_URL: 'https://devils-advocate-testing.vercel.app' };
const run = (env: Record<string, string>) => spawnSync(process.execPath, [script], { env: { NODE_ENV: 'test', ...env }, encoding: 'utf8' });

describe('deployment isolation preflight', () => {
  it.each([production, staging])('allows the correctly isolated $DEVILS_DEPLOYMENT_ENV project', env => {
    const result = run(env); expect(result.status, result.stderr).toBe(0);
  });
  it.each([
    { ...staging, DEVILS_SUPABASE_URL: production.DEVILS_SUPABASE_URL },
    { ...staging, VERCEL_PROJECT_ID: production.VERCEL_PROJECT_ID },
    { ...staging, DEVILS_APP_URL: production.DEVILS_APP_URL },
    { ...production, DEVILS_SUPABASE_URL: staging.DEVILS_SUPABASE_URL },
    { ...production, VERCEL_PROJECT_ID: staging.VERCEL_PROJECT_ID },
    { ...production, DEVILS_APP_URL: staging.DEVILS_APP_URL },
    { ...staging, DEVILS_SUPABASE_URL: '' },
    { ...staging, DEVILS_DEPLOYMENT_ENV: '' },
    { ...staging, DEVILS_APP_URL: 'https://devils-advocate-testing.vercel.app/elsewhere' },
    { ...staging, DEVILS_SUPABASE_URL: 'https://fttulbecvnxlutpqjrky.supabase.co.evil.test' },
    { ...staging, DEVILS_PAYMENTS_ENABLED: 'true' },
  ])('blocks unsafe configuration %#', env => {
    const result = run(env); expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('RELEASE_ENVIRONMENT_BLOCKED');
  });
});
