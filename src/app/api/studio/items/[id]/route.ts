import { authResponse } from '@/lib/auth/service';
import { json, readJson } from '@/lib/http';
import { UPDATE_BODY_LIMIT, UpdateItemSchema, studioService } from '@/lib/knowledge/service';
export const runtime = 'nodejs';
type RouteContext = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: RouteContext) { return authResponse(request, async () => { const studio = await studioService(request, { write: false }); return json({ item: await studio.get((await context.params).id) }); }); }
export async function PATCH(request: Request, context: RouteContext) { return authResponse(request, async () => { const studio = await studioService(request, { write: true }); const { id } = await context.params; return json({ item: await studio.update(id, await readJson(request, UpdateItemSchema, UPDATE_BODY_LIMIT)) }); }); }
export async function DELETE(request: Request, context: RouteContext) { return authResponse(request, async () => { const studio = await studioService(request, { write: true }); await studio.remove((await context.params).id); return json({ deleted: true }); }); }
