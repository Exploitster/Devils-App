import { createHash } from 'node:crypto';
import { EvidenceSchema, type Evidence } from '../contracts';

export const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const onStackExchange = (url: string) => { const host = new URL(url).hostname; return host === 'stackexchange.com' || host.endsWith('.stackexchange.com'); };
// Stack Exchange content is CC BY-SA: it needs the site, post, linked authors and licence
// beside every excerpt, and only verbatim quotes, so the app never creates an adaptation.
export function stackExchangeIssue(evidence: Evidence): string | null {
  if (!onStackExchange(evidence.url) && !(evidence.attribution && onStackExchange(evidence.attribution.postUrl))) return null;
  if (!evidence.attribution || !onStackExchange(evidence.attribution.postUrl)) return 'Stack Exchange records need attribution linking the original post';
  if (evidence.claims.some(x => x.paraphraseAllowed)) return 'Stack Exchange claims cannot allow paraphrase';
  return null;
}
export function parseEvidence(value: unknown): Evidence | null {
  const result = EvidenceSchema.safeParse(value);
  if (!result.success) return null;
  const evidence = result.data;
  if (stackExchangeIssue(evidence)) return null;
  const excerpts = new Map(evidence.excerpts.map(x => [x.id, x]));
  if (excerpts.size !== evidence.excerpts.length || new Set(evidence.claims.map(x => x.id)).size !== evidence.claims.length) return null;
  if (evidence.excerpts.some(x => sha256(x.text) !== x.sha256)) return null;
  if (evidence.claims.some(x => x.excerptIds.some(id => !excerpts.has(id)))) return null;
  return evidence;
}
export function isReviewedEvidence(value: unknown): value is Evidence {
  const evidence = parseEvidence(value);
  return !!evidence && evidence.status === 'reviewed' && !!evidence.reviewedAt && !!evidence.inspectedAt && !!evidence.reviewedBy?.trim() && Date.parse(evidence.reviewedAt) >= Date.parse(evidence.inspectedAt);
}
