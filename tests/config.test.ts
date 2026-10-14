import { describe, expect, it } from 'vitest';
import { readConfig, publicConfig } from '../src/lib/config';
const services = { DEVILS_SUPABASE_URL: 'https://example.supabase.co', DEVILS_SUPABASE_ANON_KEY: 'public', DEVILS_SUPABASE_SERVICE_ROLE_KEY: 'privileged-role-secret', DEVILS_MODEL_API_KEY: 'provider-secret', DEVILS_MODEL: 'configured-model', DEVILS_MODEL_INPUT_USD_PER_MILLION: '1.2', DEVILS_MODEL_OUTPUT_USD_PER_MILLION: '4.5', DEVILS_STRIPE_SECRET_KEY: 'sk_test_fake', DEVILS_STRIPE_WEBHOOK_SECRET: 'whsec_fake', DEVILS_STRIPE_MONTHLY_PRICE_ID: 'price_month', DEVILS_STRIPE_YEARLY_PRICE_ID: 'price_year' };
const local = { DEVILS_RUNTIME_MODE: 'local', DEVILS_LOCAL_AUTH_SECRET: 'a-development-signing-secret-with-32-characters' };
describe('runtime configuration', () => {
  it('defaults to services and fails closed with sanitized missing names', () => {
    expect(() => readConfig({})).toThrow('DEVILS_SUPABASE_URL');
    expect(() => readConfig({ DEVILS_MODEL_API_KEY: 'secret-value-never-rendered' })).not.toThrow('secret-value-never-rendered');
  });
  it('permits only explicitly configured local development', () => {
    expect(readConfig(local).mode).toBe('local');
    expect(() => readConfig({ ...local, NODE_ENV: 'production' })).toThrow('production');
    expect(() => readConfig({ DEVILS_RUNTIME_MODE: 'typo' })).toThrow('DEVILS_RUNTIME_MODE');
    expect(() => readConfig({ DEVILS_RUNTIME_MODE: 'local' })).toThrow('DEVILS_LOCAL_AUTH_SECRET');
  });
  it('requires explicit service pricing and refuses live billing', () => {
    expect(readConfig(services).modelInputUsdPerMillion).toBe(1.2);
    expect(() => readConfig({ ...services, DEVILS_MODEL_INPUT_USD_PER_MILLION: undefined })).toThrow('DEVILS_MODEL_INPUT_USD_PER_MILLION');
    expect(() => readConfig({ ...services, DEVILS_MODEL_OUTPUT_USD_PER_MILLION: '-1' })).toThrow('DEVILS_MODEL_OUTPUT_USD_PER_MILLION');
    expect(() => readConfig({ ...services, DEVILS_STRIPE_SECRET_KEY: 'sk_live_fake' })).toThrow('test key');
    expect(() => readConfig({ ...services, NODE_ENV: 'production' })).toThrow('DEVILS_APP_URL');
    expect(readConfig({ ...services, NODE_ENV: 'production', DEVILS_APP_URL: 'https://devils.example' }).mode).toBe('services');
  });
  it('accepts opaque proxy credentials while rejecting known live credentials', () => {
    expect(readConfig({ ...services, DEVILS_STRIPE_SECRET_KEY: 'opaque-platform-binding' }).mode).toBe('services');
  });
  it('exports a public allowlist without privileged bindings', () => {
    const result = publicConfig(readConfig(local));
    expect(result.runtimeMode).toBe('local');
    expect(JSON.stringify(result)).not.toContain(local.DEVILS_LOCAL_AUTH_SECRET);
    const realPublic = JSON.stringify(publicConfig(readConfig(services)));
    for (const value of [services.DEVILS_SUPABASE_SERVICE_ROLE_KEY, services.DEVILS_MODEL_API_KEY, services.DEVILS_STRIPE_SECRET_KEY, services.DEVILS_STRIPE_WEBHOOK_SECRET]) expect(realPublic).not.toContain(value);
    expect(Object.keys(result).sort()).toEqual(['betaActive', 'launchDate', 'runtimeMode']);
  });
});
