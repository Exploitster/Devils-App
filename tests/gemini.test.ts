import { expect, it } from 'vitest';
import { z } from 'zod';
import { AssessmentProseSchema, CasePrepProposalSchema, ModelOutputSchema, type AreaBrief, type AreaStatus, type CaseContext, type ModelInput } from '../src/lib/contracts';
import { findArea } from '../src/lib/case-prep/frameworks';
import { EnvelopeSchema, geminiRequest } from '../src/lib/model/request';
import { readConfig } from '../src/lib/config';
import { GeminiModel } from '../src/lib/model/gemini';
import { DeterministicModel } from '../src/lib/model/deterministic';
const config=()=>({...readConfig({DEVILS_RUNTIME_MODE:'local',DEVILS_LOCAL_AUTH_SECRET:'x'.repeat(32)}),model:'gemini-2.5-flash',modelApiKey:'private-key',modelInputUsdPerMillion:2,modelOutputUsdPerMillion:3});
const input:ModelInput={session:{id:'s',ownerId:'u',mode:'business',topic:'startup',title:'Test',revision:0,state:{phase:'description',position:'',underlyingQuestion:'',clarifications:[],strengths:[],counterpoints:[],openQuestions:[],nextStep:'',usedArgumentIds:[],usedEvidenceIds:[],summary:''},messages:[],cards:[],createdAt:'2026-10-15T00:00:00Z',updatedAt:'2026-10-15T00:00:00Z'},request:{operationId:'a',expectedRevision:0,text:'Customers pay because costs fall',action:'message'},task:'turn',evidence:[],now:'2026-10-15T00:00:00Z'};
const usageMetadata={promptTokenCount:10,candidatesTokenCount:4,thoughtsTokenCount:6,totalTokenCount:20};
async function envelope(){return {safety:'ordinary',output:(await new DeterministicModel().generate(input,new AbortController().signal)).output};}
it('parses validated Gemini envelope and charges candidate plus thought tokens once',async()=>{const raw=JSON.stringify(await envelope());const model=new GeminiModel(config(),async()=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'not output'},{text:raw.slice(0,20)},{text:raw.slice(20)}]}}],usageMetadata})));const result=await model.generate(input,new AbortController().signal);expect(result.output).toMatchObject({state:{position:'Customers pay because costs fall'}});expect(result.inputTokens).toBe(10);expect(result.outputTokens).toBe(10);expect(result.costMicros).toBe(50);});
it.each(['invalid-json','MAX_TOKENS','SAFETY','missing-classification'])('returns known usage with null output for %s',async(kind)=>{const raw=kind==='invalid-json'?'{':JSON.stringify(kind==='missing-classification'?{output:{}}:await envelope());const model=new GeminiModel(config(),async()=>new Response(JSON.stringify({candidates:[{finishReason:['MAX_TOKENS','SAFETY'].includes(kind)?kind:'STOP',content:{parts:[{text:raw}]}}],usageMetadata})));expect(await model.generate(input,new AbortController().signal)).toMatchObject({output:null,costMicros:50});});
it.each([[429,true],[503,true],[400,false],[401,false]])('maps HTTP %s without an internal retry',async(status,transient)=>{let calls=0;const model=new GeminiModel(config(),async()=>{calls++;return new Response('private provider diagnostic',{status:status as number});});await expect(model.generate(input,new AbortController().signal)).rejects.toMatchObject({transient});expect(calls).toBe(1);});
it('preserves abort signal and never reclassifies cancellation as retryable network failure',async()=>{const controller=new AbortController();const error=new Error('aborted');const model=new GeminiModel(config(),async(_url,options)=>{expect(options!.signal).toBe(controller.signal);controller.abort();throw error;});await expect(model.generate(input,controller.signal)).rejects.toBe(error);});
it('requires valid usage rather than guessing a zero charge',async()=>{const model=new GeminiModel(config(),async()=>new Response(JSON.stringify({candidates:[{finishReason:'STOP'}]})));await expect(model.generate(input,new AbortController().signal)).rejects.toMatchObject({transient:false});});
it('forces a supportive response on structured crisis classification',async()=>{const payload=await envelope();payload.safety='crisis';const model=new GeminiModel(config(),async()=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(payload)}]}}],usageMetadata})));expect((await model.generate(input,new AbortController().signal)).output).toMatchObject({state:{phase:'support',counterpoints:[]},response:expect.stringContaining('Your safety matters')});});
it('uses a versioned focus prompt and minimizes private identifiers in the provider payload',async()=>{const model=new GeminiModel(config(),async(_url,options)=>{const body=JSON.parse(options!.body as string);const payload=JSON.parse(body.contents[0].parts[0].text);expect(body.systemInstruction.parts[0].text).toContain('devils-advocate-mvp/3');expect(body.systemInstruction.parts[0].text).toContain('rigorous falsification');expect(payload.conversation).not.toHaveProperty('ownerId');expect(payload.conversation).not.toHaveProperty('id');expect(payload.request).not.toHaveProperty('operationId');expect(payload).not.toHaveProperty('now');return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(await envelope())}]}}],usageMetadata}));});await model.generate(input,new AbortController().signal);});
it('uses supported low thinking level for Gemini 3 and accounts for thought tokens',async()=>{const model=new GeminiModel({...config(),model:'gemini-3.8-flash'},async(_url,options)=>{expect(JSON.parse(options!.body as string).generationConfig.thinkingConfig).toEqual({thinkingLevel:'low'});return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(await envelope())}]}}],usageMetadata}));});expect((await model.generate(input,new AbortController().signal)).outputTokens).toBe(10);});
it('reserves the complete versioned structured request and the configured output cap',async()=>{const {reserveCost}=await import('../src/lib/conversation/limits');const cfg={...config(),mode:'services' as const,model:'gemini-3.8-flash'};let requestBytes=0;const model=new GeminiModel(cfg,async(_url,options)=>{requestBytes=Buffer.byteLength(options!.body as string);return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(await envelope())}]}}],usageMetadata}));});await model.generate(input,new AbortController().signal);expect(reserveCost(input,cfg)).toBe(Math.ceil((requestBytes+1024)*cfg.modelInputUsdPerMillion+cfg.maxOutputTokens*cfg.modelOutputUsdPerMillion));});

