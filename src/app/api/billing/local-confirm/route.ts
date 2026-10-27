import { z } from 'zod';
import { authResponse, requireIdentity, getRuntimeConfig } from '../../../../lib/auth/service';
import { json,readJson,sameOrigin } from '../../../../lib/http';
import { createBillingService } from '../../../../lib/billing/service';
export const runtime='nodejs';
export async function POST(request:Request){return authResponse(request,async()=>{sameOrigin(request,getRuntimeConfig(request).appUrl);const user=await requireIdentity(request);const {token}=await readJson(request,z.object({token:z.string().uuid()}).strict(),1024);await createBillingService(request).confirmLocal(user,token);return json({confirmed:true,testMode:true,message:'Simulated test subscription. No payment occurred.'});});}
