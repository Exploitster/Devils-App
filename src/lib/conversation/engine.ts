import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as retryDelay } from 'node:timers/promises';
import { ModelOutputSchema, type Store, type EvidenceService, type ModelService, type Clock, type TurnRequest, type ModelInput, type Session, type ModelResult } from '../contracts';
import type { RuntimeConfig } from '../config';
import { AppError } from '../errors';
import { requireAccess } from '../auth/access';
import { assessSafety } from './safety';
import { privacyBoundary } from './boundaries';
import { controlOutput, prepareState } from './state';
import { boundInput, reserveCost } from './limits';
import { ProviderError } from '../model/provider';
const active=new Map<string,AbortController>();
export interface ConversationServices {store:Store;evidence:EvidenceService;model:ModelService;clock:Clock;config:RuntimeConfig;}
export class ConversationEngine {
 constructor(private services:ConversationServices){}
 async turn(userId:string,sessionId:string,request:TurnRequest,signal?:AbortSignal){return this.run(userId,sessionId,request,'turn',signal);}
 async card(userId:string,sessionId:string,request:{operationId:string;expectedRevision:number},signal?:AbortSignal){return this.run(userId,sessionId,request,'card',signal);}
 async cancel(userId:string,sessionId:string,operationId:string){await this.services.store.cancelTurn(userId,sessionId,operationId);active.get(`${userId}:${operationId}`)?.abort();return this.services.store.getSession(userId,sessionId);}
 private async run(userId:string,sessionId:string,request:ModelInput['request'],task:ModelInput['task'],signal?:AbortSignal):Promise<Session>{
 const {store,evidence,model,clock,config}=this.services;const now=clock.now();const fingerprint=createHash('sha256').update(JSON.stringify({task,...request})).digest('hex');
 const previous=await store.getOperation(userId,sessionId,request.operationId);
 if(previous){if(previous.fingerprint!==fingerprint)throw new AppError('IDEMPOTENCY_CONFLICT','This operation ID belongs to a different request.',409);if(previous.status==='committed')return store.getSession(userId,sessionId);throw new AppError(previous.status==='pending'?'TURN_IN_PROGRESS':'OPERATION_FINISHED','Use a new operation ID to try again.',409);}
 const original=await store.getSession(userId,sessionId);const safety=assessSafety('text'in request?request.text:original.state.position);const boundary='text'in request?privacyBoundary(request.text):undefined;
 // Safety handling precedes entitlement and retrieval. It never calls a provider.
 if(!safety.response||safety.kind==='qualified')await requireAccess(store,userId,config,now);
 const leaseExpiresAt=new Date(now.getTime()+config.generationTimeoutMs).toISOString();
 const reserved=await store.reserveTurn({userId,sessionId,operationId:request.operationId,expectedRevision:request.expectedRevision,fingerprint,leaseExpiresAt,now:now.toISOString()});
 if(reserved.kind==='duplicate'){if(reserved.operation.status==='committed')return reserved.session;throw new AppError('TURN_IN_PROGRESS','Wait for the current response.',409);}
 const controller=new AbortController();const key=`${userId}:${request.operationId}`;active.set(key,controller);const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();const timer=setTimeout(abort,config.generationTimeoutMs);
 try{
 const session=reserved.session;const corrected=task==='turn'&&'action'in request&&request.action==='correction';const fresh=boundary||(safety.response&&safety.kind!=='qualified')?[]:await evidence.retrieve({mode:session.mode,query:('text'in request&&request.action==='correction')?request.text:('text'in request?request.text:'')+' '+session.state.position,excludeIds:corrected?[]:session.state.usedEvidenceIds,limit:3});
 const historicalIds=new Set(session.state.counterpoints.flatMap(p=>p.citations.map(c=>c.evidenceId)));
 for(const card of session.cards.slice(-1))for(const p of card.counterpoints)for(const c of p.citations)historicalIds.add(c.evidenceId);
 const historical=corrected?[]:(await Promise.all([...historicalIds].map(id=>evidence.get(id)))).filter(e=>e!==null);
 const input=boundInput({session,request,task,evidence:[...fresh,...historical.filter(e=>!fresh.some(f=>f.id===e.id))],now:now.toISOString()},config);
 let result:ModelResult;
 if(boundary||(safety.response&&safety.kind!=='qualified')){const state=prepareState(input);state.phase='support';state.counterpoints=[];state.strengths=[];state.openQuestions=[];state.coverageNote='Adversarial discussion paused for safety.';result={output:{state,response:boundary||safety.response!,citations:[]},inputTokens:0,outputTokens:0,costMicros:0};}
 else{
 let generated:ModelResult|undefined;for(let attempt=0;attempt<2;attempt++){
 controller.signal.throwIfAborted();const op=await store.getOperation(userId,sessionId,request.operationId);if(op?.status!=='pending')throw new AppError('CANCELLED','This response was cancelled.',409);
 const attemptId=randomUUID();await store.reserveSpend({id:attemptId,operationId:request.operationId,userId,reservedMicros:reserveCost(input,config),createdAt:clock.now().toISOString()},config.dailySpendLimitMicros);
 try{generated=await Promise.race([model.generate(input,controller.signal),new Promise<never>((_,reject)=>{if(controller.signal.aborted)reject(new Error('Cancelled'));else controller.signal.addEventListener('abort',()=>reject(new Error('Cancelled')),{once:true});})]);await store.reconcileSpend(attemptId,generated.costMicros);break;}catch(error){if(!(error instanceof ProviderError&&error.transient&&attempt===0&&!controller.signal.aborted))throw error;await retryDelay(200+Math.floor(Math.random()*200),undefined,{signal:controller.signal});}
 }if(!generated)throw new AppError('PROVIDER_ERROR','The response could not complete.',503);result=generated;
 }
 controller.signal.throwIfAborted();const parsed=ModelOutputSchema.safeParse(result.output);if(!parsed.success)throw new AppError('INVALID_MODEL_OUTPUT','The AI response could not be verified. Your conversation is unchanged; please try again.',502);let output=controlOutput(input,parsed.data);if(safety.kind==='qualified')output.response=`${safety.response}\n\n${output.response}`;
 if(output.state.counterpoints.some(p=>p.citations.length===0)||output.card?.counterpoints.some(p=>p.citations.length===0))throw new AppError('INVALID_EVIDENCE','Counterpoints require reviewed source support.',502);
 output=await evidence.validate(output,input.evidence);
 const stamp=clock.now().toISOString();const messages=[...('text'in request?[{id:randomUUID(),role:'user' as const,text:request.text,createdAt:stamp,operationId:request.operationId,citations:[]}]:[]),{id:randomUUID(),role:'assistant' as const,text:output.response,createdAt:stamp,operationId:request.operationId,citations:output.citations}];
 return await store.commitTurn({userId,sessionId,operationId:request.operationId,expectedRevision:request.expectedRevision,state:output.state,messages,card:output.card,usage:{inputTokens:result.inputTokens,outputTokens:result.outputTokens,costMicros:result.costMicros},now:stamp});
 }catch(error){try{await store.failTurn(userId,sessionId,request.operationId,controller.signal.aborted?'CANCELLED':'GENERATION_FAILED');}catch{}if(controller.signal.aborted)throw new AppError('CANCELLED','The response was cancelled or timed out. Please try again.',408);throw error;}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);active.delete(key);}
 }
}
export function createConversationEngine(services:ConversationServices){return new ConversationEngine(services);}
