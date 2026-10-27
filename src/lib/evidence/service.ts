import seed from '../../../data/evidence/seed.json';
import type { Evidence, EvidenceService } from '../contracts';
import { isReviewedEvidence, parseEvidence } from './schema';
import { retrieveEvidence } from './retrieve';
import { validateCitations } from './validate';

export function createEvidenceService(records: readonly unknown[] = seed): EvidenceService {
  const collection: Evidence[] = [];
  const ids = new Set<string>();
  for (const record of records) {
    const parsed = parseEvidence(record);
    if (!parsed || !isReviewedEvidence(parsed)) continue;
    if (ids.has(parsed.id)) throw new Error('Duplicate canonical evidence ID');
    ids.add(parsed.id); collection.push(parsed);
  }
  // Schema parsing creates private canonical copies. All returned data is cloned;
  // caller/provider mutation cannot change subsequent validation authority.
  return {
    async retrieve(input) { return retrieveEvidence(input, collection); },
    async get(id) { const found = collection.find(x => x.id === id); return found ? structuredClone(found) : null; },
    async validate(output, retrieved) { return validateCitations(output, retrieved, collection); },
  };
}
