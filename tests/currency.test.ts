import { describe, expect, it } from 'vitest';
import { currencyForCountry, parseRates } from '../src/lib/billing/currency';
describe('indicative monthly pricing', () => {
  const now = Date.parse('2026-10-26T12:00:00Z');
  it('suggests a regional currency and falls back to INR', () => {
    expect(currencyForCountry('us')).toBe('USD');
    expect(currencyForCountry('DE')).toBe('EUR');
    expect(currencyForCountry('IN')).toBe('INR');
    expect(currencyForCountry(null)).toBe('INR');
  });
  it('rejects stale, invalid and future snapshots', () => {
    for (const date of ['2026-10-01', 'garbage', '2027-01-01']) expect(parseRates({ date, inr: { usd: 0.01 } }, now)).toBeNull();
    expect(parseRates(null, now)).toBeNull();
  });
  it('preserves INR and excludes invalid rates', () => {
    expect(parseRates({ date: '2026-10-25', inr: { inr: 8, usd: 0.01, eur: -2, gbp: '0.1', aud: Infinity, cad: 0 } }, now)).toEqual({ date: '2026-10-25', rates: { INR: 1, USD: 0.01 } });
  });
});
