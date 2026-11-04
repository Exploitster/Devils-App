import { expect, it } from 'vitest';
import { readConfig } from '../src/lib/config';
import { GatewayModel, gatewayRequest } from '../src/lib/model/gateway';
import { reserveCost } from '../src/lib/conversation/limits';
import type { ModelInput } from '../src/lib/contracts';
const config = () => readConfig({ DEVILS_RUNTIME_MODE: 'local', DEVILS_LOCAL_AUTH_SECRET: 'x'.repeat(32), DEVILS_MODEL_PROVIDER: 'gateway' });
const input: ModelInput = { session: { id: 's', ownerId: 'u', mode: 'business', topic: 'startup', title: 'Test', revision: 0, state: { phase: 'description', position: '', underlyingQuestion: '', clarifications: [], strengths: [], counterpoints: [], openQuestions: [], nextStep: '', usedArgumentIds: [], usedEvidenceIds: [], summary: '' }, messages: [], cards: [], createdAt: '2026-10-16T00:00:00Z', updatedAt: '2026-10-16T00:00:00Z' }, request: { operationId: 'a', expectedRevision: 0, text: 'An AI booking assistant', action: 'message' }, task: 'turn', evidence: [], now: '2026-10-16T00:00:00Z' };
const envelope = { safety: 'ordinary', output: { response: 'Which customer will pay?', citations: [], state: { phase: 'clarifying', underlyingQuestion: 'Will customers pay?', clarifications: [{ id: 'payer', question: 'Which customer will pay?' }], strengths: [], counterpoints: [], openQuestions: [], nextStep: '', coverageNote: 'No reviewed evidence covers this market.', summary: 'Clarifying the payer.' } } };
it('uses fresh OIDC authentication and Gateway fields without OpenRouter options', async () => {
  const cfg = config(); let tokens = 0;
  const model = new GatewayModel(cfg, async (url, options) => {
    expect(url).toBe('https://ai-gateway.vercel.sh/v1/chat/completions');
    expect(new Headers(options!.headers).get('authorization')).toBe(`Bearer oidc-${tokens}`);
    const body = JSON.parse(options!.body as string);
    expect(body.model).toBe(cfg.model); expect(body.models).toBeUndefined(); expect(body.provider).toBeUndefined();
    expect(body.providerOptions.gateway.only.length).toBeGreaterThan(0);
    expect(body.response_format.json_schema.strict).toBe(true);
    return new Response(JSON.stringify({ model: cfg.model, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(envelope) } }], usage: { prompt_tokens: 100, completion_tokens: 50 } }));
  }, () => `oidc-${++tokens}`);
  const result = await model.generate(input, new AbortController().signal);
  expect(result.output).toMatchObject({ response: 'Which customer will pay?' });
  expect(result.costKnown).toBe(false);
  expect(result.costMicros).toBe(reserveCost(input, { ...cfg, mode: 'services' }));
  await model.generate(input, new AbortController().signal); expect(tokens).toBe(2);
});
it('uses known billed cost when supplied and does not double count reasoning tokens', async () => {
  const cfg = config();
  const model = new GatewayModel(cfg, async () => new Response(JSON.stringify({ model: cfg.model, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(envelope) } }], usage: { prompt_tokens: 100, completion_tokens: 50, completion_tokens_details: { reasoning_tokens: 20 }, cost: 0.0003 } })), () => 'oidc');
  expect(await model.generate(input, new AbortController().signal)).toMatchObject({ outputTokens: 50, costMicros: 300, costKnown: true });
});
it('fails closed without credentials, token usage, or a permitted model', async () => {
  const cfg = config();
  await expect(new GatewayModel(cfg, async () => { throw new Error('Must not call'); }, () => '').generate(input, new AbortController().signal)).rejects.toMatchObject({ transient: false });
  const model = new GatewayModel(cfg, async () => new Response(JSON.stringify({ model: 'unapproved/model', choices: [], usage: { prompt_tokens: 1, completion_tokens: 1 } })), () => 'oidc');
  expect((await model.generate(input, new AbortController().signal)).output).toBeNull();
  await expect(new GatewayModel(cfg, async () => new Response('{}'), () => 'oidc').generate(input, new AbortController().signal)).rejects.toMatchObject({ transient: false });
});
it('serializes the same Gateway request for transport and conservative cost reservation', () => {
  const cfg = { ...config(), mode: 'services' as const };
  expect(reserveCost(input, cfg)).toBe(Math.ceil((Buffer.byteLength(JSON.stringify(gatewayRequest(input, cfg))) + 1024) * cfg.modelInputUsdPerMillion + cfg.maxOutputTokens * cfg.modelOutputUsdPerMillion));
});
it('keeps the full spending reservation when Gateway omits billed cost', async () => {
  const { LocalStore } = await import('../src/lib/store/local');
  const { ConversationEngine } = await import('../src/lib/conversation/engine');
  const { createEvidenceService } = await import('../src/lib/evidence/service');
  const { vi } = await import('vitest');
  const store = new LocalStore(':memory:');
  try {
    await store.putProfile({ id: 'u', email: 'synthetic@example.test', disabled: false, deletionState: 'none', createdAt: input.now });
    await store.putInvite({ userId: 'u', enabled: true, expiresAt: '2026-10-17T00:00:00Z' });
    const session = await store.createSession('u', { mode: 'business', topic: 'startup' }, input.now);
    const cfg = { ...config(), mode: 'services' as const, betaActive: true };
    const reconcile = vi.spyOn(store, 'reconcileSpend');
    const reserve = vi.spyOn(store, 'reserveSpend');
    const model = new GatewayModel(cfg, async () => new Response(JSON.stringify({ model: cfg.model, choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(envelope) } }], usage: { prompt_tokens: 100, completion_tokens: 50 } })), () => 'oidc');
    const engine = new ConversationEngine({ store, model, config: cfg, evidence: createEvidenceService(), clock: { now: () => new Date(input.now) } });
    await engine.turn('u', session.id, { operationId: 'a', expectedRevision: 0, text: 'An AI booking assistant', action: 'message' });
    expect(reserve).toHaveBeenCalledOnce(); expect(reconcile).not.toHaveBeenCalled();
    expect((await store.listUsage('u', ''))[0].costMicros).toBe(reserve.mock.calls[0][0].reservedMicros);
  } finally { store.close(); }
});
it('honors Gateway retry-after headers and uses a conservative free-tier backoff', async () => {
  for (const [headers, delay] of [[{ 'retry-after': '12' }, 12000], [{}, 60000], [{ 'retry-after': '999999' }, 120000]] as const) {
    const model = new GatewayModel(config(), async () => new Response('', { status: 429, headers }), () => 'oidc');
    await expect(model.generate(input, new AbortController().signal)).rejects.toMatchObject({ transient: true, retryAfterMs: delay });
  }
});
it('removes detached response citations when a skipped clarification becomes a reflection',async()=>{
 const {createEvidenceService}=await import('../src/lib/evidence/service');
 const {decodeRouterOutput}=await import('../src/lib/model/openrouter-request');
 const {controlOutput}=await import('../src/lib/conversation/state');
 const evidence=createEvidenceService();const retrieved=await evidence.retrieve({mode:'business',query:'database',excludeIds:[],limit:3});
 const source=retrieved[0];const claim=source.claims[0];const ref={evidenceId:source.id,claimId:claim.id,excerptId:claim.excerptIds[0],kind:'quote' as const};
 const skipped=structuredClone(input);skipped.evidence=retrieved;skipped.session.state.clarifications=[{id:'payer',question:'Which customer will pay?',skipped:false}];skipped.request={operationId:'skip',expectedRevision:0,text:'I do not know.',action:'skip'};
 const raw={...envelope,output:{...envelope.output,citations:[ref],state:{...envelope.output.state,counterpoints:[{source:ref,interpretation:'Test whether this constraint applies.'}]}}};
 const decoded=decodeRouterOutput(JSON.stringify(raw),skipped)!;expect(decoded.citations).toHaveLength(1);
 const controlled=controlOutput(skipped,decoded);const checked=await evidence.validate(controlled,retrieved);
 expect(checked.state.phase).toBe('debate');expect(checked.citations).toEqual([]);expect(checked.state.counterpoints[0].citations).toHaveLength(1);
});
it('reports empty reflection fields and invalid reference selections without logging text',async()=>{
 const {gatewayResponseDiagnostics}=await import('../src/lib/model/gateway-request');
 const raw={...envelope,output:{...envelope.output,response:'PRIVATE_GENERATED_TEXT',state:{...envelope.output.state,phase:'debate',underlyingQuestion:'PRIVATE_QUESTION',nextStep:'',counterpoints:[{source:{evidenceId:'private-source',claimId:'private-claim',excerptId:'private-excerpt',kind:'quote'},interpretation:'PRIVATE_INTERPRETATION'}]}}};
 const diagnostics=gatewayResponseDiagnostics(JSON.stringify(raw),[]);
 expect(diagnostics).toMatchObject({status:'valid',sourceReferencesValid:false,missingReflectionFields:['strengths','openQuestions','nextStep']});
 expect(JSON.stringify(diagnostics)).not.toMatch(/PRIVATE|private-source|private-claim|private-excerpt/);
 expect(gatewayResponseDiagnostics('{invalid',[])).toEqual({status:'not-json'});
});
