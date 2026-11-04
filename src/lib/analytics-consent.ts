/** Analytics permission affects public-page measurement only, never app access. */
export const analyticsConsentKey = 'devils-analytics-consent-v1';
export type AnalyticsConsent = 'accepted' | 'declined' | 'unknown';
export const analyticsPublicPaths = new Set([
  '/', '/about', '/features', '/business-validation', '/philosophical-reflection',
  '/how-it-works', '/pricing', '/faq', '/help', '/contact', '/security', '/sources',
  '/subscription-and-cancellation', '/refunds', '/privacy', '/terms', '/accessibility',
]);
export function readAnalyticsConsent(value: string | null): AnalyticsConsent {
  return value === 'accepted' || value === 'declined' ? value : 'unknown';
}
export function validClarityProjectId(value: string | undefined): value is string {
  return typeof value === 'string' && /^[a-z0-9]{4,32}$/.test(value);
}
export function isAnalyticsPage(pathname: string, search = '', hash = ''): boolean {
  // URL parameters/fragments can carry email addresses, OAuth codes or reset tokens.
  return analyticsPublicPaths.has(pathname) && !search && !hash;
}

/** PostHog project API keys are public write-only identifiers (phc_…), never personal API keys (phx_…). */
export function validPostHogKey(value: string | undefined): value is string {
  return typeof value === 'string' && /^phc_[A-Za-z0-9]{20,64}$/.test(value);
}
const postHogHosts = { us: 'https://us.i.posthog.com', eu: 'https://eu.i.posthog.com' } as const;
/** Only PostHog Cloud ingestion hosts are accepted. Unset means US cloud; anything else disables PostHog. */
export function resolvePostHogHost(value: string | undefined): string | null {
  const raw = (value ?? '').trim().replace(/\/+$/, '').toLowerCase();
  if (!raw || raw === 'us') return postHogHosts.us;
  if (raw === 'eu') return postHogHosts.eu;
  return (Object.values(postHogHosts) as string[]).includes(raw) ? raw : null;
}

type EventProperties = Record<string, unknown>;
export interface AnalyticsEvent { event: string; properties?: EventProperties; $set?: EventProperties; $set_once?: EventProperties }
function originOnly(value: unknown): unknown {
  if (typeof value !== 'string' || !value || value === '$direct') return value;
  try { return new URL(value).origin; } catch { return '$redacted'; }
}
function pathOnly(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try { const url = new URL(value); return `${url.origin}${url.pathname}`; } catch { return '$redacted'; }
}
function scrub(properties: EventProperties | undefined) {
  if (!properties) return;
  for (const key of Object.keys(properties)) {
    // Referrers can be private pages of this app (conversation IDs, reset or OAuth tokens).
    if (/referrer$/i.test(key)) properties[key] = originOnly(properties[key]);
    else if (/current_url$/i.test(key)) properties[key] = pathOnly(properties[key]);
  }
}
/**
 * PostHog before_send hook. Events are dropped unless they describe an allowlisted
 * public page with no query or fragment; URLs are reduced to origin+path and
 * referrers to origin only. Returning null discards the event before it is sent.
 */
export function sanitizeAnalyticsEvent<T extends AnalyticsEvent>(event: T | null): T | null {
  if (!event) return null;
  if (event.event === '$identify' || event.event === '$create_alias' || event.event === '$groupidentify') return null;
  const current = event.properties?.$current_url;
  if (typeof current !== 'string') return null;
  let url: URL;
  try { url = new URL(current); } catch { return null; }
  if (!isAnalyticsPage(url.pathname, url.search, url.hash)) return null;
  scrub(event.properties); scrub(event.$set); scrub(event.$set_once);
  return event;
}
