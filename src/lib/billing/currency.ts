export const currencies = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'CAD', 'AUD', 'SGD', 'JPY', 'NZD', 'CHF', 'BRL', 'MXN', 'ZAR'] as const;
export type DisplayCurrency = typeof currencies[number];
export function currencyForCountry(country: string | null): DisplayCurrency {
  const code = (country ?? '').toUpperCase();
  const mapped: Record<string, DisplayCurrency> = { IN: 'INR', US: 'USD', GB: 'GBP', AE: 'AED', CA: 'CAD', AU: 'AUD', SG: 'SGD', JP: 'JPY', NZ: 'NZD', CH: 'CHF', BR: 'BRL', MX: 'MXN', ZA: 'ZAR' };
  if (['AT','BE','CY','DE','EE','ES','FI','FR','GR','HR','IE','IT','LT','LU','LV','MT','NL','PT','SI','SK'].includes(code)) return 'EUR';
  return mapped[code] ?? 'INR';
}
export function parseRates(input: unknown, now = Date.now()): { date: string; rates: Partial<Record<DisplayCurrency, number>> } | null {
  if (!input || typeof input !== 'object') return null;
  const data = input as { date?: unknown; inr?: unknown };
  if (typeof data.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.date) || !data.inr || typeof data.inr !== 'object') return null;
  const age = now - Date.parse(`${data.date}T00:00:00Z`);
  if (!Number.isFinite(age) || age < -86400000 || age > 7 * 86400000) return null;
  const source = data.inr as Record<string, unknown>;
  const rates: Partial<Record<DisplayCurrency, number>> = { INR: 1 };
  for (const currency of currencies) {
    if (currency === 'INR') continue;
    const rate = source[currency.toLowerCase()];
    if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0 && rate < 100000) rates[currency] = rate;
  }
  return { date: data.date, rates };
}
