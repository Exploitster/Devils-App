import {
  authResponse,
  getRuntimeConfig,
  requireIdentity,
} from "@/lib/auth/service";
import { json, sameOrigin } from "@/lib/http";
import { createBillingService } from "@/lib/billing/service";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return authResponse(request, async () => {
    sameOrigin(request, getRuntimeConfig(request).appUrl);
    await createBillingService(request).cancelRenewal(
      (await requireIdentity(request)).id,
    );
    return json({ canceled: true });
  });
}
