import { afterEach, expect, it, vi } from 'vitest';
import { readConfig } from '../src/lib/config';
import { LocalStore } from '../src/lib/store/local';
import { createEvidenceService } from '../src/lib/evidence/service';
import { ConversationEngine } from '../src/lib/conversation/engine';
import { OpenRouterModel } from '../src/lib/model/openrouter';
import { decodeRouterOutput, openRouterRequest } from '../src/lib/model/openrouter-request';
import { findArea } from '../src/lib/case-prep/frameworks';
import { AssessmentProseSchema, CasePrepProposalSchema, ModelOutputSchema, type CaseContext, type ModelInput } from '../src/lib/contracts';
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
  const envelope = { safety: 'ordinary', output: { response: 'Consider whether the same constraint applies to your idea.', citations: [ref], state: { phase: 'debate', underlyingQuestion: 'Will customers pay?', clarifications: [], strengths: ['The proposal addresses a stated cost.'], counterpoints: [{ source: ref, interpretation: 'Test whether this constraint applies before expanding.' }], openQuestions: ['Which customer will pay?'], nextStep: 'Interview three potential customers this month.', coverageNote: 'This source is a comparison, not proof about your market.', summary: 'Examined the payment assumption.' }, casePrep: null, assessment: null } };
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
it('commits a case turn and an assessment through the real engine, source validation and storage', async () => {
  const { store, input, evidence, envelope, source, claim } = await fixture(); const cfg = { ...config(), mode: 'services' as const };
  const turnEnvelope = { ...envelope, output: { ...envelope.output, citations: [], state: { ...envelope.output.state, counterpoints: [] }, casePrep: { rating: 'vague', quote: null, followUpQuestion: 'Which team feels the cost first?', nextAreaQuestion: 'Who exactly would pay first?', invalidatedAreaIds: [] } } };
  const ref = { evidenceId: source.id, claimId: claim.id, excerptId: claim.excerptIds[0], kind: 'paraphrase' as const };
  const cardEnvelope = { ...envelope, output: { ...envelope.output, citations: [], state: { ...envelope.output.state, counterpoints: [] }, assessment: { statement: 'Database developer tools that lower costs.', good: [], bad: ['The payer is not named.'], mustBeTrue: ['Teams pay for lower costs.'], loopholes: [{ source: ref, interpretation: 'Check whether this applies.' }] } } };
  let calls = 0;
  const model = new OpenRouterModel(cfg, async (_url, options) => { calls++; if (calls === 1) return new Response('', { status: 503 }); return response(JSON.parse(options!.body as string).max_tokens === cfg.maxAssessmentTokens ? cardEnvelope : turnEnvelope); });
  const engine = new ConversationEngine({ store, evidence, model, config: cfg, clock: { now: () => new Date(input.now) } });
  const reserve = vi.spyOn(store, 'reserveSpend'); const reconcile = vi.spyOn(store, 'reconcileSpend');
  const saved = await engine.turn('u', input.session.id, input.request);
  expect(saved.revision).toBe(1); expect(calls).toBe(2); expect(reserve).toHaveBeenCalledTimes(2);
  expect(reconcile).toHaveBeenCalledExactlyOnceWith(expect.any(String), 300);
  expect(saved.messages.at(-1)).toMatchObject({ text: 'Which team feels the cost first?', citations: [] });
  const assessed = await engine.card('u', input.session.id, { operationId: 'card', expectedRevision: 1 });
  expect(assessed.cards).toEqual([]);
  expect(assessed.state.casePrep!.assessment).toMatchObject({ closing: 'Your call. Always.', statement: 'Database developer tools that lower costs.', loopholes: [{ id: claim.id, text: claim.text, citations: [ref] }] });
  expect(await store.listUsage('u', '')).toHaveLength(2);
});
it('keeps cancellation final and preserves the original abort signal', async () => {
  const { input } = await fixture(); const controller = new AbortController(); const error = new Error('cancelled');
  const model = new OpenRouterModel(config(), async (_url, options) => { expect(options!.signal).toBe(controller.signal); controller.abort(); throw error; });
  await expect(model.generate(input, controller.signal)).rejects.toBe(error);
});
it('shows the app-chosen question in place of the provider response on a case turn', async () => {
  const { store, input, evidence, envelope } = await fixture();
  const cited = { ...envelope, output: { ...envelope.output, citations: [], state: { ...envelope.output.state, counterpoints: [] }, response: 'Here is some analysis instead of a question.', casePrep: { rating: 'vague', quote: null, followUpQuestion: 'Which customer will pay?', nextAreaQuestion: null, invalidatedAreaIds: [] } } };
  const cfg = { ...config(), mode: 'services' as const };
  const model = new OpenRouterModel(cfg, async () => response(cited));
  const engine = new ConversationEngine({ store, evidence, model, config: cfg, clock: { now: () => new Date(input.now) } });
  const saved = await engine.turn('u', input.session.id, input.request);
  expect(saved.messages.at(-1)).toMatchObject({ text: 'Which customer will pay?', citations: [] });
  expect(saved.state.casePrep!.areas[0]).toMatchObject({ status: 'probing', followUps: 1 });
  expect(saved.revision).toBe(1);
});
it('still rejects unknown sources in a cited clarification', async () => {
  const { input, envelope } = await fixture();
  const invalid = { ...envelope, output: { ...envelope.output, citations: [{ ...envelope.output.citations[0], evidenceId: 'invented-source' }], state: { ...envelope.output.state, phase: 'clarifying', clarifications: [{ id: 'payer', question: 'Which customer will pay?' }] } } };
  expect((await new OpenRouterModel(config(), async () => response(invalid)).generate(input, new AbortController().signal)).output).toBeNull();
});

