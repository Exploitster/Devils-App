import { readFile, mkdir, writeFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { EvidenceSchema } from '../src/lib/contracts';
import { evidenceRoot, InspectionEntrySchema, inspectEvidenceRecords, verifyEvidenceCollection } from '../src/lib/evidence/inspection';

// This CLI performs no network fetch. Inspection checks local source/version integrity;
// an explicit named reviewer separately attests to support, context and licensing.
export async function runEvidenceImport(args: string[], root = evidenceRoot): Promise<string> {
  if (args.length === 1 && args[0] === '--verify') {
    const result = await verifyEvidenceCollection(root);
    return `Verified ${result.records} reviewed records and ${result.excerpts} exact excerpts with source/license snapshots.`;
  }
  const operations = ['--draft', '--inspect', '--review'].filter(x => args.includes(x));
  if (operations.length !== 1) throw new Error('Use --verify, or one of --draft/--inspect/--review FILE with --output drafts/FILE.json and --manifest FILE');
  const option = (name: string) => { const i = args.indexOf(name); const value = args[i + 1]; if (i < 0 || !value || value.startsWith('--')) throw new Error(`Missing ${name}`); return value; };
  const operation = operations[0];
  const outputName = option('--output');
  if (!/^drafts\/[a-zA-Z0-9._-]+\.json$/.test(outputName) || outputName.includes('..')) throw new Error('Output must be a new collection under drafts/');
  const records = z.array(EvidenceSchema).min(1).parse(JSON.parse(await readFile(option(operation), 'utf8')));
  const manifest = z.array(InspectionEntrySchema).parse(JSON.parse(await readFile(option('--manifest'), 'utf8')));
  const now = new Date().toISOString();
  if (operation === '--draft') {
    if (records.some(x => x.status !== 'draft' || x.reviewedAt !== null || x.reviewedBy !== null || x.inspectedAt !== null)) throw new Error('Draft import cannot carry inspection or review authority');
  } else if (operation === '--inspect') {
    if (records.some(x => x.status !== 'draft' || x.reviewedAt !== null || x.reviewedBy !== null || x.inspectedAt !== null)) throw new Error('Inspect requires drafts without review authority');
    records.forEach(x => { x.status = 'inspected'; x.inspectedAt = now; });
    manifest.forEach(x => { x.inspectedAt = now; x.reviewedAt = null; x.reviewedBy = null; });
    await inspectEvidenceRecords(records, manifest, root);
  } else {
    const reviewer = option('--reviewer').trim();
    if (!reviewer || reviewer.length > 200 || records.some(x => x.status !== 'inspected' || !x.inspectedAt || x.reviewedAt !== null || x.reviewedBy !== null)) throw new Error('Review requires inspected records and a named reviewer');
    await inspectEvidenceRecords(records, manifest, root);
    records.forEach(x => { x.status = 'reviewed'; x.reviewedAt = now; x.reviewedBy = reviewer; });
    manifest.forEach(x => { x.reviewedAt = now; x.reviewedBy = reviewer; });
    await inspectEvidenceRecords(records, manifest, root);
  }
  await mkdir(path.join(root, 'drafts'), { recursive: true });
  const draftRoot = await realpath(path.join(root, 'drafts'));
  if (!draftRoot.startsWith((await realpath(root)) + path.sep)) throw new Error('Draft symlink escapes evidence root');
  const destination = path.join(draftRoot, path.basename(outputName));
  // Exclusive writes never replace the production seed or an earlier review artifact.
  await writeFile(destination, JSON.stringify(records, null, 2) + '\n', { flag: 'wx' });
  await writeFile(destination + '.inspection.json', JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  return `Saved ${operation.slice(2)} collection to ${destination}; production seed is promoted only by a reviewed code change.`;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runEvidenceImport(process.argv.slice(2)).then(message => console.log(message)).catch(error => { console.error(error instanceof Error ? error.message : 'Evidence import failed'); process.exitCode = 1; });
}
