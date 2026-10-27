import { mkdirSync, writeFileSync } from 'node:fs';
import { readConfig } from '../src/lib/config';
import { LocalStore } from '../src/lib/store/local';
import { createEvidenceService } from '../src/lib/evidence/service';
import { ConversationEngine } from '../src/lib/conversation/engine';
import { OpenRouterModel } from '../src/lib/model/openrouter';
import { routerPromptVersion } from '../src/lib/model/openrouter-request';

// Manual/CI smoke check, never called by the public health endpoint. No hosted
// profiles, emails or conversations are read or changed; all input is synthetic.
if (!process.argv.includes('--confirm-live')) throw new Error('Add --confirm-live to permit synthetic requests with a maximum estimated $0.25 run budget.');
try { process.loadEnvFile('.env.local'); } catch {}
const config = readConfig({ ...process.env, NODE_ENV: 'test', DEVILS_RUNTIME_MODE: 'services', DEVILS_MODEL_PROVIDER: 'openrouter', DEVILS_PAYMENTS_ENABLED: 'false', DEVILS_BETA_ACTIVE: 'true', DEVILS_DAILY_SPEND_LIMIT_MICROS: '250000', DEVILS_SUPABASE_URL: 'https://synthetic.invalid', DEVILS_SUPABASE_ANON_KEY: 'unused-synthetic', DEVILS_SUPABASE_SERVICE_ROLE_KEY: 'unused-synthetic', DEVILS_APP_URL: 'https://synthetic.invalid' });
const models = [config.model, ...config.fallbackModels];
const store = new LocalStore(':memory:');
const report: { promptVersion: string; models: string[]; syntheticDataOnly: boolean; maximumEstimatedSpendUsd: number; passed: boolean; checks: { name: string; passed: boolean; code?: string }[] } = { promptVersion: routerPromptVersion, models, syntheticDataOnly: true, maximumEstimatedSpendUsd: 0.25, passed: false, checks: [] };
let currentCheck = 'catalog';
try {
  const response = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('CATALOG_UNAVAILABLE');
  const catalog = await response.json();
  for (const id of models) {
    const model = catalog.data?.find((m: { id: string }) => m.id === id);
    if (!model || !model.supported_parameters?.includes('structured_outputs') || !model.supported_parameters?.includes('response_format')) throw new Error('MODEL_UNAVAILABLE_OR_UNSUPPORTED');
    const inputPrice = Number(model.pricing?.prompt) * 1_000_000;
    const outputPrice = Number(model.pricing?.completion) * 1_000_000;
    if (!Number.isFinite(inputPrice) || !Number.isFinite(outputPrice) || inputPrice < 0 || outputPrice < 0 || inputPrice > config.modelInputUsdPerMillion || outputPrice > config.modelOutputUsdPerMillion) throw new Error('PRICE_REVIEW_REQUIRED');
  }
  report.checks.push({ name: currentCheck, passed: true });
  const now = new Date().toISOString(); const userId = 'synthetic-openrouter-check';
  await store.putProfile({ id: userId, email: 'synthetic@example.test', disabled: false, deletionState: 'none', createdAt: now });
  await store.putInvite({ userId, enabled: true, expiresAt: new Date(Date.now() + 3600000).toISOString() });
  const engine = new ConversationEngine({ store, config, evidence: createEvidenceService(), model: new OpenRouterModel(config), clock: { now: () => new Date() } });
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
  const path = `.local/evaluations/openrouter-${Date.now()}.json`;
  writeFileSync(path, JSON.stringify(report, null, 2));
  console.log(`Sanitized status: ${path}`);
}
