// This module is for server services. Only publicConfig() may be returned to clients.
export interface RuntimeConfig {
  mode: 'local' | 'services'; appUrl: string; sqlitePath: string; localAuthSecret: string;
  supabaseUrl: string; supabaseAnonKey: string; supabaseServiceRoleKey: string;
  modelProvider: 'gemini' | 'openrouter' | 'gateway'; fallbackModels: string[]; gatewayProviders: string[];
  modelApiKey: string; model: string; modelInputUsdPerMillion: number; modelOutputUsdPerMillion: number; maxOutputTokens: number;
  paymentsEnabled: boolean; stripeSecretKey: string; stripeWebhookSecret: string; stripeMonthlyPriceId: string; stripeYearlyPriceId: string;
  betaActive: boolean; launchDate: string; generationTimeoutMs: number; dailySpendLimitMicros: number;
  maxInputCharacters: number; maxContextMessages: number; submissionsPerMinute: number;
}
export type Environment = Record<string, string | undefined>;
export function readConfig(env: Environment = process.env): RuntimeConfig {
  const mode = env.DEVILS_RUNTIME_MODE ?? 'services';
  if (mode !== 'local' && mode !== 'services') throw new Error('DEVILS_RUNTIME_MODE must be local or services.');
  if (mode === 'local' && env.NODE_ENV === 'production') throw new Error('Local runtime is forbidden in production.');
  const paymentSetting = env.DEVILS_PAYMENTS_ENABLED ?? 'false';
  if (!['true', 'false'].includes(paymentSetting)) throw new Error('DEVILS_PAYMENTS_ENABLED must be true or false.');
  const paymentsEnabled = paymentSetting === 'true';
  const modelProvider = env.DEVILS_MODEL_PROVIDER ?? 'gemini';
  if (modelProvider !== 'gemini' && modelProvider !== 'openrouter' && modelProvider !== 'gateway') throw new Error('DEVILS_MODEL_PROVIDER must be gemini, openrouter or gateway.');
  const modelBindings = modelProvider === 'gateway' ? [] : modelProvider === 'openrouter' ? ['DEVILS_OPENROUTER_API_KEY'] : ['DEVILS_GEMINI_API_KEY', 'DEVILS_MODEL_INPUT_USD_PER_MILLION', 'DEVILS_MODEL_OUTPUT_USD_PER_MILLION'];
  const required = mode === 'local' ? ['DEVILS_LOCAL_AUTH_SECRET'] : ['DEVILS_SUPABASE_URL', 'DEVILS_SUPABASE_ANON_KEY', 'DEVILS_SUPABASE_SERVICE_ROLE_KEY', ...modelBindings, ...(paymentsEnabled ? ['DEVILS_STRIPE_SECRET_KEY', 'DEVILS_STRIPE_WEBHOOK_SECRET', 'DEVILS_STRIPE_MONTHLY_PRICE_ID', 'DEVILS_STRIPE_YEARLY_PRICE_ID'] : [])];
  const missing = required.filter(name => !env[name]?.trim());
  if (missing.length) throw new Error(`Missing runtime configuration: ${missing.join(', ')}. Configure secure environment bindings.`);
  if (mode === 'local' && (env.DEVILS_LOCAL_AUTH_SECRET?.length ?? 0) < 32) throw new Error('DEVILS_LOCAL_AUTH_SECRET must contain at least 32 characters.');
  if (mode === 'services' && paymentsEnabled && /^(sk|rk)_live_/.test(env.DEVILS_STRIPE_SECRET_KEY ?? '')) throw new Error('DEVILS_STRIPE_SECRET_KEY must be a Stripe test key.');
  if (mode === 'services' && paymentsEnabled && !env.DEVILS_STRIPE_WEBHOOK_SECRET?.startsWith('whsec_')) throw new Error('DEVILS_STRIPE_WEBHOOK_SECRET must be a Stripe webhook signing secret.');
  const model = modelProvider === 'gateway' ? env.DEVILS_GATEWAY_MODEL ?? 'google/gemini-2.5-flash' : modelProvider === 'openrouter' ? env.DEVILS_OPENROUTER_MODEL ?? 'openai/gpt-5.4-mini' : env.DEVILS_MODEL ?? 'gemini-3.8-flash';
  if (modelProvider === 'gateway' && model !== 'google/gemini-2.5-flash') throw new Error('Gateway model must be the reviewed google/gemini-2.5-flash.');
  const fallbackModels = modelProvider === 'openrouter' ? (env.DEVILS_OPENROUTER_FALLBACK_MODELS ?? 'anthropic/claude-haiku-4.5').split(',').map(s => s.trim()).filter(Boolean) : [];
  if (modelProvider === 'gemini' && !/^gemini-[A-Za-z0-9._-]+$/.test(model)) throw new Error('DEVILS_MODEL must be a Gemini model ID.');
  // No auto routers, free/online variants, URL endpoints, or unbounded model lists.
  if (modelProvider === 'openrouter' && (fallbackModels.length > 2 || [model, ...fallbackModels].some(id => !/^(openai|anthropic|google)\/[A-Za-z0-9][A-Za-z0-9._-]{0,100}$/.test(id)))) throw new Error('Configure up to three explicit OpenRouter model IDs from openai, anthropic or google.');
  const inputPrice = modelProvider === 'gateway' ? 0.5 : modelProvider === 'openrouter' ? price({ DEVILS_OPENROUTER_MAX_INPUT_USD_PER_MILLION: '1', ...env }, 'DEVILS_OPENROUTER_MAX_INPUT_USD_PER_MILLION') : price(env, 'DEVILS_MODEL_INPUT_USD_PER_MILLION');
  const outputPrice = modelProvider === 'gateway' ? 3 : modelProvider === 'openrouter' ? price({ DEVILS_OPENROUTER_MAX_OUTPUT_USD_PER_MILLION: '5', ...env }, 'DEVILS_OPENROUTER_MAX_OUTPUT_USD_PER_MILLION') : price(env, 'DEVILS_MODEL_OUTPUT_USD_PER_MILLION');
  if (modelProvider === 'openrouter' && (inputPrice <= 0 || outputPrice <= 0)) throw new Error('OpenRouter price caps must be positive.');
  const appUrl = url(env.DEVILS_APP_URL ?? 'http://127.0.0.1:3000', 'DEVILS_APP_URL', env.NODE_ENV === 'production');
  const supabaseUrl = mode === 'services' ? url(env.DEVILS_SUPABASE_URL!, 'DEVILS_SUPABASE_URL', true) : '';
  const launchDate = env.DEVILS_LAUNCH_DATE ?? '2026-12-01';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(launchDate) || Number.isNaN(Date.parse(launchDate))) throw new Error('DEVILS_LAUNCH_DATE must be an ISO calendar date.');
  const beta = env.DEVILS_BETA_ACTIVE ?? 'false';
  if (!['true', 'false'].includes(beta)) throw new Error('DEVILS_BETA_ACTIVE must be true or false.');
  return { mode, appUrl, sqlitePath: env.DEVILS_SQLITE_PATH ?? '.local/devils.sqlite', localAuthSecret: env.DEVILS_LOCAL_AUTH_SECRET ?? '',
    supabaseUrl, supabaseAnonKey: env.DEVILS_SUPABASE_ANON_KEY ?? '', supabaseServiceRoleKey: env.DEVILS_SUPABASE_SERVICE_ROLE_KEY ?? '',
    modelProvider, gatewayProviders: ['vertex'], fallbackModels: [...new Set(fallbackModels)].filter(id => id !== model), modelApiKey: (modelProvider === 'gateway' ? env.AI_GATEWAY_API_KEY : modelProvider === 'openrouter' ? env.DEVILS_OPENROUTER_API_KEY : env.DEVILS_GEMINI_API_KEY) ?? '', model, modelInputUsdPerMillion: inputPrice, modelOutputUsdPerMillion: outputPrice, maxOutputTokens: integer(env, 'DEVILS_MAX_OUTPUT_TOKENS', 2500, 100, 8000), paymentsEnabled, stripeSecretKey: env.DEVILS_STRIPE_SECRET_KEY ?? '', stripeWebhookSecret: env.DEVILS_STRIPE_WEBHOOK_SECRET ?? '', stripeMonthlyPriceId: env.DEVILS_STRIPE_MONTHLY_PRICE_ID ?? '', stripeYearlyPriceId: env.DEVILS_STRIPE_YEARLY_PRICE_ID ?? '',
    betaActive: beta === 'true', launchDate, generationTimeoutMs: integer(env, 'DEVILS_GENERATION_TIMEOUT_MS', modelProvider === 'gateway' ? 90000 : modelProvider === 'openrouter' ? 60000 : 30000, 1000, 120000), dailySpendLimitMicros: integer(env, 'DEVILS_DAILY_SPEND_LIMIT_MICROS', 5000000, 1, 1000000000), maxInputCharacters: 12000, maxContextMessages: 24, submissionsPerMinute: 10 };
}
function price(env: Environment, name: string): number {
  const raw = env[name] ?? '0'; const value = Number(raw);
  if (!raw.trim() || !Number.isFinite(value) || value < 0 || value > 10000) throw new Error(`${name} must be a nonnegative current-model USD price per million tokens.`);
  return value;
}
function integer(env: Environment, name: string, fallback: number, min: number, max: number): number {
  const value = env[name] === undefined ? fallback : Number(env[name]);
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  return value;
}
function url(raw: string, name: string, httpsRequired: boolean): string {
  let result: URL;
  try { result = new URL(raw); } catch { throw new Error(`${name} must be a valid URL.`); }
  if (result.username || result.password || !['http:', 'https:'].includes(result.protocol) || (httpsRequired && result.protocol !== 'https:')) throw new Error(`${name} must use a permitted protocol without embedded credentials.`);
  return result.origin;
}
export function publicConfig(config: RuntimeConfig) { return { runtimeMode: config.mode, betaActive: config.betaActive, launchDate: config.launchDate }; }
