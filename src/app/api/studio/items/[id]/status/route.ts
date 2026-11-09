import { authResponse } from '@/lib/auth/service';
import { json, readJson } from '@/lib/http';
import { StatusActionSchema, studioService } from '@/lib/knowledge/service';
export const runtime = 'nodejs';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return authResponse(request, async () => { const studio = await studioService(request, { write: true }); const { action } = await readJson(request, StatusActionSchema); return json({ item: await studio.changeStatus((await context.params).id, action) }); }); }
