import { createHash } from 'node:crypto';
import { EvidenceSchema, type Evidence } from '../contracts';

export const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
export function parseEvidence(value: unknown): Evidence | null {
  const result = EvidenceSchema.safeParse(value);
  if (!result.success) return null;
  const evidence = result.data;
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
