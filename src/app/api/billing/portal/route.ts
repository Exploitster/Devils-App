import { authResponse, requireIdentity, getRuntimeConfig } from '../../../../lib/auth/service';
import { json,sameOrigin } from '../../../../lib/http';
import { createBillingService } from '../../../../lib/billing/service';
export const runtime='nodejs';
export async function POST(request:Request){return authResponse(request,async()=>{sameOrigin(request,getRuntimeConfig(request).appUrl);return json(await createBillingService(request).portal(await requireIdentity(request)));});}
