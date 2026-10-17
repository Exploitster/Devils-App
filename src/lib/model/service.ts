import type { RuntimeConfig } from '../config';
import { DeterministicModel } from './deterministic';
import { GatewayModel } from './gateway';
import { GeminiModel } from './gemini';
import { OpenRouterModel } from './openrouter';
export function createModelService(config:RuntimeConfig){if(typeof window!=='undefined')throw new Error('Models are server-only.');return config.mode==='local'?new DeterministicModel():config.modelProvider==='gateway'?new GatewayModel(config):config.modelProvider==='openrouter'?new OpenRouterModel(config):new GeminiModel(config);}
