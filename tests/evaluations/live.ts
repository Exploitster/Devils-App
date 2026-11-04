import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readConfig } from '../../src/lib/config';
import { SessionSchema, type Mode } from '../../src/lib/contracts';
import { LocalStore } from '../../src/lib/store/local';
import { ConversationEngine } from '../../src/lib/conversation/engine';
import { createEvidenceService } from '../../src/lib/evidence/service';
import { GeminiModel } from '../../src/lib/model/gemini';
import { promptVersion } from '../../src/lib/model/provider';

if(!process.argv.includes('--confirm-live'))throw new Error('Live evaluation requires --confirm-live and may consume Gemini quota.');
try{process.loadEnvFile('.env.local');}catch{}
// Published standard text rates checked 2026-10-15. Used conservatively even for
// free-tier accounts. Explicit environment rates override these estimates.
const model=process.env.DEVILS_MODEL??'gemini-3.8-flash';
if(model!=='gemini-3.8-flash'&&(!process.env.DEVILS_MODEL_INPUT_USD_PER_MILLION||!process.env.DEVILS_MODEL_OUTPUT_USD_PER_MILLION))throw new Error('Supply explicit prices for the configured model.');
if(Date.now()>Date.parse('2027-01-01T00:00:00Z')&&(!process.env.DEVILS_MODEL_INPUT_USD_PER_MILLION||!process.env.DEVILS_MODEL_OUTPUT_USD_PER_MILLION))throw new Error('Review current Gemini pricing before live evaluation.');
const config=readConfig({...process.env,DEVILS_RUNTIME_MODE:'services',DEVILS_MODEL:model,DEVILS_MODEL_INPUT_USD_PER_MILLION:process.env.DEVILS_MODEL_INPUT_USD_PER_MILLION??'0.75',DEVILS_MODEL_OUTPUT_USD_PER_MILLION:process.env.DEVILS_MODEL_OUTPUT_USD_PER_MILLION??'3.75',DEVILS_MAX_OUTPUT_TOKENS:'5000',DEVILS_GENERATION_TIMEOUT_MS:'45000',DEVILS_DAILY_SPEND_LIMIT_MICROS:'250000',DEVILS_BETA_ACTIVE:'true',DEVILS_PAYMENTS_ENABLED:'false'});
const cases=JSON.parse(readFileSync(new URL('./cases.json',import.meta.url),'utf8')) as {id:string;mode:Mode;input:string;checks:string[]}[];
const selected=cases.filter(item=>['voice-ai-booking','sensitive-skin-concentrate','pricing-change'].includes(item.id));
const attempts:{httpStatus:number;servedModelVersion?:string}[]=[];
const fetcher:typeof fetch=async(url,options)=>{const response=await fetch(url,options);const body=await response.clone().json().catch(()=>null);attempts.push({httpStatus:response.status,servedModelVersion:typeof body?.modelVersion==='string'?body.modelVersion:undefined});return response;};
const store=new LocalStore(':memory:');
const results:unknown[]=[];
let failed=false;
try{
 const userId='synthetic-live-evaluation';let now=new Date();
 await store.putProfile({id:userId,email:'synthetic@example.test',disabled:false,deletionState:'none',createdAt:now.toISOString()});
 await store.putInvite({userId,enabled:true,expiresAt:new Date(now.getTime()+3600000).toISOString()});
 const engine=new ConversationEngine({store,config,evidence:createEvidenceService(),model:new GeminiModel(config,fetcher),clock:{now:()=>now}});
 for(const item of selected){
  now=new Date();
  const created=await store.createSession(userId,{mode:item.mode,topic:'startup',title:item.id==='pricing-change'?'Pricing decision':'Business idea'},now.toISOString());
  try{
   let saved=await engine.turn(userId,created.id,{operationId:`${item.id}-describe`,expectedRevision:0,text:item.input,action:'message'});
   if(saved.state.phase==='clarifying')saved=await engine.turn(userId,created.id,{operationId:`${item.id}-skip`,expectedRevision:saved.revision,text:'I do not know yet; help me identify a falsifiable test.',action:'skip'});
   saved=await engine.card(userId,created.id,{operationId:`${item.id}-card`,expectedRevision:saved.revision});
   SessionSchema.parse(saved);
   assert.ok(saved.state.clarifications.length<=3);
   assert.equal(saved.cards.at(-1)?.closing,'Your call. Always.');
   assert.ok(saved.cards.at(-1)?.nextStep.trim());
   results.push({id:item.id,mechanicalContract:'passed',qualitativeReview:'pending',qualitativeChecks:item.checks,session:saved});
   console.log(`${item.id}: structured conversation and card passed; qualitative review remains required.`);
  }catch(error){
   failed=true;results.push({id:item.id,mechanicalContract:'failed',errorCode:error&&typeof error==='object'&&'code'in error?String(error.code):'EVALUATION_FAILED',qualitativeReview:'not completed'});
   console.error(`${item.id}: evaluation could not complete. See sanitized status report.`);
   break; // Outages or invalid responses do not trigger a quota-burning sweep.
  }
 }
}finally{
 mkdirSync('.local/evaluations',{recursive:true});
 writeFileSync('.local/evaluations/live-latest.json',JSON.stringify({promptVersion,requestedModel:model,maximumEstimatedSpendUsd:0.25,pricing:'standard paid-rate estimate; account invoice may differ',syntheticDataOnly:true,hostedUserDataModified:false,attempts,results,passed:!failed},null,2));
 store.close();
 if(failed)process.exitCode=1;
}
