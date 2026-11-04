import { getRuntimeConfig, getStore, requireIdentity } from '../auth/service';
import { createEvidenceService } from '../evidence/service';
import { createModelService } from '../model/service';
import { ConversationEngine } from './engine';
import type { TurnRequest } from '../contracts';
async function context(request:Request){const user=await requireIdentity(request);const config=getRuntimeConfig(request);return {user,engine:new ConversationEngine({store:await getStore(request),config,evidence:createEvidenceService(),model:createModelService(config),clock:{now:()=>new Date()}})};}
export async function handleTurn(request:Request,id:string,input:TurnRequest){const {user,engine}=await context(request);return engine.turn(user.id,id,input,request.signal);}
export async function handleCard(request:Request,id:string,input:{operationId:string;expectedRevision:number}){const {user,engine}=await context(request);return engine.card(user.id,id,input,request.signal);}
export async function cancel(request:Request,id:string,operationId:string){const {user,engine}=await context(request);return engine.cancel(user.id,id,operationId);}
