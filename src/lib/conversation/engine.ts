import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as retryDelay } from 'node:timers/promises';
import { ModelOutputSchema, type Store, type EvidenceService, type ModelService, type Clock, type TurnRequest, type ModelInput, type Session, type ModelResult, type ModelOutput, type SpendAttempt } from '../contracts';
import type { RuntimeConfig } from '../config';
import { AppError } from '../errors';
import { requireAccess } from '../auth/access';
import { assessSafety } from './safety';
import { privacyBoundary } from './boundaries';
import { caseContext, prepareState, withAssessment } from './state';
import { applyAction, assertActionAllowed, startCase } from '../case-prep/reducer';
import { questionSetFor } from '../case-prep/versions';
import type { KnowledgeStore } from '../knowledge/store';
import { echoesGuidance, guidanceFor } from '../knowledge/guidance';
import { logEvent } from '../logging';
import { boundInput, reserveCost } from './limits';
import { ProviderError } from '../model/provider';
import { CitationValidationError } from '../evidence/validate';
const active=new Map<string,AbortController>();
const qualifiedNotice=assessSafety('medication').response!;
const supportReplies=new Set(['want to die','help kill someone','political debate'].map(trigger=>assessSafety(trigger).response!));
const assessmentBeingWritten='Every area is covered. I am writing your assessment now.';
const assessmentReady='Your assessment is ready. It scores each area and leaves the decision with you.';
const invalidOutput=()=>new AppError('INVALID_MODEL_OUTPUT','The AI response could not be verified. Your conversation is unchanged; please try again.',502);
/** Without `knowledge`, every case runs on the built-in question sets. `ownAi` is set when the
 * person's own key pays for the turn: the app's spend budget is not touched, and the owner's
 * private guidance is left out unless the owner chose to send it. */
