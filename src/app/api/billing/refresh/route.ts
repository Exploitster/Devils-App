import {
  authResponse,
  getRuntimeConfig,
  requireIdentity,
} from "@/lib/auth/service";
import { json, sameOrigin } from "@/lib/http";
import { createBillingService } from "@/lib/billing/service";
import { DodoBilling } from "@/lib/billing/dodo-service";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return authResponse(request, async () => {
    sameOrigin(request, getRuntimeConfig(request).appUrl);
    const user = await requireIdentity(request);
    const service = createBillingService(request);
    if (service instanceof DodoBilling) await service.sync(user);
    return json({ refreshed: true });
  });
}
