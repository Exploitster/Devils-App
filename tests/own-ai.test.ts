import { afterEach, describe, expect, it, vi } from 'vitest';
import { readConfig } from '../src/lib/config';
import { LocalStore } from '../src/lib/store/local';
import { ConversationEngine } from '../src/lib/conversation/engine';
import { createEvidenceService } from '../src/lib/evidence/service';
import { DeterministicModel } from '../src/lib/model/deterministic';
import { AnthropicUserModel } from '../src/lib/model/anthropic';
import { OpenAiUserModel, strictSchema } from '../src/lib/model/openai';
import { createUserModelService } from '../src/lib/model/service';
import { LocalKnowledgeStore } from '../src/lib/knowledge/local-store';
import { AnthropicCatalog, LocalCatalog, OpenAiCatalog, type ProviderCatalog } from '../src/lib/model-keys/catalog';
import { openKey, sealKey } from '../src/lib/model-keys/crypto';
import { LocalModelKeyStore } from '../src/lib/model-keys/local-store';
import { ConnectSchema, ModelKeyService } from '../src/lib/model-keys/service';
import { deleteAccount } from '../src/lib/privacy/deletion';
import { AppError } from '../src/lib/errors';
import type { ModelInput, ModelService } from '../src/lib/contracts';

const secret = 's'.repeat(40); const claudeKey = 'sk-ant-api03-' + 'a'.repeat(40) + 'WXYZ'; const openAiKey = 'sk-proj-' + 'b'.repeat(40) + '1234';
const now = '2026-11-12T10:00:00.000Z';
const closers: { close(): void }[] = [];
afterEach(() => { closers.splice(0).forEach(item => item.close()); vi.restoreAllMocks(); });
const config = (extra: Record<string, string> = {}) => readConfig({ DEVILS_RUNTIME_MODE: 'local', DEVILS_LOCAL_AUTH_SECRET: 'x'.repeat(32), DEVILS_BETA_ACTIVE: 'true', ...extra });
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('key encryption', () => {
  it('opens only with the same secret and the same account and provider', () => {
    const sealed = sealKey(claudeKey, secret, 'u:anthropic');
    expect(sealed).not.toContain(claudeKey);
    expect(sealKey(claudeKey, secret, 'u:anthropic')).not.toBe(sealed);
    expect(openKey(sealed, secret, 'u:anthropic')).toBe(claudeKey);
    expect(openKey(sealed, 't'.repeat(40), 'u:anthropic')).toBeNull();
    expect(openKey(sealed, secret, 'other:anthropic')).toBeNull();
    expect(openKey(sealed.slice(0, -2) + 'AA', secret, 'u:anthropic')).toBeNull();
    expect(openKey('not-a-sealed-value', secret, 'u:anthropic')).toBeNull();
  });
});

function keyService(options: { secret?: string; catalog?: ProviderCatalog; store?: LocalModelKeyStore } = {}) {
  const store = options.store ?? new LocalModelKeyStore(':memory:'); if (!options.store) closers.push(store);
  const catalog = options.catalog ?? { listModels: vi.fn(async () => ['model-large', 'model-small']) };
  return { store, catalog, service: new ModelKeyService({ store, secret: options.secret ?? secret, catalogs: { anthropic: catalog, openai: catalog }, now: () => new Date(now) }) };
}

