import { AccountAuthSchema } from '@/lib/contracts';
import { authResponse, getAuth, getRuntimeConfig, requireIdentity } from '@/lib/auth/service';
import { readJson, sameOrigin } from '@/lib/http';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return authResponse(request, async () => {
    sameOrigin(request, getRuntimeConfig(request).appUrl);
    const input = await readJson(request, AccountAuthSchema, 4096);
    if (input.action === 'update-password' || input.action === 'complete-onboarding') await requireIdentity(request);
    return getAuth(request).authenticate(input, request);
  });
}
