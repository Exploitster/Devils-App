import { z } from 'zod';
import { ModelOutputSchema, type ModelInput } from '../contracts';
import type { RuntimeConfig } from '../config';
import { systemInstructions, providerInput } from './provider';
export const EnvelopeSchema=z.object({safety:z.enum(['ordinary','crisis','harm','political','qualified']),output:ModelOutputSchema}).strict();
function responseSchema(){
 const schema=z.toJSONSchema(EnvelopeSchema);
 const supported=new Set(['$id','$defs','$ref','$anchor','type','format','title','description','enum','items','prefixItems','minItems','maxItems','minimum','maximum','anyOf','oneOf','properties','additionalProperties','required','propertyOrdering']);
 const clean=(node:unknown):void=>{if(!node||typeof node!=='object')return;if(Array.isArray(node)){node.forEach(clean);return;}const value=node as Record<string,unknown>;if('const'in value)value.enum=[value.const];for(const key of Object.keys(value)){if(!supported.has(key)){delete value[key];continue;}if(key==='properties'||key==='$defs')Object.values(value[key] as Record<string,unknown>).forEach(clean);else if(['items','prefixItems','anyOf','oneOf','additionalProperties'].includes(key))clean(value[key]);}};
 clean(schema);return schema;
}
/** Shared by transport and spend reservation so prompt/schema changes cannot
 * silently drift away from the cost bound. Contains no credential headers. */
export function geminiRequest(input:ModelInput,config:RuntimeConfig){return {systemInstruction:{parts:[{text:systemInstructions(input)}]},contents:[{role:'user',parts:[{text:JSON.stringify(providerInput(input))}]}],generationConfig:{candidateCount:1,maxOutputTokens:config.maxOutputTokens,responseMimeType:'application/json',responseJsonSchema:responseSchema(),...(/^gemini-2\.5-/.test(config.model)?{thinkingConfig:{thinkingBudget:0}}:/^gemini-3[.-]/.test(config.model)?{thinkingConfig:{thinkingLevel:'low'}}:{})}};}