export interface ConversationServices {store:Store;evidence:EvidenceService;model:ModelService;clock:Clock;config:RuntimeConfig;knowledge?:KnowledgeStore;ownAi?:{withholdGuidance:boolean};ownAiOffered?:boolean;}
export class ConversationEngine {
 constructor(private services:ConversationServices){}
 async turn(userId:string,sessionId:string,request:TurnRequest,signal?:AbortSignal){return this.run(userId,sessionId,request,'turn',signal);}
 async card(userId:string,sessionId:string,request:{operationId:string;expectedRevision:number},signal?:AbortSignal){return this.run(userId,sessionId,request,'card',signal);}
 async cancel(userId:string,sessionId:string,operationId:string){await this.services.store.cancelTurn(userId,sessionId,operationId);active.get(`${userId}:${operationId}`)?.abort();return this.services.store.getSession(userId,sessionId);}
 private async run(userId:string,sessionId:string,request:ModelInput['request'],task:ModelInput['task'],signal?:AbortSignal):Promise<Session>{
 const {store,evidence,model,clock,config,ownAi}=this.services;const now=clock.now();const fingerprint=createHash('sha256').update(JSON.stringify({task,...request})).digest('hex');
 const previous=await store.getOperation(userId,sessionId,request.operationId);
 if(previous){if(previous.fingerprint!==fingerprint)throw new AppError('IDEMPOTENCY_CONFLICT','This operation ID belongs to a different request.',409);if(previous.status==='committed')return store.getSession(userId,sessionId);throw new AppError(previous.status==='pending'?'TURN_IN_PROGRESS':'OPERATION_FINISHED','Use a new operation ID to try again.',409);}
 const original=await store.getSession(userId,sessionId);
 if(original.messages.length>0&&!original.state.casePrep)throw new AppError('LEGACY_READ_ONLY','This conversation was saved before case prep and is read-only. Start a case to continue from the same idea.',409);
 const turn='text'in request?request:undefined;const safety=assessSafety(turn?turn.text:original.state.position);const boundary=turn?privacyBoundary(turn.text):undefined;const support=Boolean(boundary||(safety.response&&safety.kind!=='qualified'));
 // Safety handling precedes entitlement and retrieval. It never calls a provider.
 if(turn&&!support&&original.state.casePrep)assertActionAllowed(original.state.casePrep,turn.action);
 if(!safety.response||safety.kind==='qualified')await requireAccess(store,userId,config,now);
 const leaseExpiresAt=new Date(now.getTime()+config.generationTimeoutMs).toISOString();
 const reserved=await store.reserveTurn({userId,sessionId,operationId:request.operationId,expectedRevision:request.expectedRevision,fingerprint,leaseExpiresAt,now:now.toISOString()});
 if(reserved.kind==='duplicate'){if(reserved.operation.status==='committed')return reserved.session;throw new AppError('TURN_IN_PROGRESS','Wait for the current response.',409);}
 const controller=new AbortController();const key=`${userId}:${request.operationId}`;active.set(key,controller);const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();const timer=setTimeout(abort,config.generationTimeoutMs);
 try{
 const session=reserved.session;
 const set=await questionSetFor(this.services.knowledge,session);const areas=set.areas;
 const record=session.state.casePrep??startCase(session.mode,areas,set.version);
 const supportOutput=(response:string):ModelOutput=>{const state=structuredClone(session.state);state.phase='support';state.casePrep=record;return {state,response,citations:[]};};
 const context=caseContext(record,areas,turn?turn.action:'assessment',turn&&['message','correction'].includes(turn.action)?turn.text:undefined);
 // Searched before the spend reservation, which prices the guidance with the rest of the request.
 const [fresh,ownerGuidance]=await Promise.all([support||turn?[]:evidence.retrieve({mode:session.mode,query:[session.state.position,...record.areas.flatMap(a=>a.quotes)].join(' '),excludeIds:[],limit:3}),support||ownAi?.withholdGuidance?[]:guidanceFor(this.services.knowledge,{session,context,areas})]);
 let input=boundInput({session,request,task,evidence:fresh,now:now.toISOString(),caseAreas:areas,caseContext:context,ownerGuidance},config);
 const withNotice=(output:ModelOutput,qualified:boolean):ModelOutput=>{const prep=output.state.casePrep!;if(qualified&&!prep.qualifiedNoticeShown){prep.qualifiedNoticeShown=true;output.response=`${qualifiedNotice}\n\n${output.response}`;}return output;};
 const verify=async(result:ModelResult):Promise<ModelOutput>=>{
 controller.signal.throwIfAborted();const parsed=ModelOutputSchema.safeParse(result.output);if(!parsed.success)throw invalidOutput();const output=parsed.data;
 if(output.state.phase==='support'&&supportReplies.has(output.response))return supportOutput(output.response);
 const qualified=safety.kind==='qualified'||output.response.startsWith(qualifiedNotice);const state=prepareState(input);
 if(turn){if(!output.casePrep)throw invalidOutput();const applied=applyAction(record,areas,turn.action,turn.text,output.casePrep);state.phase='clarifying';state.casePrep=applied.record;return withNotice({state,response:applied.question??assessmentBeingWritten,citations:[]},qualified);}
 if(!output.assessment)throw invalidOutput();
 if(output.assessment.loopholes.some(p=>p.citations.length===0))throw new AppError('INVALID_EVIDENCE','Counterpoints require reviewed source support.',502);
 state.phase='card';state.casePrep=withAssessment(record,areas,output.assessment,randomUUID(),clock.now().toISOString());
 return evidence.validate(withNotice({state,response:assessmentReady,citations:[],assessment:output.assessment},qualified),input.evidence);
 };
 let result:ModelResult;let verified:ModelOutput|undefined;
 if(support){verified=supportOutput(boundary||safety.response!);result={output:verified,inputTokens:0,outputTokens:0,costMicros:0};}
 else{
 // One retry for a transient failure or unverifiable output. A reply that recites owner guidance
 // is discarded and written once more without guidance, under its own spend reservation.
 let generated:ModelResult|undefined;let retried=false;for(;;){
 controller.signal.throwIfAborted();const op=await store.getOperation(userId,sessionId,request.operationId);if(op?.status!=='pending')throw new AppError('CANCELLED','This response was cancelled.',409);
 const attemptId=randomUUID();if(!ownAi)await this.reserveSharedSpend({id:attemptId,operationId:request.operationId,userId,reservedMicros:reserveCost(input,config),createdAt:clock.now().toISOString()});
 try{generated=await Promise.race([model.generate(input,controller.signal),new Promise<never>((_,reject)=>{if(controller.signal.aborted)reject(new Error('Cancelled'));else controller.signal.addEventListener('abort',()=>reject(new Error('Cancelled')),{once:true});})]);if(!ownAi&&generated.costKnown!==false)await store.reconcileSpend(attemptId,generated.costMicros);verified=await verify(generated);
 if(input.ownerGuidance?.length&&echoesGuidance(visibleText(verified,task),input.ownerGuidance)){logEvent('knowledge_echo_blocked',{id:sessionId});input={...input,ownerGuidance:[]};generated=verified=undefined;continue;}
 break;}catch(error){
 const retryable=error instanceof ProviderError?error.transient:error instanceof CitationValidationError||(error instanceof AppError&&error.code==='INVALID_MODEL_OUTPUT');
 if(!retryable||retried||controller.signal.aborted)throw error;retried=true;
 await retryDelay(error instanceof ProviderError?error.retryAfterMs??200+Math.floor(Math.random()*200):200,undefined,{signal:controller.signal});
 }
 }if(!generated)throw new AppError('PROVIDER_ERROR','The response could not complete.',503);result=generated;
 }
 controller.signal.throwIfAborted();const output=verified??await verify(result);
 const stamp=clock.now().toISOString();const messages=[...(turn?[{id:randomUUID(),role:'user' as const,text:turn.text,createdAt:stamp,operationId:request.operationId,citations:[]}]:[]),{id:randomUUID(),role:'assistant' as const,text:output.response,createdAt:stamp,operationId:request.operationId,citations:output.citations}];
 return await store.commitTurn({userId,sessionId,operationId:request.operationId,expectedRevision:request.expectedRevision,state:output.state,messages,usage:{inputTokens:result.inputTokens,outputTokens:result.outputTokens,costMicros:result.costMicros},now:stamp});
 }catch(error){try{await store.failTurn(userId,sessionId,request.operationId,controller.signal.aborted?'CANCELLED':'GENERATION_FAILED');}catch{}if(controller.signal.aborted)throw new AppError('CANCELLED','The response was cancelled or timed out. Please try again.',408);throw error;}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);active.delete(key);}
 }
 /** The app's daily AI budget is shared by everyone without their own key. When it runs out, say what still works. */
 private async reserveSharedSpend(attempt:SpendAttempt):Promise<void>{
 try{await this.services.store.reserveSpend(attempt,this.services.config.dailySpendLimitMicros);}
 catch(error){if(error instanceof AppError&&error.code==='SPEND_LIMIT'&&this.services.ownAiOffered)throw new AppError('SPEND_LIMIT','Today’s shared AI allowance is used up. Connect your own Claude or OpenAI key on the Account page to keep going, or try again tomorrow.',503);throw error;}
 }
}
/** What the person would read: the reply, and on the assessment every prose field the model wrote. */
function visibleText(output:ModelOutput,task:ModelInput['task']):string[]{
 const prose=task==='card'?output.state.casePrep?.assessment:undefined;
 return [output.response,...(prose?[prose.statement,...prose.good,...prose.bad,...prose.mustBeTrue,...prose.loopholes.flatMap(point=>[point.text,point.interpretation??''])]:[])];
}
export function createConversationEngine(services:ConversationServices){return new ConversationEngine(services);}