describe('saving a person’s own key', () => {
  it('checks the key with the provider, stores it encrypted and shows only its last four characters', async () => {
    const { service, store, catalog } = keyService();
    const saved = await service.connect('u', { provider: 'anthropic', apiKey: claudeKey });
    expect(catalog.listModels).toHaveBeenCalledWith(claudeKey);
    expect(saved).toEqual({ connection: { provider: 'anthropic', model: 'model-large', last4: 'WXYZ', updatedAt: now, needsReconnect: false }, models: ['model-large', 'model-small'] });
    expect(JSON.stringify(await store.get('u'))).not.toContain(claudeKey);
    expect(JSON.stringify(saved)).not.toContain(claudeKey);
    expect(await service.credentials('u')).toEqual({ provider: 'anthropic', model: 'model-large', apiKey: claudeKey });
    expect(await service.credentials('someone-else')).toBeNull();
  });
  it('stores nothing when the provider rejects the key', async () => {
    const { service, store } = keyService({ catalog: { listModels: async () => { throw new AppError('MODEL_KEY_REJECTED', 'Claude did not accept that API key.', 400); } } });
    await expect(service.connect('u', { provider: 'anthropic', apiKey: claudeKey })).rejects.toMatchObject({ code: 'MODEL_KEY_REJECTED', status: 400 });
    expect(await store.get('u')).toBeNull();
  });
  it('refuses a Claude key pasted as an OpenAI key without calling OpenAI', async () => {
    const { service, catalog } = keyService();
    await expect(service.connect('u', { provider: 'openai', apiKey: claudeKey })).rejects.toMatchObject({ code: 'MODEL_KEY_REJECTED' });
    expect(catalog.listModels).not.toHaveBeenCalled();
  });
  it('changes the model only to one the key can use, and removes the key on request', async () => {
    const { service } = keyService();
    await service.connect('u', { provider: 'openai', apiKey: openAiKey });
    expect(await service.chooseModel('u', 'model-small')).toMatchObject({ provider: 'openai', model: 'model-small', last4: '1234' });
    await expect(service.chooseModel('u', 'model-unknown')).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
    await expect(service.connect('u', { provider: 'openai', apiKey: openAiKey, model: 'model-unknown' })).rejects.toMatchObject({ code: 'MODEL_UNAVAILABLE' });
    await service.disconnect('u');
    expect(await service.connection('u')).toBeNull();
    await expect(service.models('u')).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
  it('is switched off without an encryption secret', async () => {
    const { service } = keyService({ secret: '' });
    expect(service.available).toBe(false);
    await expect(service.connect('u', { provider: 'anthropic', apiKey: claudeKey })).rejects.toMatchObject({ code: 'OWN_AI_UNAVAILABLE', status: 503 });
    expect(await service.credentials('u')).toBeNull();
  });
  it('asks for the key again when it was saved under a different secret', async () => {
    const { service, store } = keyService();
    await service.connect('u', { provider: 'anthropic', apiKey: claudeKey });
    const rotated = keyService({ secret: 'r'.repeat(40), store }).service;
    expect(await rotated.connection('u')).toMatchObject({ needsReconnect: true, last4: 'WXYZ' });
    expect(await rotated.credentials('u')).toBeNull();
    await expect(rotated.chooseModel('u', 'model-small')).rejects.toMatchObject({ code: 'MODEL_KEY_UNREADABLE' });
  });
  it('rejects keys with spaces, too short or too long, and unknown fields', () => {
    for (const apiKey of ['short', 'has a space in the middle of it', 'x'.repeat(301)]) expect(ConnectSchema.safeParse({ provider: 'openai', apiKey }).success).toBe(false);
    expect(ConnectSchema.safeParse({ provider: 'gemini', apiKey: openAiKey }).success).toBe(false);
    expect(ConnectSchema.safeParse({ provider: 'openai', apiKey: openAiKey, userId: 'other' }).success).toBe(false);
  });
  it('removes the key when the account is deleted', async () => {
    const store = new LocalStore(':memory:'); closers.push(store);
    await store.putProfile({ id: 'u', email: 'a@example.com', disabled: false, deletionState: 'none', createdAt: now });
    const { service } = keyService();
    await service.connect('u', { provider: 'anthropic', apiKey: claudeKey });
    await deleteAccount('u', { store, cancelRenewal: async () => {}, deleteIdentity: async () => {}, removeOwnAiKey: id => service.disconnect(id) });
    expect(await service.connection('u')).toBeNull();
  });
});

describe('provider model lists', () => {
  it('offers OpenAI chat models that accept a strict schema, newest first with the reviewed default leading', async () => {
    const ids = ['gpt-4', 'gpt-3.5-turbo', 'gpt-4o', 'gpt-4o-mini', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-6', 'gpt-6-mini', 'gpt-5.4-mini-2026-03-01', 'gpt-4o-audio-preview', 'gpt-image-1', 'text-embedding-3-large', 'o3', 'gpt-5-pro'];
    const catalog = new OpenAiCatalog(async (url, init) => { expect(url).toBe('https://api.openai.com/v1/models'); expect(new Headers(init!.headers).get('authorization')).toBe(`Bearer ${openAiKey}`); return json({ data: ids.map(id => ({ id })) }); });
    expect(await catalog.listModels(openAiKey)).toEqual(['gpt-5.4-mini', 'gpt-6-mini', 'gpt-6', 'gpt-5.4', 'gpt-5.4-nano', 'gpt-4o-mini', 'gpt-4o']);
  });
  it('reports a rejected OpenAI key, an unreachable provider and a key with no usable model differently', async () => {
    await expect(new OpenAiCatalog(async () => json({ error: {} }, 401)).listModels(openAiKey)).rejects.toMatchObject({ code: 'MODEL_KEY_REJECTED', status: 400 });
    await expect(new OpenAiCatalog(async () => json({}, 500)).listModels(openAiKey)).rejects.toMatchObject({ code: 'MODEL_PROVIDER_UNAVAILABLE', status: 503 });
    await expect(new OpenAiCatalog(async () => { throw new Error('network'); }).listModels(openAiKey)).rejects.toMatchObject({ code: 'MODEL_PROVIDER_UNAVAILABLE' });
    await expect(new OpenAiCatalog(async () => json({ data: [{ id: 'gpt-4' }] })).listModels(openAiKey)).rejects.toMatchObject({ code: 'MODEL_KEY_NO_MODELS' });
  });
  const capable = (id: string, on = true) => ({ id, type: 'model', display_name: id, created_at: '2026-01-01T00:00:00Z', max_input_tokens: 1000000, max_tokens: 128000,
    capabilities: { structured_outputs: { supported: on }, effort: { supported: on, low: { supported: on } }, thinking: { supported: true, types: { adaptive: { supported: on }, enabled: { supported: !on } } } } });
  it('offers the Claude models that support what a turn needs, with Claude Opus 5.5 first', async () => {
    const catalog = new AnthropicCatalog(async (url, init) => {
      expect(String(url)).toContain('https://api.anthropic.com/v1/models'); expect(new Headers(init!.headers).get('authorization')).toBe(`Bearer ${claudeKey}`);
      return json({ data: [capable('claude-haiku-4-5', false), capable('claude-haiku-5-5'), capable('claude-fable-5-2'), capable('claude-opus-5-5'), { ...capable('claude-old'), capabilities: null }], has_more: false, first_id: 'a', last_id: 'b' });
    });
    expect(await catalog.listModels(claudeKey)).toEqual(['claude-opus-5-5', 'claude-haiku-5-5', 'claude-fable-5-2']);
  });
  it('reports a rejected Claude key', async () => {
    await expect(new AnthropicCatalog(async () => json({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 401)).listModels(claudeKey)).rejects.toMatchObject({ code: 'MODEL_KEY_REJECTED', status: 400 });
  });
  it('accepts only local- keys in development and calls no provider', async () => {
    expect(await new LocalCatalog('openai').listModels('local-' + 'k'.repeat(30))).toEqual(['local-gpt-large', 'local-gpt-small']);
    await expect(new LocalCatalog('anthropic').listModels(claudeKey)).rejects.toMatchObject({ code: 'MODEL_KEY_REJECTED' });
  });
});

async function turnFixture() {
  const store = new LocalStore(':memory:'); closers.push(store);
  await store.putProfile({ id: 'u', email: 'synthetic@example.test', disabled: false, deletionState: 'none', createdAt: now });
  await store.putInvite({ userId: 'u', enabled: true, expiresAt: '2027-10-17T00:00:00Z' });
  const session = await store.createSession('u', { mode: 'business', topic: 'startup' }, now);
  const evidence = createEvidenceService();
  const input: ModelInput = { session, request: { operationId: 'a', expectedRevision: 0, action: 'message', text: 'Database developer tools customers pay because costs fall' }, task: 'turn', evidence: await evidence.retrieve({ mode: 'business', query: 'database', excludeIds: [], limit: 3 }), now };
  const envelope = { safety: 'ordinary', output: { response: 'Which customer pays first?', citations: [], state: { phase: 'debate', underlyingQuestion: 'Will customers pay?', clarifications: [], strengths: ['The proposal addresses a stated cost.'], counterpoints: [], openQuestions: ['Which customer will pay?'], nextStep: 'Interview three potential customers this month.', coverageNote: 'No reviewed source applies.', summary: 'Examined the payment assumption.' }, casePrep: null, assessment: null } };
  return { store, input, envelope };
}
const signal = () => new AbortController().signal;
const claudeMessage = (envelope: unknown, extra: Record<string, unknown> = {}) => json({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'text', text: JSON.stringify(envelope) }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 900, output_tokens: 120, cache_read_input_tokens: 100, cache_creation_input_tokens: 0 }, ...extra });

describe('Claude on a person’s own key', () => {
  const own = { apiKey: claudeKey, model: 'claude-opus-5-5' };
  it('sends one structured request with the person’s key, the default fallback and no app-budget cost', async () => {
    const { input, envelope } = await turnFixture(); const calls: { url: string; body: Record<string, unknown>; headers: Headers }[] = [];
    const model = new AnthropicUserModel(own, config(), async (url, init) => { calls.push({ url: String(url), body: JSON.parse(init!.body as string), headers: new Headers(init!.headers) }); return claudeMessage(envelope); });
    const result = await model.generate(input, signal());
    expect(calls).toHaveLength(1);
    const { url, body, headers } = calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(headers.get('authorization')).toBe(`Bearer ${claudeKey}`);
    expect(headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    expect(body).toMatchObject({ model: 'claude-opus-5-5', max_tokens: 16000, fallbacks: 'default', output_config: { effort: 'low', format: { type: 'json_schema' } } });
    expect(body.thinking).toBeUndefined(); expect(body.tool_choice).toBeUndefined(); expect(body.temperature).toBeUndefined();
    expect(JSON.stringify((body.output_config as { format: unknown }).format)).not.toMatch(/"(minLength|maxLength|maxItems)":/);
    expect(body.system).toContain('devil'); expect(JSON.stringify(body.messages)).not.toContain('synthetic@example.test');
    expect(JSON.stringify(body)).not.toContain(claudeKey);
    expect(result).toMatchObject({ inputTokens: 1000, outputTokens: 120, costMicros: 0 });
    expect((result.output as { response: string }).response).toBe('Which customer pays first?');
  });
  it('asks for more effort on the assessment', async () => {
    const { input, envelope } = await turnFixture(); let effort: unknown;
    const model = new AnthropicUserModel(own, config(), async (_url, init) => { effort = JSON.parse(init!.body as string).output_config.effort; return claudeMessage(envelope); });
    await model.generate({ ...input, task: 'card', request: { operationId: 'c', expectedRevision: 0 } }, signal());
    expect(effort).toBe('medium');
  });
  it('still answers, without the fallback, when the key’s organization does not have that beta', async () => {
    const { input, envelope } = await turnFixture(); const betas: (string | null)[] = []; const bodies: Record<string, unknown>[] = [];
    const model = new AnthropicUserModel(own, config(), async (_url, init) => {
      const beta = new Headers(init!.headers).get('anthropic-beta'); betas.push(beta); bodies.push(JSON.parse(init!.body as string));
      return beta ? json({ type: 'error', error: { type: 'invalid_request_error', message: 'Unexpected value(s) for the anthropic-beta header.' } }, 400) : claudeMessage(envelope);
    });
    expect((await model.generate(input, signal())).output).not.toBeNull();
    expect(betas).toEqual(['server-side-fallback-2026-07-01', null]);
    expect(bodies[1].fallbacks).toBeUndefined(); expect(bodies[1]).toMatchObject({ model: 'claude-opus-5-5', output_config: { effort: 'low', format: { type: 'json_schema' } } });
  });
  it('tells the person what to change when the key, the model or the rate limit is the problem', async () => {
    const { input } = await turnFixture();
    const failing = (status: number, type: string, headers: Record<string, string> = {}) => new AnthropicUserModel(own, config(), async () => json({ type: 'error', error: { type, message: 'provider detail that must not be shown' } }, status, headers));
    await expect(failing(401, 'authentication_error').generate(input, signal())).rejects.toMatchObject({ code: 'PROVIDER_ERROR', transient: false, message: expect.stringMatching(/Claude API key was not accepted/) });
    await expect(failing(404, 'not_found_error').generate(input, signal())).rejects.toMatchObject({ transient: false, message: expect.stringMatching(/model you chose is not available/) });
    await expect(failing(429, 'rate_limit_error', { 'retry-after': '7' }).generate(input, signal())).rejects.toMatchObject({ transient: true, retryAfterMs: 7000 });
    await expect(failing(529, 'overloaded_error').generate(input, signal())).rejects.toMatchObject({ transient: true });
    await expect(failing(401, 'authentication_error').generate(input, signal())).rejects.not.toMatchObject({ message: expect.stringContaining('provider detail') });
  });
  it('reports a declined request, and returns a cut-off reply as unverifiable with its usage', async () => {
    const { input, envelope } = await turnFixture();
    await expect(new AnthropicUserModel(own, config(), async () => claudeMessage(envelope, { stop_reason: 'refusal', content: [] })).generate(input, signal())).rejects.toMatchObject({ transient: false, message: expect.stringMatching(/declined/) });
    const cut = await new AnthropicUserModel(own, config(), async () => claudeMessage(envelope, { stop_reason: 'max_tokens' })).generate(input, signal());
    expect(cut).toMatchObject({ output: null, outputTokens: 120, costMicros: 0 });
    const invalid = await new AnthropicUserModel(own, config(), async () => claudeMessage({ nonsense: true })).generate(input, signal());
    expect(invalid.output).toBeNull();
  });
});

describe('OpenAI on a person’s own key', () => {
  const own = { apiKey: openAiKey, model: 'gpt-5.4-mini' };
  const completion = (envelope: unknown, extra: Record<string, unknown> = {}) => json({ model: 'gpt-5.4-mini', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(envelope) } }], usage: { prompt_tokens: 800, completion_tokens: 90 }, ...extra });
  it('sends one strict structured request with the person’s key and no app-budget cost', async () => {
    const { input, envelope } = await turnFixture();
    const model = new OpenAiUserModel(own, config(), async (url, init) => {
      expect(url).toBe('https://api.openai.com/v1/chat/completions'); expect(new Headers(init!.headers).get('authorization')).toBe(`Bearer ${openAiKey}`);
      const body = JSON.parse(init!.body as string);
      expect(body).toMatchObject({ model: 'gpt-5.4-mini', max_completion_tokens: 16000, store: false, response_format: { type: 'json_schema', json_schema: { name: 'decision_response', strict: true } } });
      expect(body.max_tokens).toBeUndefined(); expect(body.tools).toBeUndefined(); expect(body.messages).toHaveLength(2);
      expect(JSON.stringify(body.response_format)).not.toMatch(/"(\$schema|minLength|maxLength|maxItems|minItems)":/);
      expect(body.response_format.json_schema.schema.additionalProperties).toBe(false);
      expect(JSON.stringify(body)).not.toContain(openAiKey);
      return completion(envelope);
    });
    const result = await model.generate(input, signal());
    expect(result).toMatchObject({ inputTokens: 800, outputTokens: 90, costMicros: 0 });
    expect((result.output as { response: string }).response).toBe('Which customer pays first?');
  });
  it('keeps field names that look like schema keywords', () => {
    expect(strictSchema({ type: 'object', properties: { format: { type: 'string', maxLength: 3 }, pattern: { type: 'string' } }, required: ['format', 'pattern'], additionalProperties: false }))
      .toEqual({ type: 'object', properties: { format: { type: 'string' }, pattern: { type: 'string' } }, required: ['format', 'pattern'], additionalProperties: false });
  });
  it('tells the person what to change when the key, the credit or the rate limit is the problem', async () => {
    const { input } = await turnFixture();
    const failing = (status: number, code?: string, headers: Record<string, string> = {}) => new OpenAiUserModel(own, config(), async () => json({ error: { code, message: 'provider detail' } }, status, headers));
    await expect(failing(401, 'invalid_api_key').generate(input, signal())).rejects.toMatchObject({ transient: false, message: expect.stringMatching(/OpenAI API key was not accepted/) });
    await expect(failing(429, 'insufficient_quota').generate(input, signal())).rejects.toMatchObject({ transient: false, message: expect.stringMatching(/no credit left/) });
    await expect(failing(429, 'rate_limit_exceeded', { 'retry-after': '3' }).generate(input, signal())).rejects.toMatchObject({ transient: true, retryAfterMs: 3000 });
    await expect(failing(404, 'model_not_found').generate(input, signal())).rejects.toMatchObject({ transient: false, message: expect.stringMatching(/not available on your key/) });
    await expect(failing(503).generate(input, signal())).rejects.toMatchObject({ transient: true });
  });
  it('reports a refusal, and returns a cut-off or invalid reply as unverifiable', async () => {
    const { input, envelope } = await turnFixture();
    await expect(new OpenAiUserModel(own, config(), async () => completion(envelope, { choices: [{ finish_reason: 'stop', message: { refusal: 'no', content: null } }] })).generate(input, signal())).rejects.toMatchObject({ transient: false, message: expect.stringMatching(/declined/) });
    expect((await new OpenAiUserModel(own, config(), async () => completion(envelope, { choices: [{ finish_reason: 'length', message: { content: '{' } }] })).generate(input, signal())).output).toBeNull();
    await expect(new OpenAiUserModel(own, config(), async () => completion(envelope, { usage: {} })).generate(input, signal())).rejects.toMatchObject({ transient: false });
  });
});

