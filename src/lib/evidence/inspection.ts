import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { EvidenceSchema, SafeUrlSchema, type Evidence } from '../contracts';
import { isReviewedEvidence, parseEvidence, sha256 } from './schema';

export const evidenceRoot = fileURLToPath(new URL('../../../data/evidence/', import.meta.url));
const hash = z.string().regex(/^[a-f0-9]{64}$/);
export const InspectionEntrySchema = z.object({ evidenceId: z.string().min(1), sourcePath: z.string().min(1), sourceSha256: hash, licensePath: z.string().min(1), licenseSha256: hash, normalization: z.string().min(1), sourceUrl: SafeUrlSchema, inspectedAt: z.string().datetime(), reviewedAt: z.string().datetime().nullable(), reviewedBy: z.string().nullable() }).strict();
export type InspectionEntry = z.infer<typeof InspectionEntrySchema>;
export async function safeSnapshotPath(root: string, relativePath: string): Promise<string> {
  if (path.isAbsolute(relativePath) || relativePath.includes('\\') || relativePath.split('/').includes('..') || !relativePath.startsWith('sources/')) throw new Error('Snapshot path must stay under sources/');
  const base = await realpath(path.join(root, 'sources'));
  const target = await realpath(path.join(root, relativePath));
  if (!target.startsWith(base + path.sep)) throw new Error('Snapshot symlink escapes sources/');
  return target;
}
export async function inspectEvidenceRecords(records: readonly Evidence[], manifest: readonly InspectionEntry[], root = evidenceRoot): Promise<{ records: number; excerpts: number }> {
  const entries = new Map(manifest.map(x => [x.evidenceId, x]));
  if (entries.size !== manifest.length || records.length !== entries.size || new Set(records.map(x => x.id)).size !== records.length) throw new Error('Collection and inspection manifest must have unique matching IDs');
  let excerpts = 0;
  for (const raw of records) {
    const evidence = parseEvidence(raw); const entry = entries.get(raw.id);
    if (!evidence || !entry) throw new Error('Invalid evidence or missing inspection');
    const source = await readFile(await safeSnapshotPath(root, entry.sourcePath), 'utf8');
    const license = await readFile(await safeSnapshotPath(root, entry.licensePath), 'utf8');
    if (!license.trim() || sha256(license) !== entry.licenseSha256) throw new Error('License snapshot hash mismatch');
    if (sha256(source) !== entry.sourceSha256 || evidence.sourceSha256 !== entry.sourceSha256 || evidence.url !== entry.sourceUrl) throw new Error('Source snapshot hash or pinned URL mismatch');
    if (evidence.inspectedAt !== entry.inspectedAt || evidence.reviewedAt !== entry.reviewedAt || evidence.reviewedBy !== entry.reviewedBy) throw new Error('Inspection/review metadata mismatch');
    for (const excerpt of evidence.excerpts) {
      if (!source.includes(excerpt.text) || sha256(excerpt.text) !== excerpt.sha256) throw new Error('Exact excerpt not present in inspected snapshot');
      excerpts++;
    }
  }
  return { records: records.length, excerpts };
}
export async function verifyEvidenceCollection(root = evidenceRoot): Promise<{ records: number; excerpts: number }> {
  const records = z.array(EvidenceSchema).min(1).parse(JSON.parse(await readFile(path.join(root, 'seed.json'), 'utf8')));
  if (records.some(x => !isReviewedEvidence(x))) throw new Error('Seed contains unreviewed evidence');
  const manifest = z.array(InspectionEntrySchema).parse(JSON.parse(await readFile(path.join(root, 'inspection.json'), 'utf8')));
  return inspectEvidenceRecords(records, manifest, root);
}
