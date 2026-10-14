import { CitationSchema, MessageSchema, ModelOutputSchema, type Citation, type Counterpoint, type Evidence, type EvidenceClaim, type Message, type ModelOutput } from '../contracts';
import { isReviewedEvidence } from './schema';

export class CitationValidationError extends Error { constructor(message: string) { super(message); this.name = 'CitationValidationError'; } }
export interface ResolvedCitation { evidenceId: string; claimId: string; excerptId: string; label: 'Exact quote' | 'Paraphrase'; supportType: EvidenceClaim['supportType']; url: string; title: string; author: string; work: string; edition: string; locator: string; text: string; claimText: string; license: string; limitations: string[]; }
export function resolveCitation(value: Citation, canonical: readonly Evidence[]): ResolvedCitation {
  const parsed = CitationSchema.safeParse(value);
  if (!parsed.success) throw new CitationValidationError('Invalid citation shape');
  const citation = parsed.data; const evidence = canonical.find(e => e.id === citation.evidenceId && isReviewedEvidence(e));
  if (!evidence) throw new CitationValidationError('Unknown or unreviewed evidence');
  const claim = evidence.claims.find(c => c.id === citation.claimId);
  const excerpt = evidence.excerpts.find(x => x.id === citation.excerptId);
  if (!claim || !excerpt || !claim.excerptIds.includes(excerpt.id)) throw new CitationValidationError('Claim does not support this excerpt');
  if (citation.kind === 'quote') {
    if (!excerpt.quoteAllowed || citation.quote !== excerpt.text) throw new CitationValidationError('Quotation must equal the permitted stored excerpt');
  } else if (!claim.paraphraseAllowed || citation.quote !== undefined) throw new CitationValidationError('Paraphrase is not permitted or carries quote text');
  return { evidenceId: evidence.id, claimId: claim.id, excerptId: excerpt.id, label: citation.kind === 'quote' ? 'Exact quote' : 'Paraphrase', supportType: claim.supportType, url: evidence.url, title: evidence.title, author: evidence.author, work: evidence.work, edition: evidence.edition, locator: excerpt.locator, text: citation.kind === 'quote' ? excerpt.text : claim.text, claimText: claim.text, license: evidence.license, limitations: [...evidence.limitations] };
}
export function validateCitations(output: unknown, retrieved: readonly Evidence[], canonical: readonly Evidence[]): ModelOutput {
  const parsed = ModelOutputSchema.safeParse(output);
  if (!parsed.success) throw new CitationValidationError('Invalid model output shape');
  const value = parsed.data; const allowed = new Set(retrieved.map(e => e.id));
  const resolve = (citation: Citation) => {
    if (!allowed.has(citation.evidenceId)) throw new CitationValidationError('Evidence was not retrieved for this operation');
    // Supplied retrieval contents are never citation authority. Only canonical data is.
    return resolveCitation(citation, canonical);
  };
  const counterpoints = (points: Counterpoint[]) => points.forEach(point => point.citations.forEach(citation => {
    const source = resolve(citation);
    if (point.text !== source.claimText) throw new CitationValidationError('Sourced counterpoint text must equal the curated supported claim; apply it in interpretation');
  }));
  value.citations.forEach(citation => {
    const source = resolve(citation);
    if (!value.response.includes(source.claimText) && !(citation.kind === 'quote' && value.response.includes(source.text))) throw new CitationValidationError('Response citation lacks its stored claim or exact excerpt');
  });
  counterpoints(value.state.counterpoints);
  if (value.card) counterpoints(value.card.counterpoints);
  return value;
}

// Saved assistant messages use the same server authority as fresh responses. Callers
// supply the relevant operation/history retrieval set, never browser-authored records.
export function validateMessageCitations(messages: readonly Message[], retrieved: readonly Evidence[], canonical: readonly Evidence[]): void {
  const allowed = new Set(retrieved.map(e => e.id));
  for (const raw of messages) {
    const message = MessageSchema.parse(raw);
    for (const citation of message.citations) {
      if (!allowed.has(citation.evidenceId)) throw new CitationValidationError('Message evidence was not retrieved');
      const source = resolveCitation(citation, canonical);
      if (!message.text.includes(source.claimText) && !(citation.kind === 'quote' && message.text.includes(source.text))) throw new CitationValidationError('Message citation lacks its stored claim or exact excerpt');
    }
  }
}
