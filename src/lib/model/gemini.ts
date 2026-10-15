import { z } from 'zod';
import { ModelOutputSchema, type ModelInput, type ModelService } from '../contracts';
import type { RuntimeConfig } from '../config';
import { assessSafety } from '../conversation/safety';
import { prepareState } from '../conversation/state';
import { instructions, ProviderError } from './provider';

const EnvelopeSchema=z.object({safety:z.enum(['ordinary','crisis','harm','political','qualified']),output:ModelOutputSchema}).strict();
function responseSchema(){
 const schema=z.toJSONSchema(EnvelopeSchema);
 const supported=new Set(['$id','$defs','$ref','$anchor','type','format','title','description','enum','items','prefixItems','minItems','maxItems','minimum','maximum','anyOf','oneOf','properties','additionalProperties','required','propertyOrdering']);
 const clean=(node:unknown):void=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(clean);return;}const value=node as Record<string,unknown>;if('const'in value)value.enum=[value.const];for(const key of Object.keys(value)){if(!supported.has(key)){delete value[key];continue;}if(key==='properties'||key==='$defs')Object.values(value[key] as Record<string,unknown>).forEach(clean);else if(['items','prefixItems','anyOf','oneOf','additionalProperties'].includes(key))clean(value[key]);}};
 clean(schema);return schema;
}
function safeOutput(raw:string,input:ModelInput):unknown {
 let envelope:z.infer<typeof EnvelopeSchema>;try{envelope=EnvelopeSchema.parse(JSON.parse(raw));}catch{return null;}
 if(['crisis','harm','political'].includes(envelope.safety)){
  const trigger=envelope.safety==='crisis'?'want to die':envelope.safety==='harm'?'help kill someone':'political debate';
  const state=prepareState(input);state.phase='support';state.strengths=[];state.counterpoints=[];state.openQuestions=[];
  return {state,response:assessSafety(trigger).response,citations:[]};
 }
 if(envelope.safety==='qualified')envelope.output.response=`${assessSafety('medication').response}\n\n${envelope.output.response}`;
 return envelope.output;
}
interface GeminiResponse {
 candidates?:{finishReason?:string;content?:{parts?:{text?:string;thought?:boolean}[]}}[];
 promptFeedback?:{blockReason?:string};
 usageMetadata?:{promptTokenCount?:number;candidatesTokenCount?:number;thoughtsTokenCount?:number;totalTokenCount?:number;cachedContentTokenCount?:number;toolUsePromptTokenCount?:number};
}
/** One native generateContent request. The engine owns attempts, deadlines and
 * spend reservations. Thinking is disabled to bound output spending; any returned
 * thought tokens are still charged at the configured output rate. No tools/cache. */
export class GeminiModel implements ModelService {
 constructor(private config:RuntimeConfig,private fetcher:typeof fetch=fetch){if(typeof window!=='undefined')throw new Error('Models are server-only.');}
 async generate(input:ModelInput,signal:AbortSignal){
  if(!/^gemini-[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(this.config.model))throw new ProviderError(false,'Configure a supported Gemini model identifier.');
  let response:Response;
  try{response=await this.fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent`,{
   method:'POST',signal,headers:{'x-goog-api-key':this.config.modelApiKey,'Content-Type':'application/json'},
   body:JSON.stringify({systemInstruction:{parts:[{text:instructions}]},contents:[{role:'user',parts:[{text:JSON.stringify(input)}]}],generationConfig:{candidateCount:1,maxOutputTokens:this.config.maxOutputTokens,responseMimeType:'application/json',responseJsonSchema:responseSchema(),thinkingConfig:{thinkingBudget:0}}}),
  });}catch(error){if(signal.aborted)throw error;throw new ProviderError(true);}
  if(!response.ok)throw new ProviderError(response.status===429||response.status>=500);
  let body:GeminiResponse;try{body=await response.json() as GeminiResponse;}catch{throw new ProviderError(false,'The provider returned an invalid response.');}
  const usage=body?.usageMetadata;const blocked=Boolean(body?.promptFeedback?.blockReason)||Boolean(body?.candidates?.[0]?.finishReason&&body.candidates[0].finishReason!=='STOP');
  const inputTokens=usage?.promptTokenCount;
  const candidateTokens=usage?.candidatesTokenCount??(blocked?0:undefined);
  const thoughtTokens=usage?.thoughtsTokenCount??0;
  if(![inputTokens,candidateTokens,thoughtTokens].every(n=>Number.isSafeInteger(n)&&typeof n==='number'&&n>=0))throw new ProviderError(false,'Provider usage was missing or invalid.');
  // Gemini reports generated thought tokens separately from candidate text tokens.
  const outputTokens=candidateTokens!+thoughtTokens;
  const costMicros=Math.ceil(inputTokens!*this.config.modelInputUsdPerMillion+outputTokens*this.config.modelOutputUsdPerMillion);
  const candidate=body.candidates?.[0];const raw=candidate?.content?.parts?.filter(p=>!p.thought).map(p=>p.text??'').join('')??'';
  // Invalid/truncated/blocked content still returns known usage for reconciliation.
  return {output:candidate?.finishReason==='STOP'&&!body.promptFeedback?.blockReason?safeOutput(raw,input):null,inputTokens:inputTokens!,outputTokens,costMicros};
 }
}
