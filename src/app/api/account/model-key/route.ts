import { authResponse, getRuntimeConfig, requireIdentity } from '@/lib/auth/service';
import { json, readJson, sameOrigin } from '@/lib/http';
import { ChooseModelSchema, ConnectSchema, getModelKeyService } from '@/lib/model-keys/service';
export const runtime = 'nodejs';
// The key itself is accepted here and never returned: responses carry only its last four characters.
async function context(request: Request, write: boolean) {
  const config = getRuntimeConfig(request);
  if (write) sameOrigin(request, config.appUrl);
  return { user: await requireIdentity(request), keys: getModelKeyService(config) };
}
export async function GET(request: Request) { return authResponse(request, async () => { const { user, keys } = await context(request, false); return json({ available: keys.available, connection: await keys.connection(user.id) }); }); }
export async function PUT(request: Request) { return authResponse(request, async () => { const { user, keys } = await context(request, true); return json(await keys.connect(user.id, await readJson(request, ConnectSchema, 2048))); }); }
export async function PATCH(request: Request) { return authResponse(request, async () => { const { user, keys } = await context(request, true); return json({ connection: await keys.chooseModel(user.id, (await readJson(request, ChooseModelSchema, 1024)).model) }); }); }
export async function DELETE(request: Request) { return authResponse(request, async () => { const { user, keys } = await context(request, true); await keys.disconnect(user.id); return json({ connection: null }); }); }
