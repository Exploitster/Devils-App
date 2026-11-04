import { getVercelOidcToken } from '@vercel/oidc';
import { z } from 'zod';
import type { ModelInput, ModelService } from '../contracts';
import type { RuntimeConfig } from '../config';
import { reserveCost } from '../conversation/limits';
import { ProviderError } from './provider';
import { decodeRouterOutput } from './openrouter-request';
import { gatewayRequest } from './gateway-request';
export { gatewayRequest } from './gateway-request';
const UsageSchema = z.object({ prompt_tokens: z.number().int().nonnegative().safe(), completion_tokens: z.number().int().nonnegative().safe(), cost: z.number().finite().nonnegative().max(1000).optional() });
export class GatewayModel implements ModelService {
  constructor(private config: RuntimeConfig, private fetcher: typeof fetch = fetch,
    private token: () => string | Promise<string> = () => config.modelApiKey || getVercelOidcToken()) {
    if (typeof window !== 'undefined') throw new Error('Models are server-only.');
  }
  async generate(input: ModelInput, signal: AbortSignal) {
    let token: string;
    try { token = await this.token(); } catch { throw new ProviderError(false, 'Gateway authentication is unavailable.'); }
    if (!token) throw new ProviderError(false, 'Gateway authentication is unavailable.');
    let response: Response;
    try {
      response = await this.fetcher('https://ai-gateway.vercel.sh/v1/chat/completions', {
        method: 'POST', signal, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(gatewayRequest(input, this.config)),
      });
    } catch (error) { if (signal.aborted) throw error; throw new ProviderError(true); }
    if (!response.ok) {
      const rawRetry = response.headers.get('retry-after');
      const seconds = rawRetry && /^\d+(\.\d+)?$/.test(rawRetry) ? Number(rawRetry) * 1000 : rawRetry ? Date.parse(rawRetry) - Date.now() : NaN;
      const retryAfterMs = response.status === 429 ? Math.min(120000, Math.max(1000, Number.isFinite(seconds) ? seconds : 60000)) : undefined;
      throw new ProviderError(response.status === 429 || response.status >= 500, undefined, retryAfterMs);
    }
    let body;
    try { body = await response.json(); } catch { throw new ProviderError(false); }
    if (body?.error) throw new ProviderError(false);
    const usage = UsageSchema.safeParse(body?.usage);
    if (!usage.success) throw new ProviderError(false, 'Gateway token usage was missing or invalid.');
    const { prompt_tokens: inputTokens, completion_tokens: outputTokens, cost } = usage.data;
    const costKnown = cost !== undefined;
    // Gateway does not always return a billed amount. Keep the entire reserved
    // upper bound charged to the local budget until authoritative cost is known.
    const costMicros = costKnown ? Math.ceil(cost * 1_000_000) : reserveCost(input, { ...this.config, mode: 'services' });
    const choice = body?.choices?.[0];
    const output = body?.model === this.config.model && choice?.finish_reason === 'stop' && !choice?.message?.refusal && typeof choice?.message?.content === 'string'
      ? decodeRouterOutput(choice.message.content, input) : null;
    return { output, inputTokens, outputTokens, costMicros, costKnown };
  }
}
