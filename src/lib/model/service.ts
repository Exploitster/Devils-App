import type { RuntimeConfig } from '../config';
import { DeterministicModel } from './deterministic';
import { GeminiModel } from './gemini';
export function createModelService(config:RuntimeConfig){if(typeof window!=='undefined')throw new Error('Models are server-only.');return config.mode==='local'?new DeterministicModel():new GeminiModel(config);}
