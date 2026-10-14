import type { Evidence, Mode, Topic } from '../contracts';
import { isReviewedEvidence } from './schema';

export interface RetrievalInput { mode: Mode; query: string; excludeIds: string[]; limit: number; topic?: Topic; }
const normalize = (text: string) => text.toLowerCase().normalize('NFKC').replace(/[^a-z0-9]+/g, ' ').trim();
const phraseMatch = (query: string, phrase: string) => (` ${query} `).includes(` ${normalize(phrase)} `);
// Narrow domain anchors are editorial policy for the current corpus. Generic business
// vocabulary does not make developer-infrastructure evidence comparable to any startup.
function domainMatches(e: Evidence, query: string): boolean {
  if (e.mode !== 'business') return true;
  if (/\b(food|delivery|hostel|india|crm|consumer|restaurant|grocery|travel|booking)\b/.test(query)) return false;
  const editor = /\b(atom|editor|editors)\b/.test(query);
  if (e.id === 'atom-product-retirement-2022') return editor;
  if (e.id === 'rethinkdb-shutdown-2016') return /\b(rethinkdb|database|databases)\b/.test(query) || (!editor && ['developer tools', 'developer infrastructure', 'open source', 'software infrastructure'].some(x => phraseMatch(query, x)));
  // New reviewed business records must carry specific lexical domain tags; unknown
  // records cannot enter retrieval merely through a generic business/customer tag.
  return e.claims.some(c => c.topics.some(tag => !['business', 'customer', 'startup', 'software startup', 'sustainability'].includes(normalize(tag)) && phraseMatch(query, tag)));
}
export function retrieveEvidence(input: RetrievalInput, collection: readonly Evidence[]): Evidence[] {
  const query = normalize(input.query); const limit = Math.min(3, Math.max(0, Math.floor(input.limit)));
  if (!query || !Number.isFinite(limit)) return [];
  const excluded = new Set(input.excludeIds);
  return collection.filter(isReviewedEvidence).filter(e => e.mode === input.mode && !excluded.has(e.id) && domainMatches(e, query))
    .map(e => ({ e, score: e.claims.reduce((sum, c) => sum + c.topics.filter(tag => phraseMatch(query, tag)).length, 0) + (input.mode === 'business' ? 1 : 0) }))
    .filter(x => x.score > 0).sort((a, b) => b.score - a.score || a.e.id.localeCompare(b.e.id)).slice(0, limit).map(x => structuredClone(x.e));
}
