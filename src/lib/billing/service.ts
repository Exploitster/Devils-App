import Stripe from 'stripe';
import { DodoBilling } from './dodo-service';
import { createHmac, randomUUID } from 'node:crypto';
import type { BillingService, Identity, Store, Subscription } from '../contracts';
import type { RuntimeConfig } from '../config';
import { AppError } from '../errors';
import { getAdminStore, getRuntimeConfig } from '../auth/service';
import { readConfig } from '../config';
import { billingPersistence, type BillingContext, type BillingPersistence } from './context';
const fail=(message='Billing verification failed.')=>new AppError('BILLING_UNAVAILABLE',message,503);
export const plans={monthly:{amount:5900,interval:'month'},yearly:{amount:15000,interval:'year'}} as const;
export interface BillingOptions {config:RuntimeConfig;store:Store;persistence?:BillingPersistence;stripe?:Stripe;}
export function createBillingService(requestOrOptions?:Request|BillingOptions):VerifiedBilling|DodoBilling {
 const options=requestOrOptions instanceof Request?{config:getRuntimeConfig(requestOrOptions),store:getAdminStore()}:requestOrOptions??{config:readConfig(),store:getAdminStore()};return options.config.billingProvider==='dodo'?new DodoBilling(options):new VerifiedBilling(options);
}
export class VerifiedBilling implements BillingService {
 private stripe:Stripe;private _persistence?:BillingPersistence;private config:RuntimeConfig;private store:Store;
 constructor(options:BillingOptions){this.config=options.config;this.store=options.store;this._persistence=options.persistence;this.stripe=options.stripe??new Stripe(options.config.stripeSecretKey||'sk_test_local',{timeout:10000,maxNetworkRetries:1});}
 private get persistence(){return this._persistence??=billingPersistence(this.config);}
 private enabled(){if(!this.config.paymentsEnabled)throw new AppError('PAYMENTS_DISABLED','Payments are not connected yet.',503);}
 private async accountLease(userId:string){const key=`account:${userId}`;const token=randomUUID();if(!await this.persistence.acquireSync(key,token,Date.now()+120000))throw new AppError('BILLING_SYNC_PENDING','Billing update in progress.',503,5);return {key,token};}
 private async testMode(){if(this.config.mode==='services'&&(await this.stripe.balance.retrieve()).livemode!==false)throw fail('Only verified Stripe test mode is permitted.');}
 private priceId(plan:'monthly'|'yearly'){return this.config.mode==='local'?`local_${plan}`:plan==='monthly'?this.config.stripeMonthlyPriceId:this.config.stripeYearlyPriceId;}
 private async price(plan:'monthly'|'yearly'){const p=await this.stripe.prices.retrieve(this.priceId(plan));if(p.livemode!==false||!p.active||p.currency!=='usd'||p.unit_amount!==plans[plan].amount||p.recurring?.interval!==plans[plan].interval||p.recurring.interval_count!==1)throw fail('Configured test price does not match the advertised plan.');return p;}
 private async owned(userId:string){const profile=await this.store.getProfile(userId);if(!profile||profile.disabled)throw new AppError('FORBIDDEN','Billing account is unavailable.',403);}
 async checkout(user:Identity,plan:'monthly'|'yearly') {
  this.enabled();const lease=await this.accountLease(user.id);try{
  await this.owned(user.id);await this.testMode();if(this.config.mode==='services')await this.price(plan);
  const current=await this.store.getSubscription(user.id);if(current&&['active','trialing'].includes(current.status)&&Date.parse(current.currentPeriodEnd)>Date.now())throw new AppError('ALREADY_SUBSCRIBED','Manage your existing subscription.',409);
  const ctx=await this.persistence.claim({userId:user.id,token:randomUUID(),plan,expiresAt:Date.now()+24*3600000});
  if(!ctx.customerId){ctx.customerId=this.config.mode==='local'?`local_customer_${user.id}`:(await this.stripe.customers.create({email:user.email},{idempotencyKey:`customer:${user.id}`})).id;await this.persistence.save(ctx);}
  if(this.config.mode==='local'){await this.owned(user.id);return {url:`${this.config.appUrl}/billing?testCheckout=${ctx.token}`};}
  await this.price(ctx.plan);const customer=await this.stripe.customers.retrieve(ctx.customerId);if(customer.deleted||customer.livemode!==false)throw fail();
  const existing=await this.stripe.subscriptions.list({customer:ctx.customerId,status:'all',limit:100});if(existing.has_more||existing.data.some(s=>!['canceled','incomplete_expired'].includes(s.status)))throw new AppError('ALREADY_SUBSCRIBED','Manage your existing subscription.',409);
  ctx.checkoutPending=true;await this.persistence.save(ctx);await this.owned(user.id);const session=await this.stripe.checkout.sessions.create({mode:'subscription',customer:ctx.customerId,line_items:[{price:this.priceId(ctx.plan),quantity:1}],success_url:`${this.config.appUrl}/billing?checkout=returned`,cancel_url:`${this.config.appUrl}/billing?checkout=canceled`},{idempotencyKey:`checkout:${ctx.token}`});
  ctx.checkoutSessionId=session.id;ctx.checkoutPending=false;await this.persistence.save(ctx);try{await this.owned(user.id);}catch(error){if(session.status==='open')await this.stripe.checkout.sessions.expire(session.id);throw error;}
  if(session.livemode!==false||!session.url||new URL(session.url).hostname!=='checkout.stripe.com'||new URL(session.url).protocol!=='https:')throw fail();return {url:session.url};
  }finally{await this.persistence.releaseSync(lease.key,lease.token);}
 }
 async portal(user:Identity){this.enabled();await this.owned(user.id);await this.testMode();const ctx=await this.persistence.get(user.id);if(!ctx?.customerId)throw new AppError('NO_SUBSCRIPTION','No billing customer exists.',404);if(this.config.mode==='local')return {url:`${this.config.appUrl}/billing?manage=local`};const customer=await this.stripe.customers.retrieve(ctx.customerId);if(customer.deleted||customer.livemode!==false)throw fail();const portal=await this.stripe.billingPortal.sessions.create({customer:ctx.customerId,return_url:`${this.config.appUrl}/billing`});if(new URL(portal.url).hostname!=='billing.stripe.com'||new URL(portal.url).protocol!=='https:')throw fail();return {url:portal.url};}
 private secret(){return this.config.mode==='local'?`whsec_${this.config.localAuthSecret}`:this.config.stripeWebhookSecret;}
 private signed(raw:string){const t=Math.floor(Date.now()/1000);return `t=${t},v1=${createHmac('sha256',this.secret()).update(`${t}.${raw}`).digest('hex')}`;}
 async confirmLocal(user:Identity,token:string){this.enabled();if(this.config.mode!=='local')throw new AppError('NOT_FOUND','Not found.',404);await this.owned(user.id);const ctx=await this.persistence.get(user.id);if(!ctx||ctx.token!==token||ctx.expiresAt<Date.now())throw new AppError('INVALID_CHECKOUT','This test checkout is unavailable.',403);if(ctx.localStatus==='active'&&await this.store.getSubscription(user.id))return;ctx.subscriptionId??=`local_sub_${randomUUID()}`;ctx.localStatus='active';ctx.periodEnd??=Date.now()+(ctx.plan==='monthly'?30:365)*86400000;await this.persistence.save(ctx);await this.localEvent(ctx);}
 private async localEvent(ctx:BillingContext){const raw=JSON.stringify({id:`local_${ctx.token}_${ctx.localStatus}_${ctx.cancelAtPeriodEnd??false}`,object:'event',type:'customer.subscription.updated',livemode:false,data:{object:{id:ctx.subscriptionId,customer:ctx.customerId}}});await this.processWebhook(raw,this.signed(raw));}
 async processWebhook(raw:string,signature:string){this.enabled();if(Buffer.byteLength(raw)>256000)throw new AppError('BODY_TOO_LARGE','Webhook too large.',413);const timestamp=signature.match(/(?:^|,)t=(\d+)(?:,|$)/)?.[1];if(!timestamp||Math.abs(Date.now()/1000-Number(timestamp))>300)throw new AppError('INVALID_SIGNATURE','Invalid webhook timestamp.',400);let event:Stripe.Event;try{event=this.stripe.webhooks.constructEvent(raw,signature,this.secret(),300);}catch{throw new AppError('INVALID_SIGNATURE','Invalid webhook signature.',400);}if(event.livemode!==false)throw new AppError('LIVE_BILLING_FORBIDDEN','Live events are forbidden.',400);
  const now=new Date();const receipt=await this.store.beginWebhook(event.id,now.toISOString(),new Date(now.getTime()+60000).toISOString());if(receipt==='duplicate')return;if(receipt==='pending')throw new AppError('WEBHOOK_RETRY','Event already handled or processing.',503,60);
  let guard:{customerId:string;token:string}|undefined;try {let subscription:Subscription|null=null;
   if(['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','checkout.session.completed','invoice.paid','invoice.payment_failed'].includes(event.type)){
    const object=event.data.object as unknown as {id:string;customer?:string|{id:string};subscription?:string|{id:string};parent?:{subscription_details?:{subscription?:string|{id:string}}}};
    const customerId=typeof object.customer==='string'?object.customer:object.customer?.id;let ctx=customerId?await this.persistence.findCustomer(customerId):null;if(!ctx)throw fail('Customer is not linked to a server account.');await this.owned(ctx.userId);const lease={customerId:ctx.customerId!,token:randomUUID()};if(!await this.persistence.acquireSync(lease.customerId,lease.token,Date.now()+60000))throw new AppError('BILLING_SYNC_PENDING','Billing update in progress.',503,5);guard=lease;if(this.config.mode==='local'){ctx=await this.persistence.get(ctx.userId);if(!ctx||ctx.customerId!==lease.customerId)throw fail();}
    if(this.config.mode==='local'){if(!ctx.subscriptionId||!ctx.periodEnd)throw fail();subscription={userId:ctx.userId,customerId:ctx.customerId!,subscriptionId:ctx.subscriptionId,priceId:this.priceId(ctx.plan),status:ctx.localStatus??'incomplete',currentPeriodEnd:new Date(ctx.periodEnd).toISOString(),cancelAtPeriodEnd:ctx.cancelAtPeriodEnd??false,updatedAt:new Date().toISOString()};}
    else{await this.testMode();const ref=event.type.startsWith('customer.subscription.')?object.id:object.subscription??object.parent?.subscription_details?.subscription;const id=typeof ref==='string'?ref:ref?.id;if(!id)throw fail();const subscriptions=await this.stripe.subscriptions.list({customer:ctx.customerId,status:'all',limit:100});if(subscriptions.has_more)throw fail();const latest=[...subscriptions.data].sort((a,b)=>b.created-a.created)[0];if(!latest)throw fail();const canonical=await this.stripe.subscriptions.retrieve(latest.id);const customer=typeof canonical.customer==='string'?canonical.customer:canonical.customer.id;if(canonical.livemode!==false||customer!==ctx.customerId||canonical.items.data.length!==1)throw fail();const item=canonical.items.data[0];const plan=item.price.id===this.config.stripeMonthlyPriceId?'monthly':item.price.id===this.config.stripeYearlyPriceId?'yearly':null;if(!plan||item.quantity!==1||item.price.currency!=='usd')throw fail();await this.price(plan);if(!Number.isFinite(item.current_period_end))throw fail();subscription={userId:ctx.userId,customerId:customer,subscriptionId:canonical.id,priceId:item.price.id,status:(['active','trialing','past_due','unpaid','canceled','incomplete','incomplete_expired','paused'].includes(canonical.status)?canonical.status:'incomplete') as Subscription['status'],currentPeriodEnd:new Date(item.current_period_end*1000).toISOString(),cancelAtPeriodEnd:canonical.cancel_at_period_end,updatedAt:new Date().toISOString()};}
   }
   await this.store.completeWebhook(event.id,subscription,guard);
  }catch(e){await this.store.failWebhook(event.id);throw e;}finally{if(guard)await this.persistence.releaseSync(guard.customerId,guard.token);}
 }
 async cancelRenewal(userId:string){
  const checkProfile=async()=>{const profile=await this.store.getProfile(userId);if(!profile||(profile.disabled&&profile.deletionState!=='pending'))throw new AppError('FORBIDDEN','Billing account is unavailable.',403);return profile;};
  await checkProfile();
  // Even with payments disconnected, retained billing authority must be resolved
  // before deletion can report that future charges have been stopped.
  const initial=await this.persistence.get(userId);const stored=await this.store.getSubscription(userId);
  if(!this.config.paymentsEnabled){if(initial?.customerId||initial?.subscriptionId||initial?.checkoutSessionId||initial?.checkoutPending||stored)throw new AppError('PAYMENTS_DISABLED','Existing billing must be reconciled before account closure can finish.',503);return;}
  const lease=await this.accountLease(userId);
  try{
   const profile=await checkProfile();const ctx=await this.persistence.get(userId);const sub=await this.store.getSubscription(userId);
   if(!ctx?.customerId){if(sub||ctx?.subscriptionId||ctx?.checkoutSessionId)throw fail('Billing ownership requires reconciliation.');return;}
   if(sub&&sub.customerId!==ctx.customerId)throw fail();
   if(this.config.mode==='local'){ctx.expiresAt=0;ctx.cancelAtPeriodEnd=true;await this.persistence.save(ctx);if(!profile.disabled&&ctx.subscriptionId)await this.localEvent(ctx);return;}
   await this.testMode();const customer=await this.stripe.customers.retrieve(ctx.customerId);if(customer.deleted||customer.livemode!==false)throw fail();
   const sessions=await this.stripe.checkout.sessions.list({customer:ctx.customerId,status:'open',limit:100});if(sessions.has_more)throw fail('More checkout sessions require reconciliation.');
   for(const session of sessions.data){if(session.livemode!==false||(typeof session.customer==='string'?session.customer:session.customer?.id)!==ctx.customerId)throw fail();await this.stripe.checkout.sessions.expire(session.id);}
   const subscriptions=await this.stripe.subscriptions.list({customer:ctx.customerId,status:'all',limit:100});if(subscriptions.has_more)throw fail('More subscriptions require reconciliation.');
   for(const subscription of subscriptions.data){if(subscription.livemode!==false||(typeof subscription.customer==='string'?subscription.customer:subscription.customer.id)!==ctx.customerId)throw fail();if(['canceled','incomplete_expired'].includes(subscription.status))continue;if(subscription.status==='incomplete')await this.stripe.subscriptions.cancel(subscription.id);else if(!subscription.cancel_at_period_end)await this.stripe.subscriptions.update(subscription.id,{cancel_at_period_end:true});}
   // Read back provider state rather than interpreting a successful write as proof.
   const remaining=await this.stripe.checkout.sessions.list({customer:ctx.customerId,status:'open',limit:100});const verified=await this.stripe.subscriptions.list({customer:ctx.customerId,status:'all',limit:100});
   if(remaining.has_more||remaining.data.length||verified.has_more||verified.data.some(s=>s.livemode!==false||(typeof s.customer==='string'?s.customer:s.customer.id)!==ctx.customerId||(!['canceled','incomplete_expired'].includes(s.status)&&!s.cancel_at_period_end)))throw fail('Billing closure is not yet confirmed.');
   if(ctx.checkoutPending)throw fail('An in-flight checkout must finish reconciliation before closure.');ctx.expiresAt=0;ctx.cancelAtPeriodEnd=true;await this.persistence.save(ctx);
  }finally{await this.persistence.releaseSync(lease.key,lease.token);}
 }
}
