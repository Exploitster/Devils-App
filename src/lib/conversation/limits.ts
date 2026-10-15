import type { ModelInput } from '../contracts';
import type { RuntimeConfig } from '../config';
import { instructions } from '../model/provider';
export function boundInput(input:ModelInput,config:RuntimeConfig):ModelInput {return {...input,session:{...input.session,messages:input.session.messages.slice(-config.maxContextMessages).map(m=>({...m,text:m.text.slice(-4000)})),cards:input.session.cards.slice(-1)}};}
/** UTF-8 bytes are an intentionally conservative token upper bound. */
export function reserveCost(input:ModelInput,config:RuntimeConfig){return config.mode==='local'?0:Math.ceil((Buffer.byteLength(JSON.stringify(input))+Buffer.byteLength(instructions)+16000)*config.modelInputUsdPerMillion+config.maxOutputTokens*config.modelOutputUsdPerMillion);}
