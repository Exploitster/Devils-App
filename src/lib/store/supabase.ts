import type { SupabaseClient } from '@supabase/supabase-js';
import type { Store, UserProfile, Invite, Subscription, Session, CreateSessionInput, ReserveTurnInput, ReserveTurnResult, CommitTurnInput, TurnOperation, UsageEvent, SpendAttempt } from '../contracts';
import { AppError, notFound } from '../errors';

/** Privileged RPC is server-only; reads use the authenticated client and its RLS. */
export class SupabaseStore implements Store {
 constructor(private client:SupabaseClient,private admin:SupabaseClient,private ownerId:string|null,private privileged=false) {}
 private owner(userId:string) {if(this.ownerId!==userId)throw notFound();}
 private async rpc<T>(method:string,args:unknown):Promise<T> {
  const {data,error}=await this.admin.rpc('app_store',{p_method:method,p_args:args,p_owner:this.ownerId});
  if(error){const code=error.message;const statuses:Record<string,number>={NOT_FOUND:404,REVISION_CONFLICT:409,IDEMPOTENCY_CONFLICT:409,TURN_IN_PROGRESS:409,RATE_LIMITED:429,SPEND_LIMIT:503,BILLING_SYNC_CONFLICT:503};if(code in statuses)throw new AppError(code,code==='NOT_FOUND'?'This item is unavailable.':code==='RATE_LIMITED'?'Please wait before submitting again.':'The operation could not complete. Please reload and try again.',statuses[code],code==='RATE_LIMITED'?60:undefined);throw new AppError('STORE_UNAVAILABLE','Storage is temporarily unavailable.',503);}return data as T;
 }
 private async read<T>(table:string,userId:string):Promise<T|null> {if(this.privileged){const methods:Record<string,string>={profiles:'getProfile',invites:'getInvite',subscriptions:'getSubscription'};return this.rpc<T|null>(methods[table],{userId});}this.owner(userId);const {data,error}=await this.client.from(table).select('data').eq('user_id',userId).maybeSingle();if(error)throw new AppError('STORE_UNAVAILABLE','Storage is temporarily unavailable.',503);return data?.data as T??null;}
 getProfile(userId:string) {return this.read<UserProfile>('profiles',userId);}
 async putProfile(profile:UserProfile) {await this.rpc('putProfile',{profile});}
 getInvite(userId:string) {return this.read<Invite>('invites',userId);}
 async putInvite(invite:Invite) {await this.rpc('putInvite',{invite});}
 getSubscription(userId:string) {return this.read<Subscription>('subscriptions',userId);}
 async putSubscription(subscription:Subscription) {await this.rpc('putSubscription',{subscription});}
 findUserByCustomer(customerId:string) {return this.rpc<UserProfile|null>('findUserByCustomer',{customerId});}
 createSession(userId:string,input:CreateSessionInput,now:string) {this.owner(userId);return this.rpc<Session>('createSession',{userId,input,now});}
 async listSessions(userId:string) {this.owner(userId);const {data,error}=await this.client.from('sessions').select('data').eq('user_id',userId).order('data->>updatedAt',{ascending:false});if(error)throw new AppError('STORE_UNAVAILABLE','Storage is temporarily unavailable.',503);return (data??[]).map(row=>row.data as Session);}
 async getSession(userId:string,sessionId:string) {this.owner(userId);const {data,error}=await this.client.from('sessions').select('data').eq('user_id',userId).eq('id',sessionId).maybeSingle();if(error)throw new AppError('STORE_UNAVAILABLE','Storage is temporarily unavailable.',503);if(!data)throw notFound();return data.data as Session;}
 renameSession(userId:string,sessionId:string,title:string,expectedRevision:number,now:string) {this.owner(userId);return this.rpc<Session>('renameSession',{userId,sessionId,title,expectedRevision,now});}
 async deleteSession(userId:string,sessionId:string) {this.owner(userId);await this.rpc('deleteSession',{userId,sessionId});}
 reserveTurn(input:ReserveTurnInput) {this.owner(input.userId);return this.rpc<ReserveTurnResult>('reserveTurn',input);}
 commitTurn(input:CommitTurnInput) {this.owner(input.userId);return this.rpc<Session>('commitTurn',input);}
 async failTurn(userId:string,sessionId:string,operationId:string,code:string) {this.owner(userId);await this.rpc('failTurn',{userId,sessionId,operationId,code});}
 async cancelTurn(userId:string,sessionId:string,operationId:string) {this.owner(userId);await this.rpc('cancelTurn',{userId,sessionId,operationId});}
 async getOperation(userId:string,sessionId:string,operationId:string) {this.owner(userId);await this.getSession(userId,sessionId);const {data,error}=await this.client.from('turn_operations').select('data').eq('user_id',userId).eq('id',operationId).maybeSingle();if(error)throw new AppError('STORE_UNAVAILABLE','Storage is temporarily unavailable.',503);if(data && data.data.sessionId!==sessionId)throw notFound();return data?.data as TurnOperation??null;}
 async listUsage(userId:string,since:string) {this.owner(userId);const {data,error}=await this.client.from('usage_events').select('data').eq('user_id',userId).gte('data->>committedAt',since);if(error)throw new AppError('STORE_UNAVAILABLE','Storage is temporarily unavailable.',503);return(data??[]).map(row=>row.data as UsageEvent);}
 async reserveSpend(attempt:SpendAttempt,dailyLimitMicros:number) {if(this.ownerId!==null)this.owner(attempt.userId);await this.rpc('reserveSpend',{attempt,dailyLimitMicros});}
 async reconcileSpend(attemptId:string,actualMicros:number) {await this.rpc('reconcileSpend',{attemptId,actualMicros});}
 beginWebhook(eventId:string,now:string,leaseExpiresAt:string) {return this.rpc<'process'|'duplicate'|'pending'>('beginWebhook',{eventId,now,leaseExpiresAt});}
 async completeWebhook(eventId:string,subscription:Subscription|null,guard?:{customerId:string;token:string}) {await this.rpc('completeWebhook',{eventId,subscription,...(guard?{guard}:{})});}
 async failWebhook(eventId:string) {await this.rpc('failWebhook',{eventId});}
 async beginAccountDeletion(userId:string) {this.owner(userId);await this.rpc('beginAccountDeletion',{userId});}
 async deleteAccountData(userId:string) {this.owner(userId);await this.rpc('deleteAccountData',{userId});}
}
