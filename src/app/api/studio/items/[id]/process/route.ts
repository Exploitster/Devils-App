import { authResponse } from '@/lib/auth/service';
import { json } from '@/lib/http';
import { studioService } from '@/lib/knowledge/service';
export const runtime = 'nodejs';
export const maxDuration = 300;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return authResponse(request, async () => { const studio = await studioService(request, { write: true }); return json(await studio.process((await context.params).id)); }); }
