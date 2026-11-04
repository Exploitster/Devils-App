import { describe, expect, it } from 'vitest';
import { analyticsPublicPaths, isAnalyticsPage, readAnalyticsConsent, validClarityProjectId } from '../src/lib/analytics-consent';

describe('public analytics consent boundary', () => {
  it('requires an explicit saved opt-in; malformed and old values do not grant consent', () => {
    expect(readAnalyticsConsent('accepted')).toBe('accepted');
    expect(readAnalyticsConsent('declined')).toBe('declined');
    for (const value of [null, '', 'true', '{"accepted":true}', 'granted']) expect(readAnalyticsConsent(value)).toBe('unknown');
  });
  it('does not track private routes, OAuth callbacks, or unknown pages', () => {
    for (const path of ['/home','/login','/signup','/forgot-password','/reset-password','/auth/callback','/onboarding','/account','/billing','/history','/sessions/123','/api/auth','/unknown']) expect(isAnalyticsPage(path)).toBe(false);
    for (const path of analyticsPublicPaths) expect(isAnalyticsPage(path)).toBe(true);
  });
  it('rejects URLs carrying parameters or fragments that could contain private tokens', () => {
    expect(isAnalyticsPage('/', '?email=someone@example.test')).toBe(false);
    expect(isAnalyticsPage('/privacy', '', '#access_token=private')).toBe(false);
    expect(isAnalyticsPage('/help', '?code=oauth-code')).toBe(false);
  });
  it('accepts only a plain Clarity project ID, never a script or arbitrary URL', () => {
    expect(validClarityProjectId('abc1234567')).toBe(true);
    for (const value of [undefined, '', 'abc', 'https://www.clarity.ms/tag/id', '../foo', 'id" onload="bad', 'ABC123456']) expect(validClarityProjectId(value)).toBe(false);
  });
});
