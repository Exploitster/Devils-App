import type { AccessDecision, Store } from '../contracts';
import type { RuntimeConfig } from '../config';
import { AppError } from '../errors';
export async function accessDecision(store:Store,userId:string,config:RuntimeConfig,now=new Date()):Promise<AccessDecision> {
 const profile=await store.getProfile(userId);if(!profile||profile.disabled)return {allowed:false,reason:'disabled'};
 if(!config.paymentsEnabled)return {allowed:true,reason:'free'};
 const subscription=await store.getSubscription(userId);
 if(config.billingProvider==='dodo') {
  if(subscription?.provider==='dodo' && subscription.environment==='live_mode' && subscription.verifiedPaymentId && ['active','canceled'].includes(subscription.status) && Date.parse(subscription.currentPeriodEnd)>now.getTime())return {allowed:true,reason:'paid',expiresAt:subscription.currentPeriodEnd};
  const trialEnd=Date.parse(profile.createdAt)+86400000;
  if(Number.isFinite(trialEnd) && now.getTime()>=Date.parse(profile.createdAt) && trialEnd>now.getTime())return {allowed:true,reason:'trial',expiresAt:new Date(trialEnd).toISOString()};
  return {allowed:false,reason:'expired'};
 }
 if(subscription && subscription.provider!=='dodo' && ['active','trialing'].includes(subscription.status) && Date.parse(subscription.currentPeriodEnd)>now.getTime())return {allowed:true,reason:'paid',expiresAt:subscription.currentPeriodEnd};
 const invite=await store.getInvite(userId);if(config.betaActive && invite?.enabled && Date.parse(invite.expiresAt)>now.getTime())return {allowed:true,reason:'beta',expiresAt:invite.expiresAt};
 return {allowed:false,reason:'expired'};
}
export async function requireAccess(store:Store,userId:string,config:RuntimeConfig,now=new Date()) {const access=await accessDecision(store,userId,config,now);if(!access.allowed)throw new AppError('ACCESS_EXPIRED','Generation access has expired. Your history remains available.',403);return access;}
