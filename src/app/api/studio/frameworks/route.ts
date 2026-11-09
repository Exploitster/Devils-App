import { z } from 'zod';
import { ModeSchema } from '@/lib/contracts';
import { json, readJson } from '@/lib/http';
import { authResponse, getKnowledgeStore } from '@/lib/auth/service';
import { authorizeStudio } from '@/lib/studio/access';
import { listQuestionSets, publishQuestionSet, restoreQuestionSet } from '@/lib/case-prep/versions';
export const runtime = 'nodejs';

// The areas are checked by the question-set rules, which give the owner a reason for each rejection.
const RequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('publish'), mode: ModeSchema, areas: z.array(z.unknown()).max(100), note: z.string().trim().max(500).optional() }).strict(),
  z.object({ action: z.literal('restore'), mode: ModeSchema, version: z.number().int().nonnegative() }).strict(),
]);
// Twelve areas at their longest fields, after UTF-8 and JSON escaping.
const MAX_BODY_BYTES = 1_000_000;

export async function GET(request: Request) {
  return authResponse(request, async () => {
    const { config } = await authorizeStudio(request, { write: false });
    const mode = ModeSchema.parse(new URL(request.url).searchParams.get('mode'));
    return json(await listQuestionSets(getKnowledgeStore(config), mode));
  });
}

export async function POST(request: Request) {
  return authResponse(request, async () => {
    const { config } = await authorizeStudio(request, { write: true });
    const input = await readJson(request, RequestSchema, MAX_BODY_BYTES);
    const knowledge = getKnowledgeStore(config); const now = new Date().toISOString();
    const version = input.action === 'publish'
      ? await publishQuestionSet(knowledge, input.mode, input.areas, input.note || undefined, now)
      : await restoreQuestionSet(knowledge, input.mode, input.version, now);
    return json({ version }, 201);
  });
}
