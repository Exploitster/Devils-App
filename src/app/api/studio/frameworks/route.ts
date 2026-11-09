import { z } from 'zod';
import { ModeSchema } from '@/lib/contracts';
import { json, readJson, sameOrigin } from '@/lib/http';
import { authResponse, getKnowledgeStore, getRuntimeConfig } from '@/lib/auth/service';
import { assertStudioWritable, requireOwner } from '@/lib/studio/access';
import { listQuestionSets, publishQuestionSet, restoreQuestionSet } from '@/lib/case-prep/versions';
export const runtime = 'nodejs';

// The areas are checked by the question-set rules, which give the owner a reason for each rejection.
const RequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('publish'), mode: ModeSchema, areas: z.array(z.unknown()).max(100), note: z.string().trim().max(500).optional() }).strict(),
  z.object({ action: z.literal('restore'), mode: ModeSchema, version: z.number().int().nonnegative() }).strict(),
]);
// Twelve areas at their longest fields, after UTF-8 and JSON escaping.
const MAX_BODY_BYTES = 1_000_000;

/** The live question set for a mode, which may be the built-in version 0, and every published version. */
export async function GET(request: Request) {
  return authResponse(request, async () => {
    await requireOwner(request);
    const mode = ModeSchema.parse(new URL(request.url).searchParams.get('mode'));
    return json(await listQuestionSets(getKnowledgeStore(getRuntimeConfig(request)), mode));
  });
}

/** Publishes an edited set, or restores an earlier version (0 is the built-in set), as the new live version. */
export async function POST(request: Request) {
  return authResponse(request, async () => {
    const config = getRuntimeConfig(request);
    await requireOwner(request);
    sameOrigin(request, config.appUrl);
    assertStudioWritable(config);
    const input = await readJson(request, RequestSchema, MAX_BODY_BYTES);
    const knowledge = getKnowledgeStore(config); const now = new Date().toISOString();
    const version = input.action === 'publish'
      ? await publishQuestionSet(knowledge, input.mode, input.areas, input.note || undefined, now)
      : await restoreQuestionSet(knowledge, input.mode, input.version, now);
    return json({ version }, 201);
  });
}
