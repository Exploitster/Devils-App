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
