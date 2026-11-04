import { authResponse, requireIdentity, getStore, getRuntimeConfig } from '../../../lib/auth/service';
import { accessDecision } from '../../../lib/auth/access';
import { json } from '../../../lib/http';
export const runtime='nodejs';
export async function GET(request:Request){return authResponse(request,async()=>{
 const user=await requireIdentity(request);const store=await getStore(request);const config=getRuntimeConfig(request);
 const testMode=process.env.DEVILS_DODO_ENVIRONMENT==='test_mode';
 const checkoutAvailable=config.billingProvider==='dodo'&&(config.paymentsEnabled||testMode&&config.dodoTestUserIds?.includes(user.id));
 const subscription=await store.getSubscription(user.id);
 return json({subscription:subscription?{status:subscription.status,currentPeriodEnd:subscription.currentPeriodEnd,cancelAtPeriodEnd:subscription.cancelAtPeriodEnd,testMode:subscription.environment==='test_mode'}:null,access:await accessDecision(store,user.id,config),paymentsEnabled:config.paymentsEnabled,checkoutAvailable:Boolean(checkoutAvailable),plans:{monthly:{amount:200000,currency:'INR',interval:'month'}},testMode});
});}
