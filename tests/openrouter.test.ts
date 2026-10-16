import { afterEach, expect, it, vi } from 'vitest';
import { readConfig } from '../src/lib/config';
import { LocalStore } from '../src/lib/store/local';
import { createEvidenceService } from '../src/lib/evidence/service';
import { ConversationEngine } from '../src/lib/conversation/engine';
import { OpenRouterModel } from '../src/lib/model/openrouter';
import { openRouterRequest } from '../src/lib/model/openrouter-request';
import { reserveCost } from '../src/lib/conversation/limits';

const stores: LocalStore[] = [];
afterEach(() => stores.splice(0).forEach(store => store.close()));
const config = () => readConfig({ DEVILS_RUNTIME_MODE: 'local', DEVILS_LOCAL_AUTH_SECRET: 'x'.repeat(32), DEVILS_MODEL_PROVIDER: 'openrouter', DEVILS_OPENROUTER_API_KEY: 'private-router-key', DEVILS_BETA_ACTIVE: 'true' });
async function fixture() {
  const store = new LocalStore(':memory:'); stores.push(store);
  const now = '2026-10-16T00:00:00Z';
  await store.putProfile({ id: 'u', email: 'synthetic@example.test', disabled: false, deletionState: 'none', createdAt: now });
  await store.putInvite({ userId: 'u', enabled: true, expiresAt: '2026-10-17T00:00:00Z' });
  const session = await store.createSession('u', { mode: 'business', topic: 'startup' }, now);
  const evidence = createEvidenceService();
  const input = { session, request: { operationId: 'a', expectedRevision: 0, action: 'message' as const, text: 'Database developer tools customers pay because costs fall' }, task: 'turn' as const, evidence: await evidence.retrieve({ mode: 'business', query: 'database', excludeIds: [], limit: 3 }), now };
  const source = input.evidence[0]; const claim = source.claims[0];
  const ref = { evidenceId: source.id, claimId: claim.id, excerptId: claim.excerptIds[0], kind: 'quote' as const };
  const envelope = { safety: 'ordinary', output: { response: 'Consider whether the same constraint applies to your idea.', citations: [ref], state: { phase: 'debate', underlyingQuestion: 'Will customers pay?', clarifications: [], strengths: ['The proposal addresses a stated cost.'], counterpoints: [{ source: ref, interpretation: 'Test whether this constraint applies before expanding.' }], openQuestions: ['Which customer will pay?'], nextStep: 'Interview three potential customers this month.', coverageNote: 'This source is a comparison, not proof about your market.', summary: 'Examined the payment assumption.' } } };
  return { store, input, evidence, envelope, source, claim };
}
function response(envelope: unknown, overrides: Record<string, unknown> = {}) {
  return new Response(JSON.stringify({ model: 'anthropic/claude-haiku-4.5', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(envelope) } }], usage: { prompt_tokens: 100, completion_tokens: 40, cost: 0.0003 }, ...overrides }));
}
it('sends bounded, private, structured requests with explicit fallback models and no tools', async () => {
  const { input, envelope, evidence } = await fixture(); const cfg = config();
  const model = new OpenRouterModel(cfg, async (url, options) => {
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(new Headers(options!.headers).get('authorization')).toBe('Bearer private-router-key');
    const body = JSON.parse(options!.body as string);
    expect(body.models).toEqual(['openai/gpt-5.4-mini', 'anthropic/claude-haiku-4.5']);
    expect(body.provider).toMatchObject({ allow_fallbacks: true, require_parameters: true, data_collection: 'deny', zdr: true, max_price: { prompt: 1, completion: 5, request: 0 } });
    expect(body.response_format).toMatchObject({ type: 'json_schema', json_schema: { strict: true } });
    expect(body.max_tokens).toBe(cfg.maxOutputTokens);
    expect(body.tools).toBeUndefined(); expect(body.user).toBeUndefined();
    expect(body.messages[1].content).not.toContain('synthetic@example.test');
    expect(JSON.parse(body.messages[1].content).conversation).not.toHaveProperty('ownerId');
    expect(JSON.stringify(body.response_format)).not.toContain('usedEvidenceIds');
    expect(JSON.stringify(body)).not.toContain('private-router-key');
    return response(envelope);
  });
  const result = await model.generate(input, new AbortController().signal);
  expect(result).toMatchObject({ inputTokens: 100, outputTokens: 40, costMicros: 300 });
  const output = await evidence.validate(result.output as import('../src/lib/contracts').ModelOutput, input.evidence);
  expect(output.state.counterpoints[0].text).toBe(input.evidence[0].claims[0].text);
  expect(output.citations[0].quote).toBe(input.evidence[0].excerpts.find(e => e.id === envelope.output.citations[0].excerptId)!.text);
});
it('reserves the exact OpenRouter request using price ceilings for every fallback', async () => {
  const { input } = await fixture(); const cfg = { ...config(), mode: 'services' as const };
  const bytes = Buffer.byteLength(JSON.stringify(openRouterRequest(input, cfg)));
  expect(reserveCost(input, cfg)).toBe(Math.ceil((bytes + 1024) * 1 + cfg.maxOutputTokens * 5));
});
it.each([400, 401, 402, 403, 404, 429, 500, 503])('maps HTTP %s without hiding credentials or configuration errors behind retries', async status => {
  const { input } = await fixture(); const fetcher = vi.fn(async () => new Response('secret upstream details', { status }));
  await expect(new OpenRouterModel(config(), fetcher).generate(input, new AbortController().signal)).rejects.toMatchObject({ transient: status === 429 || status >= 500 });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it.each(['unknown-source', 'invented-quote', 'truncated', 'refusal', 'unlisted-model'])('rejects %s and preserves known costs', async kind => {
  const { input, envelope } = await fixture(); const payload = structuredClone(envelope);
  if (kind === 'unknown-source') payload.output.citations[0].evidenceId = 'invented';
  if (kind === 'invented-quote') Object.assign(payload.output.citations[0], { quote: 'fabricated quotation' });
  const overrides = kind === 'truncated' ? { choices: [{ finish_reason: 'length', message: { content: JSON.stringify(payload) } }] } : kind === 'refusal' ? { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(payload), refusal: 'No' } }] } : kind === 'unlisted-model' ? { model: 'unapproved/model' } : {};
  const result = await new OpenRouterModel(config(), async () => response(payload, overrides)).generate(input, new AbortController().signal);
  expect(result).toMatchObject({ output: null, costMicros: 300 });
});
it('never treats missing or invalid usage as a free response', async () => {
  const { input, envelope } = await fixture();
  for (const usage of [undefined, { prompt_tokens: 1, completion_tokens: 2 }, { prompt_tokens: -1, completion_tokens: 2, cost: 0 }, { prompt_tokens: 1, completion_tokens: 2, cost: -1 }]) {
    await expect(new OpenRouterModel(config(), async () => response(envelope, { usage })).generate(input, new AbortController().signal)).rejects.toMatchObject({ transient: false });
  }
});
it('commits a turn and server-authored card through the real engine, source validation and storage', async () => {
  const { store, input, evidence, envelope } = await fixture(); const cfg = { ...config(), mode: 'services' as const };
  let calls = 0;
  const model = new OpenRouterModel(cfg, async () => ++calls === 1 ? new Response('', { status: 503 }) : response(envelope));
  const engine = new ConversationEngine({ store, evidence, model, config: cfg, clock: { now: () => new Date(input.now) } });
  const reserve = vi.spyOn(store, 'reserveSpend'); const reconcile = vi.spyOn(store, 'reconcileSpend');
  const saved = await engine.turn('u', input.session.id, input.request);
  expect(saved.revision).toBe(1); expect(calls).toBe(2); expect(reserve).toHaveBeenCalledTimes(2);
  expect(reconcile).toHaveBeenCalledExactlyOnceWith(expect.any(String), 300);
  const card = await engine.card('u', input.session.id, { operationId: 'card', expectedRevision: 1 });
  expect(card.cards[0].closing).toBe('Your call. Always.');
  expect(card.cards[0].counterpoints[0].text).toBe(saved.state.counterpoints[0].text);
  expect(await store.listUsage('u', '')).toHaveLength(2);
});
it('keeps cancellation final and preserves the original abort signal', async () => {
  const { input } = await fixture(); const controller = new AbortController(); const error = new Error('cancelled');
  const model = new OpenRouterModel(config(), async (_url, options) => { expect(options!.signal).toBe(controller.signal); controller.abort(); throw error; });
  await expect(model.generate(input, controller.signal)).rejects.toBe(error);
});
