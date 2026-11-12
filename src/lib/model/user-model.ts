import { ProviderError } from './provider';

/**
 * A person's own key pays for the turn, so the reply is not squeezed into the app's
 * output budget: thinking and reasoning tokens need room on the newer models.
 */
export const USER_MAX_TOKENS = 16000;

/** Failures on a person's own key, in words that tell them what to change. Never includes provider text. */
export function userKeyFailure(name: string, status: number | undefined, retryAfterMs?: number): ProviderError {
  if (status === 401 || status === 403) return new ProviderError(false, `Your ${name} API key was not accepted. Update or remove it on the Account page.`);
  if (status === 402) return new ProviderError(false, `Your ${name} account has no credit left. Add credit there, or remove the key on the Account page.`);
  if (status === 404) return new ProviderError(false, `The ${name} model you chose is not available on your key. Pick another on the Account page.`);
  if (status === 429) return new ProviderError(true, `${name} is limiting requests on your key. Wait a moment and try again.`, retryAfterMs);
  if (status === 400 || status === 413 || status === 422) return new ProviderError(false, `${name} could not process this request. Try another model on the Account page.`);
  return new ProviderError(true);
}

/** Retry-After in seconds or as an HTTP date, bounded to two minutes. */
export function retryAfterMs(header: string | null | undefined): number | undefined {
  if (!header) return undefined;
  const ms = /^\d+(\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now();
  return Number.isFinite(ms) ? Math.min(120000, Math.max(1000, ms)) : undefined;
}
