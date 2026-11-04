import { z } from 'zod';
import { type ModelInput, type ModelService } from '../contracts';
import type { RuntimeConfig } from '../config';
import { assessSafety } from '../conversation/safety';
import { prepareState } from '../conversation/state';
import { ProviderError } from './provider';
import { EnvelopeSchema, geminiRequest } from './request';

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
 * spend reservations. Thinking is disabled for compatible Gemini 2.5 models; Gemini 3 uses low
 * thinking within the output-token cap. Any returned
 * thought tokens are still charged at the configured output rate. No tools/cache. */
export class GeminiModel implements ModelService {
 constructor(private config:RuntimeConfig,private fetcher:typeof fetch=fetch){if(typeof window!=='undefined')throw new Error('Models are server-only.');}
 async generate(input:ModelInput,signal:AbortSignal){
  if(!/^gemini-[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(this.config.model))throw new ProviderError(false,'Configure a supported Gemini model identifier.');
  let response:Response;
  try{response=await this.fetcher(`https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent`,{
   method:'POST',signal,headers:{'x-goog-api-key':this.config.modelApiKey,'Content-Type':'application/json'},
   body:JSON.stringify(geminiRequest(input,this.config)),
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
