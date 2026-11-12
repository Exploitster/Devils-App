import { AppError } from '../errors';

export type ModelKeyProvider = 'anthropic' | 'openai';
export const modelKeyProviders: readonly ModelKeyProvider[] = ['anthropic', 'openai'];
/** `sealedKey` is the encrypted key; `last4` is kept only so the person can recognise it. */
export interface StoredModelKey { userId: string; provider: ModelKeyProvider; model: string; sealedKey: string; last4: string; createdAt: string; updatedAt: string; }

/** One key per account, apart from the per-user Store so it never rides along with profile reads. Server code only. */
export interface ModelKeyStore {
  /** Null when the account has no key, and when the table does not exist yet. */
  get(userId: string): Promise<StoredModelKey | null>;
  put(record: StoredModelKey): Promise<void>;
  delete(userId: string): Promise<void>;
}

export function ownAiUnavailable(): AppError { return new AppError('OWN_AI_UNAVAILABLE', 'Connecting your own AI is not available yet.', 503); }
