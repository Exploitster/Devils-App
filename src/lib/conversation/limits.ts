import type { ModelInput } from '../contracts';
import type { RuntimeConfig } from '../config';
import { geminiRequest } from '../model/request';
import { openRouterRequest } from '../model/openrouter-request';
export function boundInput(input:ModelInput,config:RuntimeConfig):ModelInput {return {...input,session:{...input.session,messages:input.session.messages.slice(-config.maxContextMessages).map(m=>({...m,text:m.text.slice(-4000)})),cards:input.session.cards.slice(-1)}};}
/** UTF-8 request bytes conservatively bound text tokens, including the actual
 * versioned instructions, escaped payload and JSON schema. Extra 1024 tokens
 * allow for provider protocol framing. Output cap includes thought tokens. */
export function reserveCost(input:ModelInput,config:RuntimeConfig){const request=config.modelProvider==='openrouter'?openRouterRequest:geminiRequest;return config.mode==='local'?0:Math.ceil((Buffer.byteLength(JSON.stringify(request(input,config)))+1024)*config.modelInputUsdPerMillion+config.maxOutputTokens*config.modelOutputUsdPerMillion);}
