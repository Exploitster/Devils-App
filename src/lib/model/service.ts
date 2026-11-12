import type { RuntimeConfig } from '../config';
import { DeterministicModel } from './deterministic';
import { GatewayModel } from './gateway';
import { GeminiModel } from './gemini';
import { OpenRouterModel } from './openrouter';
import { AnthropicUserModel } from './anthropic';
import { OpenAiUserModel } from './openai';
import type { OwnCredentials } from '../model-keys/service';
export function createModelService(config:RuntimeConfig){if(typeof window!=='undefined')throw new Error('Models are server-only.');return config.mode==='local'?new DeterministicModel():config.modelProvider==='gateway'?new GatewayModel(config):config.modelProvider==='openrouter'?new OpenRouterModel(config):new GeminiModel(config);}
/** The person's own provider and key. Local development keeps its deterministic model and calls no provider. */
export function createUserModelService(own:OwnCredentials,config:RuntimeConfig){if(typeof window!=='undefined')throw new Error('Models are server-only.');return config.mode==='local'?new DeterministicModel():own.provider==='anthropic'?new AnthropicUserModel(own,config):new OpenAiUserModel(own,config);}