describe('a turn paid for by a person’s own key', () => {
  const guidance = 'A monthly price only works when the customer sees value every month, so ask what they get each month.';
  async function engineFixture(services: { ownAi?: { withholdGuidance: boolean }; ownAiOffered?: boolean }) {
    const store = new LocalStore(':memory:'); closers.push(store);
    const knowledge = new LocalKnowledgeStore(':memory:'); closers.push(knowledge);
    const item = await knowledge.createItem({ kind: 'text', status: 'review', title: 'Owner notes', text: guidance, mimeType: 'text/plain', sizeBytes: guidance.length }, now);
    await knowledge.approveItem(item.id, [guidance], now);
    await store.putProfile({ id: 'u', email: 'a@example.com', disabled: false, deletionState: 'none', createdAt: now });
    await store.putInvite({ userId: 'u', enabled: true, expiresAt: '2027-10-15T00:00:00Z' });
    const session = await store.createSession('u', { mode: 'business', topic: 'startup' }, now);
    const local = new DeterministicModel(); const inputs: ModelInput[] = [];
    const model: ModelService = { generate: async (input, signal) => { inputs.push(structuredClone(input)); return { ...(await local.generate(input, signal)), costMicros: 0 }; } };
    const engine = new ConversationEngine({ store, config: config(), evidence: createEvidenceService(), model, clock: { now: () => new Date(now) }, knowledge, ...services });
    const say = () => engine.turn('u', session.id, { operationId: 'op-1', expectedRevision: 0, text: "I'll charge $10 a month", action: 'message' });
    return { store, say, inputs };
  }
  it('does not touch the app’s spend budget and leaves the owner’s private guidance out', async () => {
    const { store, say, inputs } = await engineFixture({ ownAi: { withholdGuidance: true }, ownAiOffered: true });
    const reserve = vi.spyOn(store, 'reserveSpend'); const reconcile = vi.spyOn(store, 'reconcileSpend');
    const session = await say();
    expect(session.messages.at(-1)!.text.endsWith('?')).toBe(true);
    expect(reserve).not.toHaveBeenCalled(); expect(reconcile).not.toHaveBeenCalled();
    expect(inputs[0].ownerGuidance).toEqual([]);
  });
  it('sends the guidance when the owner has chosen to', async () => {
    const { say, inputs } = await engineFixture({ ownAi: { withholdGuidance: false }, ownAiOffered: true });
    await say();
    expect(inputs[0].ownerGuidance).toEqual([{ text: guidance }]);
  });
  it('still works when the shared budget is exhausted', async () => {
    const { store, say } = await engineFixture({ ownAi: { withholdGuidance: true }, ownAiOffered: true });
    vi.spyOn(store, 'reserveSpend').mockRejectedValue(new AppError('SPEND_LIMIT', 'Budget reached', 503));
    await expect(say()).resolves.toMatchObject({ revision: 1 });
  });
  it('without a key, an exhausted shared budget points to connecting one', async () => {
    const { store, say } = await engineFixture({ ownAiOffered: true });
    vi.spyOn(store, 'reserveSpend').mockRejectedValue(new AppError('SPEND_LIMIT', 'Budget reached', 503));
    await expect(say()).rejects.toMatchObject({ code: 'SPEND_LIMIT', status: 503, message: expect.stringMatching(/Connect your own Claude or OpenAI key/) });
  });
  it('without a key and with the feature off, the budget message is unchanged and guidance is sent', async () => {
    const { store, say, inputs } = await engineFixture({});
    const reserve = vi.spyOn(store, 'reserveSpend');
    await say();
    expect(reserve).toHaveBeenCalledTimes(1); expect(inputs[0].ownerGuidance).toEqual([{ text: guidance }]);
    reserve.mockRejectedValue(new AppError('SPEND_LIMIT', 'Budget reached', 503));
  });
});

