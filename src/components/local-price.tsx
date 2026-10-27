'use client';
import { useEffect, useId, useState } from 'react';
import { currencies, currencyForCountry, type DisplayCurrency } from '@/lib/billing/currency';

type Quote = { currency: DisplayCurrency; locationDetected?: boolean; date?: string; rates?: Partial<Record<DisplayCurrency, number>> };
export function LocalPrice() {
  const id = useId();
  const [currency, setCurrency] = useState<DisplayCurrency>('INR');
  const [quote, setQuote] = useState<Quote>();
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/pricing', { signal: controller.signal }).then(r => { if (!r.ok) throw new Error(); return r.json(); }).then((data: Quote) => {
      setQuote(data);
      let fallback: DisplayCurrency = 'INR';
      try { fallback = currencyForCountry(new Intl.Locale(navigator.language).region ?? null); } catch { /* Keep INR. */ }
      setCurrency(data.locationDetected ? data.currency : fallback);
    }).catch(() => {}).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  const selected = currency;
  const rate = quote?.rates?.[selected];
  return <div className="local-price">
    <label htmlFor={id}>Show an estimated local price</label>
    <select id={id} value={selected} disabled={loading} onChange={event => { setCurrency(event.target.value as DisplayCurrency); }}>{currencies.map(code => <option key={code} value={code}>{code}</option>)}</select>
    <p role="status">{selected === 'INR' ? '₹2,000 INR per month.' : rate ? `Approximately ${new Intl.NumberFormat(undefined, { style: 'currency', currency: selected }).format(2000 * rate)} ${selected} / month.` : 'Local estimate unavailable. The base price is ₹2,000 INR per month.'}</p>
    <p className="fine">{quote?.date && selected !== 'INR' && rate ? `Indicative exchange rate dated ${quote.date} (Currency API via jsDelivr). ` : ''}Location suggests a display currency; you can change it. This estimate is not a checkout quote. Dodo confirms supported currencies, the final exchange rate and any taxes before payment. Your bank may charge conversion fees.</p>
  </div>;
}
