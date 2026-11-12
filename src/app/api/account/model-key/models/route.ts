import { authResponse, getRuntimeConfig, requireIdentity } from '@/lib/auth/service';
import { json } from '@/lib/http';
import { getModelKeyService } from '@/lib/model-keys/service';
export const runtime = 'nodejs';
/** The models the saved key can use, read from its provider. */
export async function GET(request: Request) { return authResponse(request, async () => { const user = await requireIdentity(request); return json(await getModelKeyService(getRuntimeConfig(request)).models(user.id)); }); }
