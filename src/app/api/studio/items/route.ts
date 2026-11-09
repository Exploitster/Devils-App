import { authResponse } from '@/lib/auth/service';
import { json, readJson } from '@/lib/http';
import { CREATE_BODY_LIMIT, CreateItemSchema, studioService } from '@/lib/knowledge/service';
export const runtime = 'nodejs';
export async function GET(request: Request) { return authResponse(request, async () => json({ items: await (await studioService(request, { write: false })).list() })); }
/** A note is created straight into review; a file item returns the target the browser uploads it to. */
export async function POST(request: Request) { return authResponse(request, async () => { const studio = await studioService(request, { write: true }); return json(await studio.create(await readJson(request, CreateItemSchema, CREATE_BODY_LIMIT)), 201); }); }
