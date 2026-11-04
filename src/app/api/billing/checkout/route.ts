import { z } from 'zod';
import { authResponse, requireIdentity, getRuntimeConfig } from '../../../../lib/auth/service';
import { json,readJson,sameOrigin } from '../../../../lib/http';
import { createBillingService } from '../../../../lib/billing/service';
export const runtime='nodejs';
export async function POST(request:Request){return authResponse(request,async()=>{sameOrigin(request,getRuntimeConfig(request).appUrl);const user=await requireIdentity(request);const body=await readJson(request,z.object({plan:z.enum(['monthly','yearly'])}).strict(),1024);return json(await createBillingService(request).checkout(user,body.plan));});}