const brief=(id:string,status:AreaStatus,quotes:string[]=[]):AreaBrief=>{const area=findArea('business',id)!;return {id:area.id,label:area.label,establishes:area.establishes,strongSignals:area.strongSignals,followUps:area.followUps,status,followUpsUsed:1,quotes};};
const history=['FIRST_MESSAGE_ONLY_IN_HISTORY','Which clinics miss the most calls?','Clinics miss calls after hours','Who exactly is the customer?','Small clinics','Which small clinics, exactly?'].map((text,i)=>({id:`m${i}`,role:i%2?'assistant' as const:'user' as const,text,createdAt:'2026-10-15T00:00:00Z',citations:[]}));
const caseInput=(purpose:CaseContext['purpose']):ModelInput=>({...input,task:purpose==='assessment'?'card':'turn',request:purpose==='assessment'?{operationId:'a',expectedRevision:3}:{operationId:'a',expectedRevision:3,text:'Independent dental clinics with two front-desk staff',action:purpose==='question'?'message':purpose},session:{...input.session,revision:3,messages:history,state:{...input.session.state,phase:'clarifying',position:'Clinics pay for an AI booking assistant',summary:'LEGACY_SUMMARY_FIELD'}},caseContext:{purpose,currentArea:brief('customer','probing',['Small clinics']),nextArea:brief('market','not_asked'),areas:[{id:'problem',label:'The problem and why now',status:'strong',quotes:['Clinics miss calls after hours']},{id:'customer',label:'Who the customer is',status:'probing',quotes:['Small clinics']}],latestAnswer:'Independent dental clinics with two front-desk staff',...(purpose==='assessment'?{assessment:{areas:[{id:'problem',label:'The problem and why now',score:'strong',reason:'You said "Clinics miss calls after hours".'}]}}:{})}});
const purposeRule={question:'verbatim span copied from latestAnswer',pushback:'Do not rate the answer',correction:'invalidatedAreaIds',assessment:'go/no-go'} as const;
it.each(['question','pushback','correction','assessment'] as const)('sends case-prep instructions and a compact case record for %s',purpose=>{
 const body=geminiRequest(caseInput(purpose),config());const system=body.systemInstruction.parts[0].text;const payload=JSON.parse(body.contents[0].parts[0].text);
 expect(system).toContain('Never provide a verdict or probability');expect(system).toContain(purposeRule[purpose]);expect(system).toContain('devils-advocate-mvp/3');
 expect(system).toContain('one short question');expect(system).toContain('never contain the answer');
 for(const legacy of ['three total','Underlying question and strengths must precede opposition','A card requires','Focus playbook','Debate output'])expect(system).not.toContain(legacy);
 expect(payload.case).toMatchObject({purpose,currentArea:{id:'customer',establishes:findArea('business','customer')!.establishes,quotes:['Small clinics']},nextArea:{id:'market'},latestAnswer:'Independent dental clinics with two front-desk staff'});
 expect(payload.conversation).toMatchObject({mode:'business',position:'Clinics pay for an AI booking assistant'});
 expect(payload.conversation).not.toHaveProperty('state');expect(payload.conversation.recentMessages).toHaveLength(4);
 expect(JSON.stringify(payload)).not.toMatch(/FIRST_MESSAGE_ONLY_IN_HISTORY|LEGACY_SUMMARY_FIELD/);
});
it('keeps the legacy instructions and payload for conversations without a case record',()=>{
 const body=geminiRequest(input,config());expect(body.systemInstruction.parts[0].text).toContain('Focus playbook');expect(JSON.parse(body.contents[0].parts[0].text)).not.toHaveProperty('case');
});
it('generates a Gemini response schema that keeps the proposal and prose intact and strips only re-validated bounds',()=>{
 const containers=['properties','$defs'];const nested=['items','prefixItems','anyOf','oneOf','allOf','additionalProperties','not'];
 const keywords=(node:unknown,found=new Set<string>()):Set<string>=>{if(!node||typeof node!=='object')return found;if(Array.isArray(node)){node.forEach(n=>keywords(n,found));return found;}for(const [key,value] of Object.entries(node)){found.add(key);if(containers.includes(key))Object.values(value as object).forEach(n=>keywords(n,found));else if(nested.includes(key))keywords(value,found);}return found;};
 const cleaned=geminiRequest(input,config()).generationConfig.responseJsonSchema as unknown as {properties:{output:{properties:Record<string,{properties?:object}>}}};const cleanedKeywords=keywords(cleaned);
 const stripped=[...keywords(z.toJSONSchema(EnvelopeSchema))].filter(key=>!cleanedKeywords.has(key));
 // Zod re-checks string lengths, date-time patterns and positive integers after parsing; const becomes enum.
 expect(stripped.every(key=>['$schema','minLength','maxLength','pattern','default','exclusiveMinimum','const'].includes(key))).toBe(true);
 const output=cleaned.properties.output.properties;
 expect(output.casePrep).toMatchObject({type:'object',additionalProperties:false,properties:{rating:{enum:['strong','weak','vague']},quote:{type:'string'},followUpQuestion:{type:'string'},nextAreaQuestion:{type:'string'},invalidatedAreaIds:{type:'array',items:{type:'string'}}}});
 expect(output.assessment).toMatchObject({type:'object',additionalProperties:false,required:['statement','good','bad','mustBeTrue','loopholes'],properties:{loopholes:{type:'array',maxItems:3,items:{required:['id','text','citations']}}}});
 expect(output.state.properties).not.toHaveProperty('casePrep');
});
const echoedState={phase:'clarifying',position:'Clinics pay for an AI booking assistant',underlyingQuestion:'',clarifications:[],strengths:[],counterpoints:[],openQuestions:[],nextStep:'',usedArgumentIds:[],usedEvidenceIds:[],summary:''};
const reply=(payload:unknown)=>new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(payload)}]}}],usageMetadata}));
it('returns the case-prep proposal and assessment prose from a Gemini envelope',async()=>{
 const casePrep={rating:'weak',quote:'Independent dental clinics',followUpQuestion:'Which of those clinics would notice a missed call first?',nextAreaQuestion:'How many clinics like that could you name?'};
 const turn=await new GeminiModel(config(),async()=>reply({safety:'ordinary',output:{state:echoedState,response:casePrep.followUpQuestion,citations:[],casePrep}})).generate(caseInput('question'),new AbortController().signal);
 expect(ModelOutputSchema.parse(turn.output).casePrep).toEqual(CasePrepProposalSchema.parse(casePrep));
 const assessment={statement:'An AI booking assistant for independent dental clinics.',good:['A concrete customer.'],bad:['No tested willingness to pay.'],mustBeTrue:['Clinics lose bookings to missed calls.'],loopholes:[]};
 const card=await new GeminiModel(config(),async()=>reply({safety:'ordinary',output:{state:{...echoedState,phase:'card'},response:'Your assessment is ready.',citations:[],assessment}})).generate(caseInput('assessment'),new AbortController().signal);
 expect(ModelOutputSchema.parse(card.output).assessment).toEqual(AssessmentProseSchema.parse(assessment));
});
it('rejects a model-authored case record inside the echoed state',async()=>{
 const casePrep={perspective:'business',areas:[{id:'customer',status:'strong',followUps:0,quotes:['x']}],currentAreaId:null,complete:true,qualifiedNoticeShown:false};
 const result=await new GeminiModel(config(),async()=>reply({safety:'ordinary',output:{state:{...echoedState,casePrep},response:'Done?',citations:[]}})).generate(caseInput('question'),new AbortController().signal);
 expect(result).toMatchObject({output:null,costMicros:50});
});
it('gives the assessment card task its own output budget and prices its reservation with it',async()=>{
 const {reserveCost}=await import('../src/lib/conversation/limits');const cfg={...config(),mode:'services' as const,maxOutputTokens:2500,maxAssessmentTokens:6000};
 const card=caseInput('assessment');const turn=caseInput('question');
 expect(geminiRequest(card,cfg).generationConfig.maxOutputTokens).toBe(6000);expect(geminiRequest(turn,cfg).generationConfig.maxOutputTokens).toBe(2500);
 const bytes=(value:ModelInput)=>Buffer.byteLength(JSON.stringify(geminiRequest(value,cfg)));
 expect(reserveCost(card,cfg)).toBe(Math.ceil((bytes(card)+1024)*cfg.modelInputUsdPerMillion+6000*cfg.modelOutputUsdPerMillion));
 expect(reserveCost(turn,cfg)).toBe(Math.ceil((bytes(turn)+1024)*cfg.modelInputUsdPerMillion+2500*cfg.modelOutputUsdPerMillion));
});
