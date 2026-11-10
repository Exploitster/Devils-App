import { describe, expect, it } from 'vitest';
import { readConfig, publicConfig } from '../src/lib/config';
const services = { DEVILS_SUPABASE_URL: 'https://example.supabase.co', DEVILS_SUPABASE_ANON_KEY: 'public', DEVILS_SUPABASE_SERVICE_ROLE_KEY: 'privileged-role-secret', DEVILS_GEMINI_API_KEY: 'provider-secret', DEVILS_MODEL: 'gemini-2.5-flash', DEVILS_MODEL_INPUT_USD_PER_MILLION: '1.2', DEVILS_MODEL_OUTPUT_USD_PER_MILLION: '4.5', DEVILS_PAYMENTS_ENABLED:'true', DEVILS_STRIPE_SECRET_KEY: 'sk_test_fake', DEVILS_STRIPE_WEBHOOK_SECRET: 'whsec_fake', DEVILS_STRIPE_MONTHLY_PRICE_ID: 'price_month', DEVILS_STRIPE_YEARLY_PRICE_ID: 'price_year' };
const local = { DEVILS_RUNTIME_MODE: 'local', DEVILS_LOCAL_AUTH_SECRET: 'a-development-signing-secret-with-32-characters' };
describe('runtime configuration', () => {
  it('uses the fixed rehearsal callback origin, shares no secret or account IDs publicly, and fails closed at runtime',()=>{
    const bindings={...services,DEVILS_PAYMENTS_ENABLED:'false',DEVILS_MODEL_PROVIDER:'gateway',DEVILS_DEPLOYMENT_ENV:'rehearsal',DEVILS_SHARED_DATA_REHEARSAL:'true',VERCEL_ENV:'preview',VERCEL_PROJECT_ID:'prj_RtFOuKfu3erBBiaiU7uIuvGPndEt',DEVILS_SUPABASE_URL:'https://fttulbecvnxlutpqjrky.supabase.co',DEVILS_APP_URL:'https://devils-advocate-preview-exploitster1.vercel.app',DEVILS_BILLING_PROVIDER:'dodo',DEVILS_DODO_ENVIRONMENT:'test_mode',DEVILS_DODO_TEST_USER_IDS:'00000000-0000-4000-8000-000000000001'};
    const config=readConfig(bindings);expect(config.appUrl).toBe(bindings.DEVILS_APP_URL);expect(publicConfig(config)).toMatchObject({sharedDataRehearsal:true,paymentsEnabled:false});expect(JSON.stringify(publicConfig(config))).not.toContain(bindings.DEVILS_DODO_TEST_USER_IDS);
    expect(()=>readConfig({...bindings,VERCEL_ENV:'production'})).toThrow('REHEARSAL');
  });
  it('keeps Dodo setup independent from legacy Stripe keys and rejects paid test mode',()=>{
    const bindings={...services,DEVILS_BILLING_PROVIDER:'dodo',DEVILS_PAYMENTS_ENABLED:'false',DEVILS_STRIPE_SECRET_KEY:undefined};
    expect(readConfig(bindings).billingProvider).toBe('dodo');
    expect(()=>readConfig({...bindings,DEVILS_PAYMENTS_ENABLED:'true',DEVILS_DODO_ENVIRONMENT:'test_mode'})).toThrow('test payments');
    expect(()=>readConfig({...bindings,DEVILS_PAYMENTS_ENABLED:'true',DEVILS_DODO_ENVIRONMENT:'live_mode'})).toThrow('DEVILS_DODO_WEBHOOK_SECRET');
    const config=readConfig({...bindings,DEVILS_PAYMENTS_ENABLED:'true',DEVILS_DODO_ENVIRONMENT:'live_mode',DEVILS_DODO_API_KEY:'private-dodo-key',DEVILS_DODO_WEBHOOK_SECRET:'private-dodo-signature',DEVILS_DODO_MONTHLY_PRODUCT_ID:'pdt_month',DEVILS_PAID_ACCESS_START:'2026-11-01T00:00:00Z'});
    expect(config.paymentsEnabled).toBe(true);expect(JSON.stringify(publicConfig(config))).not.toContain('private-dodo');
  });
  it('requires a past, offset-qualified paid-access start whenever Dodo payments are enabled',()=>{
    const live={...services,DEVILS_BILLING_PROVIDER:'dodo',DEVILS_PAYMENTS_ENABLED:'true',DEVILS_DODO_ENVIRONMENT:'live_mode',DEVILS_DODO_API_KEY:'private-dodo-key',DEVILS_DODO_WEBHOOK_SECRET:'private-dodo-signature',DEVILS_DODO_MONTHLY_PRODUCT_ID:'pdt_month'};
    expect(()=>readConfig(live)).toThrow('DEVILS_PAID_ACCESS_START');
    expect(()=>readConfig({...live,DEVILS_DODO_ENVIRONMENT:'test_mode'})).toThrow();
    expect(()=>readConfig({...live,DEVILS_PAID_ACCESS_START:'not-a-date'})).toThrow('DEVILS_PAID_ACCESS_START');
    expect(()=>readConfig({...live,DEVILS_PAID_ACCESS_START:'2026-11-01T00:00:00'})).toThrow('DEVILS_PAID_ACCESS_START');
    expect(()=>readConfig({...live,DEVILS_PAID_ACCESS_START:new Date(Date.now()+3600000).toISOString()})).toThrow('DEVILS_PAID_ACCESS_START');
    expect(readConfig({...live,DEVILS_PAID_ACCESS_START:'2026-11-01T05:30:00+05:30'}).paidAccessStart).toBe('2026-11-01T00:00:00.000Z');
    expect(readConfig({...services,DEVILS_BILLING_PROVIDER:'dodo',DEVILS_PAYMENTS_ENABLED:'false'}).paidAccessStart).toBeUndefined();
  });
  it('selects OpenRouter explicitly without replacing or requiring the Gemini key', () => {
    const config = readConfig({ ...services, DEVILS_MODEL_PROVIDER: 'openrouter', DEVILS_OPENROUTER_API_KEY: 'router-secret', DEVILS_GEMINI_API_KEY: undefined });
    expect(config.modelProvider).toBe('openrouter');
    expect(config.modelApiKey).toBe('router-secret');
    expect(config.model).toBe('openai/gpt-5.4-mini');
    expect(config.fallbackModels).toEqual(['anthropic/claude-haiku-4.5']);
    expect(config.modelInputUsdPerMillion).toBe(1);
    expect(config.modelOutputUsdPerMillion).toBe(5);
    expect(JSON.stringify(publicConfig(config))).not.toContain('router-secret');
    expect(() => readConfig({ ...services, DEVILS_MODEL_PROVIDER: 'openrouter' })).toThrow('DEVILS_OPENROUTER_API_KEY');
    expect(() => readConfig({ ...services, DEVILS_MODEL_PROVIDER: 'unknown' })).toThrow('DEVILS_MODEL_PROVIDER');
  });
  it('rejects unsafe routing configuration and zero OpenRouter price caps', () => {
    const bindings = { ...services, DEVILS_MODEL_PROVIDER: 'openrouter', DEVILS_OPENROUTER_API_KEY: 'router-secret' };
    expect(() => readConfig({ ...bindings, DEVILS_OPENROUTER_MODEL: 'https://arbitrary.example' })).toThrow('model');
    expect(() => readConfig({ ...bindings, DEVILS_OPENROUTER_MAX_INPUT_USD_PER_MILLION: '0' })).toThrow('positive');
    expect(() => readConfig({ ...bindings, DEVILS_OPENROUTER_FALLBACK_MODELS: 'openrouter/auto' })).toThrow('model');
    expect(readConfig({ ...bindings, DEVILS_OPENROUTER_FALLBACK_MODELS: '' }).fallbackModels).toEqual([]);
  });
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
  it('runs Supabase and Gemini without Stripe settings when payments are deferred', () => {
    const { DEVILS_STRIPE_SECRET_KEY: _key, DEVILS_STRIPE_WEBHOOK_SECRET: _webhook, DEVILS_STRIPE_MONTHLY_PRICE_ID: _monthly, DEVILS_STRIPE_YEARLY_PRICE_ID: _yearly, ...bindings } = services;
    void [_key, _webhook, _monthly, _yearly];
    const config = readConfig({ ...bindings, DEVILS_PAYMENTS_ENABLED: undefined, DEVILS_MODEL: undefined });
    expect(config.paymentsEnabled).toBe(false);
    expect(config.model).toBe('gemini-3.8-flash');
    expect(config.modelApiKey).toBe('provider-secret');
    expect(() => readConfig({ ...bindings, DEVILS_PAYMENTS_ENABLED: 'true' })).toThrow('DEVILS_STRIPE_SECRET_KEY');
    expect(() => readConfig({ ...bindings, DEVILS_PAYMENTS_ENABLED: 'typo' })).toThrow('DEVILS_PAYMENTS_ENABLED');
    expect(() => readConfig({ ...bindings, DEVILS_PAYMENTS_ENABLED: 'false', DEVILS_GEMINI_API_KEY: undefined })).toThrow('DEVILS_GEMINI_API_KEY');
  });
  it('gives assessments their own validated output budget, separate from turns', () => {
    expect(readConfig(local)).toMatchObject({ maxOutputTokens: 2500, maxAssessmentTokens: 6000 });
    expect(readConfig({ ...local, DEVILS_MAX_ASSESSMENT_TOKENS: '9000' }).maxAssessmentTokens).toBe(9000);
    for (const value of ['many', '', '6000.5', '99', '16001']) expect(() => readConfig({ ...local, DEVILS_MAX_ASSESSMENT_TOKENS: value })).toThrow('DEVILS_MAX_ASSESSMENT_TOKENS must be an integer between 100 and 16000.');
  });
  it('reads the owner allowlist as trimmed, lowercased emails and rejects malformed entries', () => {
    expect(readConfig({ ...local, DEVILS_OWNER_EMAILS: ' Sam@Example.test , ' }).ownerEmails).toEqual(['sam@example.test']);
    expect(readConfig(local).ownerEmails).toEqual([]);
    expect(() => readConfig({ ...local, DEVILS_OWNER_EMAILS: 'not-an-email' })).toThrow('DEVILS_OWNER_EMAILS');
  });
  it('never puts an owner email in the public configuration', () => {
    for (const bindings of [{ ...local, DEVILS_OWNER_EMAILS: 'owner@example.test' }, { ...services, DEVILS_OWNER_EMAILS: 'owner@example.test,second@example.test' }]) {
      const result = JSON.stringify(publicConfig(readConfig(bindings)));
      expect(result).not.toContain('owner@example.test'); expect(result).not.toContain('second@example.test'); expect(result).not.toContain('example.test');
    }
  });
  it('parses transcription settings without requiring them at startup', () => {
    expect(readConfig(local)).toMatchObject({ transcriptionApiKey: '', transcriptionModel: 'gemini-3.8-flash', transcriptionInputUsdPerMillion: undefined, transcriptionOutputUsdPerMillion: undefined });
    const router = readConfig({ ...services, DEVILS_MODEL_PROVIDER: 'openrouter', DEVILS_OPENROUTER_API_KEY: 'router-secret', DEVILS_TRANSCRIPTION_INPUT_USD_PER_MILLION: '3', DEVILS_TRANSCRIPTION_OUTPUT_USD_PER_MILLION: '2.5' });
    expect(router).toMatchObject({ transcriptionApiKey: 'provider-secret', transcriptionModel: 'gemini-2.5-flash', transcriptionInputUsdPerMillion: 3, transcriptionOutputUsdPerMillion: 2.5 });
    expect(readConfig({ ...services, DEVILS_MODEL_PROVIDER: 'gateway', DEVILS_MODEL: 'not-gemini' }).transcriptionModel).toBe('gemini-3.8-flash');
    expect(readConfig({ ...services, DEVILS_TRANSCRIPTION_MODEL: 'gemini-2.5-pro' }).transcriptionModel).toBe('gemini-2.5-pro');
    expect(() => readConfig({ ...services, DEVILS_TRANSCRIPTION_MODEL: 'openai/gpt-5.4-mini' })).toThrow('DEVILS_TRANSCRIPTION_MODEL');
    expect(() => readConfig({ ...local, DEVILS_TRANSCRIPTION_INPUT_USD_PER_MILLION: 'free' })).toThrow('DEVILS_TRANSCRIPTION_INPUT_USD_PER_MILLION');
    expect(JSON.stringify(publicConfig(router))).not.toContain('provider-secret');
  });
  it('exports a public allowlist without privileged bindings', () => {
    const result = publicConfig(readConfig(local));
    expect(result.runtimeMode).toBe('local');
    expect(JSON.stringify(result)).not.toContain(local.DEVILS_LOCAL_AUTH_SECRET);
    const realPublic = JSON.stringify(publicConfig(readConfig(services)));
    for (const value of [services.DEVILS_SUPABASE_SERVICE_ROLE_KEY, services.DEVILS_GEMINI_API_KEY, services.DEVILS_STRIPE_SECRET_KEY, services.DEVILS_STRIPE_WEBHOOK_SECRET]) expect(realPublic).not.toContain(value);
    expect(Object.keys(result).sort()).toEqual(['betaActive', 'launchDate', 'paymentsEnabled', 'runtimeMode', 'sharedDataRehearsal']);
  });
});
