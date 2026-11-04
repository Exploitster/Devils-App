import { describe, expect, it } from 'vitest';
import { resolvePostHogHost, sanitizeAnalyticsEvent, validPostHogKey } from '../src/lib/analytics-consent';

const origin = 'https://www.devils-advocate.app';
const pageview = (url: string, extra: Record<string, unknown> = {}) => ({ event: '$pageview', properties: { $current_url: url, ...extra } });

describe('PostHog configuration boundary', () => {
  it('accepts only public project API keys, never personal keys or markup', () => {
    expect(validPostHogKey('phc_abcdefghijklmnopqrstuvwxyz0123456789ABCD')).toBe(true);
    for (const value of [undefined, '', 'phc_short', 'phx_abcdefghijklmnopqrstuvwxyz0123456789', 'abcdefghijklmnopqrstuvwxyz', 'phc_abc" onload="x', ' phc_abcdefghijklmnopqrstuvwxyz0123']) expect(validPostHogKey(value)).toBe(false);
  });
  it('resolves only PostHog Cloud ingestion hosts', () => {
    expect(resolvePostHogHost(undefined)).toBe('https://us.i.posthog.com');
    expect(resolvePostHogHost('')).toBe('https://us.i.posthog.com');
    expect(resolvePostHogHost('us')).toBe('https://us.i.posthog.com');
    expect(resolvePostHogHost('EU')).toBe('https://eu.i.posthog.com');
    expect(resolvePostHogHost('https://eu.i.posthog.com/')).toBe('https://eu.i.posthog.com');
    for (const value of ['https://evil.example', 'http://us.i.posthog.com', 'https://us.i.posthog.com.evil.example', 'javascript:alert(1)']) expect(resolvePostHogHost(value)).toBeNull();
  });
});

describe('PostHog event sanitizer', () => {
  it('keeps public-page events and reduces URLs and referrers', () => {
    const event = sanitizeAnalyticsEvent({ ...pageview(`${origin}/features`, { $referrer: `${origin}/sessions/123?x=1`, $initial_referrer: 'https://google.com/search?q=private', $initial_current_url: `${origin}/features` }), $set_once: { $initial_referrer: `${origin}/reset-password?token=secret` } });
    expect(event?.properties).toMatchObject({ $current_url: `${origin}/features`, $referrer: origin, $initial_referrer: 'https://google.com' });
    expect(event?.$set_once).toEqual({ $initial_referrer: origin });
    expect(JSON.stringify(event)).not.toMatch(/sessions|token|secret|q=private/);
  });
  it('drops events from private routes, unknown pages and URLs with parameters or fragments', () => {
    for (const path of ['/login', '/signup', '/home', '/sessions/abc', '/auth/callback', '/account', '/billing', '/history', '/onboarding', '/unknown', '/?email=a@example.test', '/privacy#access_token=x', '/help?code=oauth'])
      expect(sanitizeAnalyticsEvent(pageview(`${origin}${path}`))).toBeNull();
  });
  it('drops events without a page and identity events', () => {
    expect(sanitizeAnalyticsEvent(null)).toBeNull();
    expect(sanitizeAnalyticsEvent({ event: '$autocapture', properties: {} })).toBeNull();
    expect(sanitizeAnalyticsEvent({ event: '$pageview', properties: { $current_url: 'not a url' } })).toBeNull();
    for (const event of ['$identify', '$create_alias', '$groupidentify']) expect(sanitizeAnalyticsEvent({ event, properties: { $current_url: `${origin}/` } })).toBeNull();
  });
});
