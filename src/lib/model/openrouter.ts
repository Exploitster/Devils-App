import { z } from 'zod';
import type { ModelInput, ModelService } from '../contracts';
import type { RuntimeConfig } from '../config';
import { ProviderError } from './provider';
import { decodeRouterOutput, openRouterRequest } from './openrouter-request';

const UsageSchema = z.object({
  prompt_tokens: z.number().int().nonnegative().safe(),
  completion_tokens: z.number().int().nonnegative().safe(),
  cost: z.number().finite().nonnegative().max(1000),
});
/** One request; OpenRouter handles approved model/provider routing. The engine
 * owns retry count, cancellation, deadlines, reservations and reconciliation. */
export class OpenRouterModel implements ModelService {
  constructor(private config: RuntimeConfig, private fetcher: typeof fetch = fetch) {
    if (typeof window !== 'undefined') throw new Error('Models are server-only.');
  }
  async generate(input: ModelInput, signal: AbortSignal) {
    let response: Response;
    try {
      response = await this.fetcher('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', signal,
        headers: { Authorization: `Bearer ${this.config.modelApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(openRouterRequest(input, this.config)),
      });
    } catch (error) { if (signal.aborted) throw error; throw new ProviderError(true); }
    if (!response.ok) throw new ProviderError(response.status === 429 || response.status >= 500);
    let body;
    try { body = await response.json(); } catch { throw new ProviderError(false, 'The provider returned an invalid response.'); }
    // OpenRouter may return an error payload after a successful HTTP status.
    if (body?.error) throw new ProviderError(body.error.code === 429 || (typeof body.error.code === 'number' && body.error.code >= 500));
    const usage = UsageSchema.safeParse(body?.usage);
    if (!usage.success) throw new ProviderError(false, 'Provider usage was missing or invalid.');
    const { prompt_tokens: inputTokens, completion_tokens: outputTokens, cost } = usage.data;
    const costMicros = Math.ceil(cost * 1_000_000);
    const choice = body?.choices?.[0];
    const permittedModel = [this.config.model, ...this.config.fallbackModels].includes(body?.model);
    // completion_tokens already includes reasoning tokens. Charge authoritative
    // usage.cost once; never add reasoning tokens or infer a free response.
    const output = permittedModel && choice?.finish_reason === 'stop' && !choice?.message?.refusal && typeof choice?.message?.content === 'string'
      ? decodeRouterOutput(choice.message.content, input) : null;
    return { output, inputTokens, outputTokens, costMicros };
  }
}
