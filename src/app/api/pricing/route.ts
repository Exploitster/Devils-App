import { NextRequest, NextResponse } from 'next/server';
import { currencyForCountry, parseRates } from '@/lib/billing/currency';

export async function GET(request: NextRequest) {
  // Vercel supplies country at its edge. It affects display only, never checkout or access.
  const country = process.env.VERCEL === '1' ? request.headers.get('x-vercel-ip-country') : null;
  const currency = currencyForCountry(country);
  let exchange = null;
  try {
    const response = await fetch('https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/inr.json', { next: { revalidate: 3600 }, signal: AbortSignal.timeout(4000) });
    if (response.ok) exchange = parseRates(await response.json());
  } catch { /* INR remains authoritative when estimates are unavailable. */ }
  return NextResponse.json({ baseCurrency: 'INR', monthlyAmount: 2000, currency, locationDetected: Boolean(country), ...exchange }, { headers: { 'Cache-Control': 'private, no-store' } });
}
