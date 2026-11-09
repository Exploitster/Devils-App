import { authResponse } from '@/lib/auth/service';
import { json } from '@/lib/http';
import { studioService } from '@/lib/knowledge/service';
export const runtime = 'nodejs';
// Transcription has its own 240-second deadline inside this limit.
export const maxDuration = 300;
/** Extracts or transcribes the uploaded file. A failure is saved on the item and returned with its code. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) { return authResponse(request, async () => { const studio = await studioService(request, { write: true }); return json(await studio.process((await context.params).id)); }); }
