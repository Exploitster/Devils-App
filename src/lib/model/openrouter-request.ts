import { z } from 'zod';
import { IdSchema, TextSchema, type Citation, type ModelInput, type ModelOutput } from '../contracts';
import type { RuntimeConfig } from '../config';
import { prepareState } from '../conversation/state';
import { assessSafety } from '../conversation/safety';
import { resolveCitation } from '../evidence/validate';
import { systemInstructions, providerInput } from './provider';

// Providers select references, never author quotations, supported claims, cards,
// positions or historical authority IDs. All wire fields are required for strict JSON mode.
const SourceReferenceSchema = z.object({ evidenceId: IdSchema, claimId: IdSchema, excerptId: IdSchema, kind: z.enum(['quote', 'paraphrase']) }).strict();
const PointSchema = z.object({ source: SourceReferenceSchema, interpretation: z.string().max(3000) }).strict();
export const RouterEnvelopeSchema = z.object({
  safety: z.enum(['ordinary', 'crisis', 'harm', 'political', 'qualified']),
  output: z.object({
    response: TextSchema,
    citations: z.array(SourceReferenceSchema).max(9),
    state: z.object({
      phase: z.enum(['clarifying', 'debate', 'card', 'support']),
      underlyingQuestion: z.string().max(3000),
      clarifications: z.array(z.object({ id: IdSchema, question: z.string().min(1).max(1000) }).strict()).max(3),
      strengths: z.array(TextSchema).max(5), counterpoints: z.array(PointSchema).max(3),
      openQuestions: z.array(TextSchema).max(5), nextStep: z.string().max(3000),
      coverageNote: z.string().max(2000), summary: z.string().max(6000),
    }).strict(),
  }).strict(),
}).strict();
export const routerPromptVersion = 'devils-advocate-openrouter/1';
const routerResponseSchema = z.toJSONSchema(RouterEnvelopeSchema);
delete routerResponseSchema.$schema;
export function openRouterRequest(input: ModelInput, config: RuntimeConfig) {
  return {
    models: [config.model, ...config.fallbackModels],
    messages: [
      { role: 'system', content: `${systemInstructions(input)}\n\nTransport version: ${routerPromptVersion}. Follow the provided JSON schema. Select counterpoints using source references and put your application hypothesis in interpretation. Do not output counterpoint text, quote text, cards, positions or used IDs: the server supplies them. For response citations, select references; the server appends their exact reviewed wording. Do not write quotations from memory. If no supplied source is relevant, use empty citations/counterpoints, explain the evidence gap and propose a test. In a clarifying response use no response citations.` },
      { role: 'user', content: JSON.stringify(providerInput(input)) },
    ],
    stream: false, max_tokens: config.maxOutputTokens,
    provider: { allow_fallbacks: true, require_parameters: true, data_collection: 'deny', zdr: true, max_price: { prompt: config.modelInputUsdPerMillion, completion: config.modelOutputUsdPerMillion, request: 0 } },
    response_format: { type: 'json_schema', json_schema: { name: 'decision_response', strict: true, schema: routerResponseSchema } },
  };
}

/** Selection is resolved only against this operation's evidence. The engine then
 * validates again against the private canonical corpus before committing. */
export function decodeRouterOutput(raw: string, input: ModelInput): ModelOutput | null {
  try {
    const envelope = RouterEnvelopeSchema.parse(JSON.parse(raw));
    const prepared = prepareState(input);
    if (['crisis', 'harm', 'political'].includes(envelope.safety)) {
      const trigger = envelope.safety === 'crisis' ? 'want to die' : envelope.safety === 'harm' ? 'help kill someone' : 'political debate';
      return { state: { ...prepared, phase: 'support', strengths: [], counterpoints: [], openQuestions: [] }, response: assessSafety(trigger).response!, citations: [] };
    }
    const citation = (ref: z.infer<typeof SourceReferenceSchema>): Citation => {
      const source = input.evidence.find(e => e.id === ref.evidenceId);
      const excerpt = source?.excerpts.find(e => e.id === ref.excerptId);
      const result: Citation = { ...ref, ...(ref.kind === 'quote' ? { quote: excerpt?.text } : {}) };
      resolveCitation(result, input.evidence); // Reject unknown IDs, prohibited quotes and mismatched claim/excerpt pairs.
      return result;
    };
    const value = envelope.output;
    const citations = value.citations.map(citation);
    const counterpoints = value.state.counterpoints.map(point => {
      const ref = citation(point.source); const resolved = resolveCitation(ref, input.evidence);
      return { id: resolved.claimId, text: resolved.claimText, interpretation: point.interpretation, citations: [ref] };
    });
    let response = value.response;
    // Clarifications are rendered by the controller as a single question. Keep
    // them source-free so its rewrite cannot detach citations from their text.
    if (value.state.phase === 'clarifying' && citations.length) return null;
    for (const ref of citations) {
      const source = resolveCitation(ref, input.evidence);
      const text = source.text;
      if (!response.includes(text)) response += `\n\nReviewed source (${source.title}): ${text}`;
    }
    if (envelope.safety === 'qualified') response = `${assessSafety('medication').response}\n\n${response}`;
    return { state: { ...prepared, ...value.state, clarifications: value.state.clarifications.map(q => ({ ...q, skipped: false })), counterpoints }, response, citations };
  } catch { return null; }
}
