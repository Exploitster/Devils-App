import Anthropic from '@anthropic-ai/sdk';
import { AppError } from '../errors';
import type { ModelKeyProvider } from './store';

/** What the app calls each provider when it talks to the person. */
export const providerNames: Record<ModelKeyProvider, string> = { anthropic: 'Claude', openai: 'OpenAI' };

/**
 * Lists the models a key can use for this app, best default first. Listing is free at
 * both providers, so saving a key costs the person nothing.
 */
export interface ProviderCatalog { listModels(apiKey: string, signal?: AbortSignal): Promise<string[]>; }

const rejected = (name: string) => new AppError('MODEL_KEY_REJECTED', `${name} did not accept that API key. Check it and try again.`, 400);
const unreachable = (name: string) => new AppError('MODEL_PROVIDER_UNAVAILABLE', `${name} could not be reached to check the key. Try again in a moment.`, 503);
const noModels = (name: string) => new AppError('MODEL_KEY_NO_MODELS', `That ${name} key cannot use a model this app supports.`, 400);

/** Claude Opus 5.5 is the default when the key can use it. */
const anthropicPreference = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];

/** Keeps the models that support what a turn needs: JSON output, adaptive thinking and an effort setting. */
export class AnthropicCatalog implements ProviderCatalog {
  constructor(private fetcher?: typeof fetch) {}
  async listModels(apiKey: string, signal?: AbortSignal): Promise<string[]> {
    const client = new Anthropic({ apiKey, maxRetries: 1, timeout: 15000, ...(this.fetcher ? { fetch: this.fetcher } : {}) });
    const ids: string[] = [];
    try {
      for await (const model of client.models.list({ limit: 100 }, { signal })) {
        const caps = model.capabilities;
        if (caps?.structured_outputs.supported && caps.effort.low.supported && caps.thinking.types.adaptive.supported) ids.push(model.id);
      }
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) throw rejected(providerNames.anthropic);
      throw unreachable(providerNames.anthropic);
    }
    if (!ids.length) throw noModels(providerNames.anthropic);
    return preferred(ids, anthropicPreference);
  }
}

/** Chat models that accept a strict JSON schema: gpt-4o, gpt-4.1 and every gpt-5 or later, with their mini and nano sizes. */
const openAiChatModel = /^gpt-(4o|4\.1|[5-9](\.\d+)?|\d{2,}(\.\d+)?)(-(mini|nano))?$/;
const openAiPreference = ['gpt-5.4-mini'];

export class OpenAiCatalog implements ProviderCatalog {
  constructor(private fetcher: typeof fetch = fetch) {}
  async listModels(apiKey: string, signal?: AbortSignal): Promise<string[]> {
    let response: Response;
    try { response = await this.fetcher('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${apiKey}` }, signal: signal ?? AbortSignal.timeout(15000) }); }
    catch { throw unreachable(providerNames.openai); }
    if (response.status === 401 || response.status === 403) throw rejected(providerNames.openai);
    if (!response.ok) throw unreachable(providerNames.openai);
    let body: { data?: { id?: unknown }[] };
    try { body = await response.json() as typeof body; } catch { throw unreachable(providerNames.openai); }
    const ids = (body.data ?? []).map(model => model.id).filter((id): id is string => typeof id === 'string' && openAiChatModel.test(id));
    if (!ids.length) throw noModels(providerNames.openai);
    // Newest first; within one version the mini size leads, as the lower-cost default.
    const version = (id: string) => Number(/^gpt-(\d+(?:\.\d+)?)/.exec(id)![1]);
    const size = (id: string) => id.endsWith('-mini') ? 0 : id.endsWith('-nano') ? 2 : 1;
    return preferred([...new Set(ids)].sort((a, b) => version(b) - version(a) || size(a) - size(b) || a.localeCompare(b)), openAiPreference);
  }
}

/** Development only: accepts keys that start with `local-` and calls no provider. */
export class LocalCatalog implements ProviderCatalog {
  constructor(private provider: ModelKeyProvider) {}
  async listModels(apiKey: string): Promise<string[]> {
    if (!apiKey.startsWith('local-')) throw rejected(providerNames[this.provider]);
    return this.provider === 'anthropic' ? ['local-claude-large', 'local-claude-small'] : ['local-gpt-large', 'local-gpt-small'];
  }
}

function preferred(ids: string[], preference: string[]): string[] {
  const first = preference.filter(id => ids.includes(id));
  return [...first, ...ids.filter(id => !first.includes(id))];
}
