import { getKnowledgeStore, getRuntimeConfig, getStore, requireIdentity } from '../auth/service';
import { createEvidenceService } from '../evidence/service';
import { createModelService, createUserModelService } from '../model/service';
import { getModelKeyService } from '../model-keys/service';
import { ConversationEngine } from './engine';
import { caseAreaLabels } from '../case-prep/versions';
import type { Session, TurnRequest } from '../contracts';
async function context(request:Request){
 const user=await requireIdentity(request);const config=getRuntimeConfig(request);
 // A person's own key, when they have connected one, runs and pays for their turns.
 const keys=getModelKeyService(config);const own=await keys.credentials(user.id);
 return {user,engine:new ConversationEngine({store:await getStore(request),config,evidence:createEvidenceService(),model:own?createUserModelService(own,config):createModelService(config),clock:{now:()=>new Date()},knowledge:getKnowledgeStore(config),ownAiOffered:keys.available,...(own?{ownAi:{withholdGuidance:config.ownAiGuidance==='withhold'}}:{})})};
}
export async function handleTurn(request:Request,id:string,input:TurnRequest){const {user,engine}=await context(request);return engine.turn(user.id,id,input,request.signal);}
export async function handleCard(request:Request,id:string,input:{operationId:string;expectedRevision:number}){const {user,engine}=await context(request);return engine.card(user.id,id,input,request.signal);}
export async function cancel(request:Request,id:string,operationId:string){const {user,engine}=await context(request);return engine.cancel(user.id,id,operationId);}
export async function sessionBody(request:Request,session:Session){return {session,caseAreas:await caseAreaLabels(getKnowledgeStore(getRuntimeConfig(request)),session)};}
