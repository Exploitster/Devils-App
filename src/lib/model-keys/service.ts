import { z } from 'zod';
import type { RuntimeConfig } from '../config';
import { createAdminClient } from '../auth/admin-client';
import { AppError } from '../errors';
import { AnthropicCatalog, LocalCatalog, OpenAiCatalog, providerNames, type ProviderCatalog } from './catalog';
import { openKey, sealKey } from './crypto';
import { LocalModelKeyStore } from './local-store';
import { SupabaseModelKeyStore } from './supabase-store';
import { ownAiUnavailable, type ModelKeyProvider, type ModelKeyStore, type StoredModelKey } from './store';

/** What the Account page may show. Never the key: only its last four characters. */
export interface ModelConnection { provider: ModelKeyProvider; model: string; last4: string; updatedAt: string; /** The stored key can no longer be read and must be entered again. */ needsReconnect: boolean; }
export interface OwnCredentials { provider: ModelKeyProvider; model: string; apiKey: string; }

const KeySchema = z.string().trim().min(20).max(300).regex(/^[\x21-\x7e]+$/);
export const ConnectSchema = z.object({ provider: z.enum(['anthropic', 'openai']), apiKey: KeySchema, model: z.string().min(1).max(100).optional() }).strict();
export const ChooseModelSchema = z.object({ model: z.string().min(1).max(100) }).strict();

export interface ModelKeyDependencies { store: ModelKeyStore; secret: string; catalogs: Record<ModelKeyProvider, ProviderCatalog>; now: () => Date; }

/** Saves, reads and removes a person's own AI key. Every method takes the authenticated account's ID, never a submitted one. */
export class ModelKeyService {
  constructor(private deps: ModelKeyDependencies) {}
  /** False until the server has an encryption secret. */
  get available(): boolean { return Boolean(this.deps.secret); }
  private context(record: Pick<StoredModelKey, 'userId' | 'provider'>): string { return `${record.userId}:${record.provider}`; }
  private read(record: StoredModelKey): string | null { return openKey(record.sealedKey, this.deps.secret, this.context(record)); }
  private view(record: StoredModelKey): ModelConnection { return { provider: record.provider, model: record.model, last4: record.last4, updatedAt: record.updatedAt, needsReconnect: this.read(record) === null }; }
  private async stored(userId: string): Promise<StoredModelKey | null> { return this.available ? this.deps.store.get(userId) : null; }

  async connection(userId: string): Promise<ModelConnection | null> { const record = await this.stored(userId); return record ? this.view(record) : null; }

  /** Checks the key with its provider before anything is stored. */
  async connect(userId: string, input: z.infer<typeof ConnectSchema>): Promise<{ connection: ModelConnection; models: string[] }> {
    if (!this.available) throw ownAiUnavailable();
    const { provider, apiKey } = input;
    if (provider === 'openai' && apiKey.startsWith('sk-ant-')) throw new AppError('MODEL_KEY_REJECTED', 'That looks like a Claude key. Choose Claude as the provider, or paste an OpenAI key.', 400);
    const models = await this.deps.catalogs[provider].listModels(apiKey);
    if (input.model && !models.includes(input.model)) throw new AppError('MODEL_UNAVAILABLE', `That model is not available on your ${providerNames[provider]} key.`, 400);
    const now = this.deps.now().toISOString(); const previous = await this.deps.store.get(userId);
    const record: StoredModelKey = { userId, provider, model: input.model ?? models[0], sealedKey: sealKey(apiKey, this.deps.secret, this.context({ userId, provider })), last4: apiKey.slice(-4), createdAt: previous?.createdAt ?? now, updatedAt: now };
    await this.deps.store.put(record);
    return { connection: this.view(record), models };
  }

  /** The models the stored key can use, for the model picker. */
  async models(userId: string): Promise<{ connection: ModelConnection; models: string[] }> {
    const { record, apiKey } = await this.usable(userId);
    return { connection: this.view(record), models: await this.deps.catalogs[record.provider].listModels(apiKey) };
  }

  async chooseModel(userId: string, model: string): Promise<ModelConnection> {
    const { record, apiKey } = await this.usable(userId);
    if (!(await this.deps.catalogs[record.provider].listModels(apiKey)).includes(model)) throw new AppError('MODEL_UNAVAILABLE', `That model is not available on your ${providerNames[record.provider]} key.`, 400);
    const updated = { ...record, model, updatedAt: this.deps.now().toISOString() };
    await this.deps.store.put(updated);
    return this.view(updated);
  }

  async disconnect(userId: string): Promise<void> { await this.deps.store.delete(userId); }

  /** For the conversation engine only. Null when there is no key, or it can no longer be read. */
  async credentials(userId: string): Promise<OwnCredentials | null> {
    const record = await this.stored(userId); const apiKey = record ? this.read(record) : null;
    return record && apiKey ? { provider: record.provider, model: record.model, apiKey } : null;
  }

  private async usable(userId: string): Promise<{ record: StoredModelKey; apiKey: string }> {
    const record = await this.stored(userId);
    if (!record) throw new AppError('NOT_FOUND', 'No AI key is connected.', 404);
    const apiKey = this.read(record);
    if (!apiKey) throw new AppError('MODEL_KEY_UNREADABLE', 'Your saved key can no longer be read. Enter it again.', 409);
    return { record, apiKey };
  }
}

const localStores = new Map<string, LocalModelKeyStore>();
const serviceStores = new Map<string, SupabaseModelKeyStore>();
/** Local development checks keys against a stub and never calls a provider. */
export function getModelKeyService(config: RuntimeConfig): ModelKeyService {
  if (typeof window !== 'undefined') throw new Error('Server services cannot run in a browser.');
  const now = () => new Date();
  if (config.mode === 'local') {
    let store = localStores.get(config.sqlitePath); if (!store) { store = new LocalModelKeyStore(config.sqlitePath); localStores.set(config.sqlitePath, store); }
    return new ModelKeyService({ store, secret: config.keyEncryptionSecret, catalogs: { anthropic: new LocalCatalog('anthropic'), openai: new LocalCatalog('openai') }, now });
  }
  const key = JSON.stringify([config.supabaseUrl, config.supabaseServiceRoleKey]);
  let store = serviceStores.get(key); if (!store) { store = new SupabaseModelKeyStore(createAdminClient(config)); serviceStores.set(key, store); }
  return new ModelKeyService({ store, secret: config.keyEncryptionSecret, catalogs: { anthropic: new AnthropicCatalog(), openai: new OpenAiCatalog() }, now });
}
