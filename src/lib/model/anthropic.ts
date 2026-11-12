import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { ModelInput, ModelResult, ModelService } from '../contracts';
import type { RuntimeConfig } from '../config';
import { ProviderError } from './provider';
import { decodeRouterOutput, openRouterRequest, RouterEnvelopeSchema } from './openrouter-request';
import { retryAfterMs, userKeyFailure, USER_MAX_TOKENS } from './user-model';

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const name = 'Claude';

/**
 * One Messages request on the person's own Anthropic key. The engine owns attempts,
 * deadlines and cancellation, so the SDK's own retries are off. Nothing is charged to
 * the app's budget: the cost is zero here and billed by Anthropic to the key's owner.
 */
export class AnthropicUserModel implements ModelService {
  private client: Anthropic;
  constructor(private own: { apiKey: string; model: string }, private config: RuntimeConfig, fetcher?: typeof fetch) {
    if (typeof window !== 'undefined') throw new Error('Models are server-only.');
    this.client = new Anthropic({ apiKey: own.apiKey, maxRetries: 0, timeout: config.generationTimeoutMs, ...(fetcher ? { fetch: fetcher } : {}) });
  }
  async generate(input: ModelInput, signal: AbortSignal): Promise<ModelResult> {
    const [system, user] = openRouterRequest(input, this.config).messages;
    // Thinking is adaptive by default on every model the catalog offers; effort keeps a question turn quick.
    const base = { model: this.own.model, max_tokens: USER_MAX_TOKENS, system: system.content, messages: [{ role: 'user' as const, content: user.content }] };
    const effort = input.task === 'card' ? 'medium' as const : 'low' as const;
    let message: Anthropic.Message | Anthropic.Beta.BetaMessage;
    try {
      try {
        // If a safety classifier declines, Anthropic re-runs the request on the model's default fallback.
        message = await this.client.beta.messages.create({ ...base, betas: [FALLBACK_BETA], fallbacks: 'default', output_config: { format: betaZodOutputFormat(RouterEnvelopeSchema), effort } }, { signal });
      } catch (error) {
        // A key whose organization lacks the fallback beta still gets its answer, without the fallback.
        if (!(error instanceof Anthropic.BadRequestError) || signal.aborted) throw error;
        message = await this.client.messages.create({ ...base, output_config: { format: zodOutputFormat(RouterEnvelopeSchema), effort } }, { signal });
      }
    } catch (error) {
      if (signal.aborted) throw error;
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) throw userKeyFailure(name, 401);
      if (error instanceof Anthropic.NotFoundError) throw userKeyFailure(name, 404);
      if (error instanceof Anthropic.RateLimitError) throw userKeyFailure(name, 429, retryAfterMs(error.headers?.get('retry-after')));
      if (error instanceof Anthropic.APIConnectionError) throw new ProviderError(true);
      if (error instanceof Anthropic.APIError) throw userKeyFailure(name, error.status);
      throw new ProviderError(true);
    }
    const usage = message.usage;
    const inputTokens = usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0);
    if (message.stop_reason === 'refusal') throw new ProviderError(false, 'Claude declined this request. Rephrase it and try again.');
    let text = '';
    for (const block of message.content) if (block.type === 'text') text += block.text;
    // A cut-off or paused reply is returned as unverifiable output with its usage, so the engine can retry once.
    return { output: message.stop_reason === 'end_turn' ? decodeRouterOutput(text, input) : null, inputTokens, outputTokens: usage.output_tokens, costMicros: 0 };
  }
}
