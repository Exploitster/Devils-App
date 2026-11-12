import { z } from 'zod';
import type { ModelInput, ModelResult, ModelService } from '../contracts';
import type { RuntimeConfig } from '../config';
import { ProviderError } from './provider';
import { decodeRouterOutput, openRouterRequest, RouterEnvelopeSchema } from './openrouter-request';
import { retryAfterMs, userKeyFailure, USER_MAX_TOKENS } from './user-model';

const name = 'OpenAI';
const UsageSchema = z.object({ prompt_tokens: z.number().int().nonnegative().safe(), completion_tokens: z.number().int().nonnegative().safe() });

/**
 * Strict mode refuses length and range keywords, so they are removed from the wire schema.
 * The reply is still checked against the full schema by decodeRouterOutput.
 */
const unsupported = new Set(['$schema', 'minLength', 'maxLength', 'pattern', 'format', 'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'minItems', 'maxItems', 'default']);
export function strictSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strictSchema);
  if (!node || typeof node !== 'object') return node;
  return Object.fromEntries(Object.entries(node).filter(([key]) => !unsupported.has(key)).map(([key, value]) => [key, key === 'properties' || key === '$defs'
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([field, schema]) => [field, strictSchema(schema)])) : key === 'enum' || key === 'required' ? value : strictSchema(value)]));
}
const responseSchema = strictSchema(z.toJSONSchema(RouterEnvelopeSchema));

/**
 * One Chat Completions request on the person's own OpenAI key. The engine owns attempts,
 * deadlines and cancellation. Nothing is charged to the app's budget: the cost is zero
 * here and billed by OpenAI to the key's owner.
 */
export class OpenAiUserModel implements ModelService {
  constructor(private own: { apiKey: string; model: string }, private config: RuntimeConfig, private fetcher: typeof fetch = fetch) {
    if (typeof window !== 'undefined') throw new Error('Models are server-only.');
  }
  async generate(input: ModelInput, signal: AbortSignal): Promise<ModelResult> {
    const { messages } = openRouterRequest(input, this.config);
    let response: Response;
    try {
      response = await this.fetcher('https://api.openai.com/v1/chat/completions', {
        method: 'POST', signal, headers: { Authorization: `Bearer ${this.own.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.own.model, messages, max_completion_tokens: USER_MAX_TOKENS, store: false, response_format: { type: 'json_schema', json_schema: { name: 'decision_response', strict: true, schema: responseSchema } } }),
      });
    } catch (error) { if (signal.aborted) throw error; throw new ProviderError(true); }
    if (!response.ok) {
      let code: unknown;
      try { code = (await response.json() as { error?: { code?: unknown } })?.error?.code; } catch { /* The status alone decides. */ }
      // OpenAI reports an empty balance as a 429; it is not worth retrying.
      throw userKeyFailure(name, code === 'insufficient_quota' ? 402 : response.status, retryAfterMs(response.headers.get('retry-after')));
    }
    let body;
    try { body = await response.json(); } catch { throw new ProviderError(false, 'The provider returned an invalid response.'); }
    const usage = UsageSchema.safeParse(body?.usage);
    if (!usage.success) throw new ProviderError(false, 'Provider usage was missing or invalid.');
    const choice = body?.choices?.[0];
    if (choice?.message?.refusal) throw new ProviderError(false, 'OpenAI declined this request. Rephrase it and try again.');
    const output = choice?.finish_reason === 'stop' && typeof choice?.message?.content === 'string' ? decodeRouterOutput(choice.message.content, input) : null;
    return { output, inputTokens: usage.data.prompt_tokens, outputTokens: usage.data.completion_tokens, costMicros: 0 };
  }
}