function caseInput(base: ModelInput, purpose: CaseContext['purpose']): ModelInput {
  const brief = (id: string) => { const area = findArea('business', id)!; return { id, label: area.label, establishes: area.establishes, strongSignals: area.strongSignals, followUps: area.followUps, status: 'probing' as const, followUpsUsed: 0, quotes: [] }; };
  const card = purpose === 'assessment';
  return { ...base, task: card ? 'card' : 'turn', request: card ? { operationId: 'card', expectedRevision: 0 } : base.request,
    caseContext: { purpose, currentArea: card ? null : brief('customer'), nextArea: card ? null : brief('market'), areas: [{ id: 'customer', label: 'Who the customer is', status: 'probing', quotes: [] }], latestAnswer: 'Database developer tools customers pay because costs fall',
      ...(card ? { assessment: { areas: [{ id: 'customer', label: 'Who the customer is', score: 'weak' as const, reason: 'You said "Database developer tools customers".' }] } } : {}) } };
}
const echoed = { phase: 'clarifying', underlyingQuestion: '', clarifications: [], strengths: [], counterpoints: [], openQuestions: [], nextStep: '', coverageNote: '', summary: '' };
const proposal = { rating: 'strong', quote: 'Database developer tools customers', followUpQuestion: 'Which team inside those customers feels the cost first?', nextAreaQuestion: null, invalidatedAreaIds: [] };
it('decodes a case-prep proposal from the router envelope into the shared proposal shape', async () => {
  const { input } = await fixture(); const turn = caseInput(input, 'question');
  const envelope = { safety: 'ordinary', output: { response: proposal.followUpQuestion, citations: [], state: echoed, casePrep: proposal, assessment: null } };
  const result = await new OpenRouterModel(config(), async () => response(envelope)).generate(turn, new AbortController().signal);
  const output = ModelOutputSchema.parse(result.output);
  expect(output.casePrep).toEqual(CasePrepProposalSchema.parse({ rating: 'strong', quote: 'Database developer tools customers', followUpQuestion: proposal.followUpQuestion, invalidatedAreaIds: [] }));
  expect(output.assessment).toBeUndefined();
});
it('treats a router proposal missing its question field as invalid output while keeping the known cost', async () => {
  const { input } = await fixture(); const turn = caseInput(input, 'question');
  const { followUpQuestion: _missing, ...incomplete } = proposal; void _missing;
  const envelope = { safety: 'ordinary', output: { response: 'Which team?', citations: [], state: echoed, casePrep: incomplete, assessment: null } };
  expect(decodeRouterOutput(JSON.stringify(envelope), turn)).toBeNull();
  expect(await new OpenRouterModel(config(), async () => response(envelope)).generate(turn, new AbortController().signal)).toMatchObject({ output: null, costMicros: 300 });
});
it('expands assessment loopholes from selected source references into reviewed claim text', async () => {
  const { input, source, claim } = await fixture(); const card = caseInput(input, 'assessment');
  const ref = { evidenceId: source.id, claimId: claim.id, excerptId: claim.excerptIds[0], kind: 'paraphrase' as const };
  const prose = { statement: 'Database developer tools that lower costs.', good: ['A stated cost saving.'], bad: ['The payer is not named.'], mustBeTrue: ['Teams will pay for lower costs.'], loopholes: [{ source: ref, interpretation: 'Check whether this applies to developer tools.' }] };
  const envelope = { safety: 'ordinary', output: { response: 'Your assessment is ready.', citations: [], state: { ...echoed, phase: 'card' }, casePrep: null, assessment: prose } };
  const result = await new OpenRouterModel(config(), async () => response(envelope)).generate(card, new AbortController().signal);
  const assessment = AssessmentProseSchema.parse(ModelOutputSchema.parse(result.output).assessment);
  expect(assessment).toMatchObject({ statement: prose.statement, good: prose.good, bad: prose.bad, mustBeTrue: prose.mustBeTrue });
  expect(assessment.loopholes).toEqual([{ id: claim.id, text: claim.text, interpretation: prose.loopholes[0].interpretation, citations: [ref] }]);
});
it('sends case-prep router instructions and gives the assessment its own budget and reservation', async () => {
  const { input } = await fixture(); const cfg = { ...config(), mode: 'services' as const };
  const card = caseInput(input, 'assessment'); const turn = caseInput(input, 'question');
  const cardRequest = openRouterRequest(card, cfg);
  expect(cardRequest.messages[0].content).toContain('devils-advocate-openrouter/2');
  expect(cardRequest.messages[0].content).toContain('output.assessment.loopholes');
  expect(cardRequest.messages[0].content).not.toContain('three total');
  expect(cardRequest.max_tokens).toBe(cfg.maxAssessmentTokens); expect(openRouterRequest(turn, cfg).max_tokens).toBe(cfg.maxOutputTokens);
  expect(cfg.maxAssessmentTokens).not.toBe(cfg.maxOutputTokens);
  const bytes = (value: ModelInput) => Buffer.byteLength(JSON.stringify(openRouterRequest(value, cfg)));
  expect(reserveCost(card, cfg)).toBe(Math.ceil((bytes(card) + 1024) * 1 + cfg.maxAssessmentTokens * 5));
  expect(reserveCost(turn, cfg)).toBe(Math.ceil((bytes(turn) + 1024) * 1 + cfg.maxOutputTokens * 5));
});
