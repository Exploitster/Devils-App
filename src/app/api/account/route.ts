import { z } from 'zod';
import { authResponse, getAuth, getRuntimeConfig, getStore, requireIdentity } from '../../../lib/auth/service';
import { accessDecision } from '../../../lib/auth/access';
import { createBillingService } from '../../../lib/billing/service';
import { json, readJson, sameOrigin } from '../../../lib/http';
import { deleteAccount, privacyDisclosure } from '../../../lib/privacy/deletion';
export const runtime='nodejs';
export async function GET(request:Request){return authResponse(request,async()=>{
 const user=await requireIdentity(request,{allowDisabled:true});const store=await getStore(request);
 return json({profile:await store.getProfile(user.id),access:await accessDecision(store,user.id,getRuntimeConfig(request),new Date()),privacy:privacyDisclosure});
});}
export async function DELETE(request:Request){return authResponse(request,async()=>{
 sameOrigin(request,getRuntimeConfig(request).appUrl);
 await readJson(request,z.object({confirmation:z.literal('DELETE')}).strict(),1024);
 const user=await requireIdentity(request,{allowDisabled:true});const auth=getAuth(request);const store=await getStore(request);
 await deleteAccount(user.id,{store,cancelRenewal:id=>createBillingService(request).cancelRenewal(id),deleteIdentity:id=>auth.deleteIdentity(id)});
 const response=await auth.signOut(request);
 // Preserve all adapter cookie clearing headers.
 return json({deleted:true},200,response.headers);
});}
