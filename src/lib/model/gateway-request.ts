import type { Evidence, ModelInput } from '../contracts';
import type { RuntimeConfig } from '../config';
import { openRouterRequest, RouterEnvelopeSchema } from './openrouter-request';
import { resolveCitation } from '../evidence/validate';
export const gatewayPromptVersion = 'devils-advocate-gateway/2';
export function gatewayRequest(input: ModelInput, config: RuntimeConfig) {
  const { messages, stream, max_tokens, response_format } = openRouterRequest(input, config);
  messages[0].content += `\nGateway prompt version: ${gatewayPromptVersion}. For phase debate or card, output.state.underlyingQuestion and output.state.nextStep must each contain meaningful nonempty text, and output.state.strengths and output.state.openQuestions must each contain at least one meaningful nonempty entry. A skipped clarification means proceed with uncertainty and a useful reflection, rather than leaving these fields empty. Select evidenceId, claimId and excerptId from the same supplied source and use only excerpt IDs linked to that claim. For task card, use phase card and summarize the established decision. Preserve currently supported counterpoints by selecting their supplied evidence references; a card may reuse sources already discussed. Evidence exhaustion means no new facts, and does not invalidate existing supported counterpoints.`;
  return { model: config.model, messages, stream, max_tokens, response_format,
    providerOptions: { gateway: { only: config.gatewayProviders } } };
}

/** Safe build diagnostics: counts/flags only, never generated or user text. */
export function gatewayResponseDiagnostics(raw: string, evidence: readonly Evidence[]) {
  let decoded: unknown;
  try { decoded = JSON.parse(raw); } catch { return { status: 'not-json' as const }; }
  const parsed = RouterEnvelopeSchema.safeParse(decoded);
  if (!parsed.success) return { status: 'invalid' as const, issues: parsed.error.issues.map(issue => ({ code: issue.code, path: issue.path })) };
  const { output } = parsed.data; const { state } = output;
  const missingReflectionFields = [
    ...(!state.underlyingQuestion.trim() ? ['underlyingQuestion'] : []),
    ...(!state.strengths.some(value => value.trim()) ? ['strengths'] : []),
    ...(!state.openQuestions.some(value => value.trim()) ? ['openQuestions'] : []),
    ...(!state.nextStep.trim() ? ['nextStep'] : []),
  ];
  let sourceReferencesValid = true;
  for (const ref of [...output.citations, ...state.counterpoints.map(point => point.source)]) {
    const source = evidence.find(item => item.id === ref.evidenceId);
    const excerpt = source?.excerpts.find(item => item.id === ref.excerptId);
    try { resolveCitation({ ...ref, ...(ref.kind === 'quote' ? { quote: excerpt?.text } : {}) }, evidence); }
    catch { sourceReferencesValid = false; }
  }
  return { status: 'valid' as const, phase: state.phase, counterpoints: state.counterpoints.length, citations: output.citations.length, sourceReferencesValid, missingReflectionFields };
}
