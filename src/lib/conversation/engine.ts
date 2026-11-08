import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as retryDelay } from 'node:timers/promises';
import { ModelOutputSchema, type Store, type EvidenceService, type ModelService, type Clock, type TurnRequest, type ModelInput, type Session, type ModelResult, type ModelOutput } from '../contracts';
import type { RuntimeConfig } from '../config';
import { AppError } from '../errors';
import { requireAccess } from '../auth/access';
import { assessSafety } from './safety';
import { privacyBoundary } from './boundaries';
import { caseContext, prepareState, withAssessment } from './state';
import { applyAction, assertActionAllowed, startCase } from '../case-prep/reducer';
import { boundInput, reserveCost } from './limits';
import { ProviderError } from '../model/provider';
import { CitationValidationError } from '../evidence/validate';
const active=new Map<string,AbortController>();
const qualifiedNotice=assessSafety('medication').response!;
const supportReplies=new Set(['want to die','help kill someone','political debate'].map(trigger=>assessSafety(trigger).response!));
const assessmentBeingWritten='Every area is covered. I am writing your assessment now.';
const assessmentReady='Your assessment is ready. It scores each area and leaves the decision with you.';
const invalidOutput=()=>new AppError('INVALID_MODEL_OUTPUT','The AI response could not be verified. Your conversation is unchanged; please try again.',502);
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
 // The case record exists from the first turn, even one answered by the safety path, so a conversation with messages and no record is always legacy.
 const record=session.state.casePrep??startCase(session.mode);
 const supportOutput=(response:string):ModelOutput=>{const state=structuredClone(session.state);state.phase='support';state.casePrep=record;return {state,response,citations:[]};};
 // Loopholes appear only in the assessment, so only the assessment retrieves sources, and every assessment may use any of them again.
 const fresh=support||turn?[]:await evidence.retrieve({mode:session.mode,query:[session.state.position,...record.areas.flatMap(a=>a.quotes)].join(' '),excludeIds:[],limit:3});
 const input=boundInput({session,request,task,evidence:fresh,now:now.toISOString(),caseContext:caseContext(record,turn?turn.action:'assessment',turn&&['message','correction'].includes(turn.action)?turn.text:undefined)},config);
 const withNotice=(output:ModelOutput,qualified:boolean):ModelOutput=>{const prep=output.state.casePrep!;if(qualified&&!prep.qualifiedNoticeShown){prep.qualifiedNoticeShown=true;output.response=`${qualifiedNotice}\n\n${output.response}`;}return output;};
 const verify=async(result:ModelResult):Promise<ModelOutput>=>{
 controller.signal.throwIfAborted();const parsed=ModelOutputSchema.safeParse(result.output);if(!parsed.success)throw invalidOutput();const output=parsed.data;
 // A provider's own safety classification still wins with its fixed support reply; its state and prose are otherwise not authoritative for a case.
 if(output.state.phase==='support'&&supportReplies.has(output.response))return supportOutput(output.response);
 const qualified=safety.kind==='qualified'||output.response.startsWith(qualifiedNotice);const state=prepareState(input);
 if(turn){if(!output.casePrep)throw invalidOutput();const applied=applyAction(record,turn.action,turn.text,output.casePrep);state.phase='clarifying';state.casePrep=applied.record;return withNotice({state,response:applied.question??assessmentBeingWritten,citations:[]},qualified);}
 if(!output.assessment)throw invalidOutput();
 if(output.assessment.loopholes.some(p=>p.citations.length===0))throw new AppError('INVALID_EVIDENCE','Counterpoints require reviewed source support.',502);
 state.phase='card';state.casePrep=withAssessment(record,output.assessment,randomUUID(),clock.now().toISOString());
 return evidence.validate(withNotice({state,response:assessmentReady,citations:[],assessment:output.assessment},qualified),input.evidence);
 };
 let result:ModelResult;let verified:ModelOutput|undefined;
 if(support){verified=supportOutput(boundary||safety.response!);result={output:verified,inputTokens:0,outputTokens:0,costMicros:0};}
 else{
 let generated:ModelResult|undefined;for(let attempt=0;attempt<2;attempt++){
 controller.signal.throwIfAborted();const op=await store.getOperation(userId,sessionId,request.operationId);if(op?.status!=='pending')throw new AppError('CANCELLED','This response was cancelled.',409);
 const attemptId=randomUUID();await store.reserveSpend({id:attemptId,operationId:request.operationId,userId,reservedMicros:reserveCost(input,config),createdAt:clock.now().toISOString()},config.dailySpendLimitMicros);
 try{generated=await Promise.race([model.generate(input,controller.signal),new Promise<never>((_,reject)=>{if(controller.signal.aborted)reject(new Error('Cancelled'));else controller.signal.addEventListener('abort',()=>reject(new Error('Cancelled')),{once:true});})]);if(generated.costKnown!==false)await store.reconcileSpend(attemptId,generated.costMicros);verified=await verify(generated);break;}catch(error){
 const retryable=error instanceof ProviderError?error.transient:error instanceof CitationValidationError||(error instanceof AppError&&error.code==='INVALID_MODEL_OUTPUT');
 if(!retryable||attempt!==0||controller.signal.aborted)throw error;
 await retryDelay(error instanceof ProviderError?error.retryAfterMs??200+Math.floor(Math.random()*200):200,undefined,{signal:controller.signal});
 }
 }if(!generated)throw new AppError('PROVIDER_ERROR','The response could not complete.',503);result=generated;
 }
 controller.signal.throwIfAborted();const output=verified??await verify(result);
 const stamp=clock.now().toISOString();const messages=[...(turn?[{id:randomUUID(),role:'user' as const,text:turn.text,createdAt:stamp,operationId:request.operationId,citations:[]}]:[]),{id:randomUUID(),role:'assistant' as const,text:output.response,createdAt:stamp,operationId:request.operationId,citations:output.citations}];
 return await store.commitTurn({userId,sessionId,operationId:request.operationId,expectedRevision:request.expectedRevision,state:output.state,messages,usage:{inputTokens:result.inputTokens,outputTokens:result.outputTokens,costMicros:result.costMicros},now:stamp});
 }catch(error){try{await store.failTurn(userId,sessionId,request.operationId,controller.signal.aborted?'CANCELLED':'GENERATION_FAILED');}catch{}if(controller.signal.aborted)throw new AppError('CANCELLED','The response was cancelled or timed out. Please try again.',408);throw error;}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);active.delete(key);}
 }
}
export function createConversationEngine(services:ConversationServices){return new ConversationEngine(services);}
