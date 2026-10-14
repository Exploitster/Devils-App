import type { RuntimeConfig } from '../config';
import { DeterministicModel } from './deterministic';
import { OpenAIModel } from './openai';
export function createModelService(config:RuntimeConfig){if(typeof window!=='undefined')throw new Error('Models are server-only.');return config.mode==='local'?new DeterministicModel():new OpenAIModel(config);}
