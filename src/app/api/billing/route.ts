import { authResponse, requireIdentity, getStore, getRuntimeConfig } from '../../../lib/auth/service';
import { accessDecision } from '../../../lib/auth/access';
import { json } from '../../../lib/http';
export const runtime='nodejs';
export async function GET(request:Request){return authResponse(request,async()=>{const user=await requireIdentity(request);const store=await getStore(request);const config=getRuntimeConfig(request);return json({subscription:await store.getSubscription(user.id),access:await accessDecision(store,user.id,config),runtimeMode:config.mode,plans:{monthly:{amount:5900,currency:'usd',interval:'month'},yearly:{amount:15000,currency:'usd',interval:'year'}},testMode:true});});}
