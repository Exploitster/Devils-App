import { mkdirSync, writeFileSync } from 'node:fs';
import { readConfig } from '../src/lib/config';
import { LocalStore } from '../src/lib/store/local';
import { createEvidenceService } from '../src/lib/evidence/service';
import { ConversationEngine } from '../src/lib/conversation/engine';
import { GatewayModel } from '../src/lib/model/gateway';
import { gatewayPromptVersion, gatewayResponseDiagnostics } from '../src/lib/model/gateway-request';

// Manual/CI smoke check, never called by the public health endpoint. No hosted
// profiles, emails or conversations are read or changed; all input is synthetic.
if (!process.argv.includes('--confirm-live')) throw new Error('Add --confirm-live to permit synthetic requests with a maximum estimated $0.25 run budget.');
try { process.loadEnvFile('.env.local'); } catch {}
const config = readConfig({ ...process.env, NODE_ENV: 'test', DEVILS_RUNTIME_MODE: 'services', DEVILS_MODEL_PROVIDER: 'gateway', DEVILS_PAYMENTS_ENABLED: 'false', DEVILS_BETA_ACTIVE: 'true', DEVILS_DAILY_SPEND_LIMIT_MICROS: '250000', DEVILS_SUPABASE_URL: 'https://synthetic.invalid', DEVILS_SUPABASE_ANON_KEY: 'unused-synthetic', DEVILS_SUPABASE_SERVICE_ROLE_KEY: 'unused-synthetic', DEVILS_APP_URL: 'https://synthetic.invalid' });
const models = [config.model, ...config.fallbackModels];
const store = new LocalStore(':memory:');
const report: { promptVersion: string; models: string[]; syntheticDataOnly: boolean; maximumEstimatedSpendUsd: number; passed: boolean; checks: { name: string; passed: boolean; code?: string }[] } = { promptVersion: gatewayPromptVersion, models, syntheticDataOnly: true, maximumEstimatedSpendUsd: 0.25, passed: false, checks: [] };
let currentCheck = 'catalog';
try {
  const { getVercelOidcToken } = await import('@vercel/oidc');
  const token = config.modelApiKey || await getVercelOidcToken();
  const response = await fetch('https://ai-gateway.vercel.sh/v1/models?include_availability=true', { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('CATALOG_UNAVAILABLE');
  const catalog = await response.json();
  console.log('Gateway account availability:', JSON.stringify(catalog.request_context_availability ?? {}));
  if (catalog.request_context_availability?.http?.status !== 'available') throw new Error('ACCOUNT_UNAVAILABLE');
  for (const id of models) {
    const model = catalog.data?.find((m: { id: string }) => m.id === id);
    if (!model) throw new Error('MODEL_UNAVAILABLE');
    if (model.model_eligibility?.status !== 'eligible' || model.model_eligibility?.evaluated_runtime !== 'http') {
      console.log('Gateway eligibility:', JSON.stringify(model.model_eligibility ?? { status: 'unknown' }));
      throw new Error('FREE_CREDIT_ELIGIBILITY_NOT_CONFIRMED');
    }
    const endpointResponse = await fetch(`https://ai-gateway.vercel.sh/v1/models/${id}/endpoints`, { signal: AbortSignal.timeout(15000) });
    if (!endpointResponse.ok) throw new Error('ENDPOINT_CATALOG_UNAVAILABLE');
    const endpointCatalog = await endpointResponse.json();
    const endpoints = endpointCatalog.data?.endpoints?.filter((e: { provider_name: string }) => config.gatewayProviders.includes(e.provider_name));
    console.log('Reviewed endpoints:', JSON.stringify(endpoints?.map((e: {provider_name: string; has_zdr: boolean; has_no_training: boolean; supported_parameters: string[]; pricing: unknown}) => ({provider:e.provider_name,zdr:e.has_zdr,noTraining:e.has_no_training,parameters:e.supported_parameters,pricing:e.pricing}))));
    if (!endpoints?.length) throw new Error('APPROVED_PROVIDER_UNAVAILABLE');
    for (const endpoint of endpoints) {
      const inputPrice = Number(endpoint.pricing?.prompt) * 1_000_000;
      const outputPrice = Number(endpoint.pricing?.completion) * 1_000_000;
      if (!endpoint.has_zdr || !endpoint.has_no_training || !endpoint.supported_parameters?.includes('response_format')) throw new Error('PROVIDER_REVIEW_REQUIRED');
      if (!Number.isFinite(inputPrice) || !Number.isFinite(outputPrice) || inputPrice < 0 || outputPrice < 0 || inputPrice > config.modelInputUsdPerMillion || outputPrice > config.modelOutputUsdPerMillion) throw new Error('PRICE_REVIEW_REQUIRED');
    }
  }
  report.checks.push({ name: currentCheck, passed: true });
  const now = new Date().toISOString(); const userId = 'synthetic-gateway-check';
  await store.putProfile({ id: userId, email: 'synthetic@example.test', disabled: false, deletionState: 'none', createdAt: now });
  await store.putInvite({ userId, enabled: true, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  const engine = new ConversationEngine({ store, config, evidence: createEvidenceService(), model: new GatewayModel(config, async (url, options) => {
    const response = await fetch(url, options);
    if (response.ok) {
      const body = await response.clone().json(); const choice = body.choices?.[0];
      const request = JSON.parse(String(options?.body));
      const suppliedEvidence = JSON.parse(request.messages[1].content).evidence;
      const schemaStatus = gatewayResponseDiagnostics(choice?.message?.content ?? '', suppliedEvidence);
      console.log('Synthetic response validation:', JSON.stringify({ model: body.model, finishReason: choice?.finish_reason, schemaStatus, outputTokens: body.usage?.completion_tokens }));
    } else console.log('Gateway HTTP status:', JSON.stringify({ status: response.status, retryAfter: response.headers.get('retry-after') }));
    return response;
  }), clock: { now: () => new Date() } });
  for (const example of [
    { name: 'supported-business', mode: 'business' as const, text: 'I want to build an open-source database for developer teams. I think they will pay because it lowers infrastructure costs.' },
    { name: 'philosophy', mode: 'philosophy' as const, text: 'I want to leave my career to gain autonomy, but I worry that I am simply conforming to other people’s expectations.' },
    { name: 'limited-evidence', mode: 'business' as const, text: 'I want to build an AI phone booking assistant for dentists. I have not tested reliability or willingness to pay.' },
  ]) {
    currentCheck = example.name;
    const created = await store.createSession(userId, { mode: example.mode, topic: example.mode === 'business' ? 'startup' : 'work', title: example.name }, new Date().toISOString());
    let saved = await engine.turn(userId, created.id, { operationId: `${example.name}-describe`, expectedRevision: 0, text: example.text, action: 'message' });
    if (saved.state.phase === 'clarifying') saved = await engine.turn(userId, created.id, { operationId: `${example.name}-skip`, expectedRevision: saved.revision, text: 'I do not know yet; suggest a small reversible test.', action: 'skip' });
    saved = await engine.card(userId, created.id, { operationId: `${example.name}-card`, expectedRevision: saved.revision });
    if (saved.cards.at(-1)?.closing !== 'Your call. Always.' || !saved.cards.at(-1)?.nextStep.trim()) throw new Error('INVALID_CARD');
    if (example.name === 'supported-business' && !saved.cards.at(-1)?.counterpoints.length) throw new Error('SOURCE_COVERAGE_NOT_DEMONSTRATED');
    report.checks.push({ name: currentCheck, passed: true });
    console.log(`${currentCheck}: conversation and card verified; qualitative review remains required.`);
  }
  report.passed = true;
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'CHECK_FAILED';
  report.checks.push({ name: currentCheck, passed: false, code });
  console.error(`${currentCheck}: ${code}. Stopping without further generation requests.`);
  process.exitCode = 1;
} finally {
  store.close(); mkdirSync('.local/evaluations', { recursive: true });
  const path = `.local/evaluations/gateway-${Date.now()}.json`;
  writeFileSync(path, JSON.stringify(report, null, 2));
  console.log(`Sanitized status: ${path}`);
}