describe('configuration', () => {
  it('keeps the feature off in services mode until a secret of at least 32 characters is set', () => {
    const services = { DEVILS_RUNTIME_MODE: 'services', DEVILS_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co', DEVILS_SUPABASE_ANON_KEY: 'anon', DEVILS_SUPABASE_SERVICE_ROLE_KEY: 'service', DEVILS_MODEL_PROVIDER: 'gateway' };
    expect(readConfig(services)).toMatchObject({ keyEncryptionSecret: '', ownAiGuidance: 'withhold' });
    expect(readConfig({ ...services, DEVILS_KEY_ENCRYPTION_SECRET: secret, DEVILS_OWN_AI_GUIDANCE: 'send' })).toMatchObject({ keyEncryptionSecret: secret, ownAiGuidance: 'send' });
    expect(() => readConfig({ ...services, DEVILS_KEY_ENCRYPTION_SECRET: 'too-short' })).toThrow(/at least 32/);
    expect(() => readConfig({ ...services, DEVILS_OWN_AI_GUIDANCE: 'maybe' })).toThrow(/withhold or send/);
  });
  it('uses the development signing secret locally and never calls a provider there', () => {
    const local = config();
    expect(local.keyEncryptionSecret).toBe('x'.repeat(32));
    expect(createUserModelService({ provider: 'anthropic', model: 'claude-opus-5-5', apiKey: claudeKey }, local)).toBeInstanceOf(DeterministicModel);
  });
});
