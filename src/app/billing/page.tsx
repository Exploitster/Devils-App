'use client';
import { useEffect, useState } from 'react';
import type { AccessDecision, Subscription } from '@/lib/contracts';
import { api, ErrorNotice, Shell } from '@/components/app';
interface Billing {
    subscription: Subscription | null;
    access: AccessDecision;
    runtimeMode: string;
    testMode: boolean;
    paymentsEnabled: boolean;
}
export default function BillingPage() { const [billing, setBilling] = useState<Billing>(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [token, setToken] = useState(''); async function load() { try {
    const data = await api<Billing>('/api/billing');
    setBilling(data);
    setToken(data.paymentsEnabled ? new URLSearchParams(location.search).get('testCheckout') ?? '' : '');
    setError('');
}
catch (e) {
    setError((e as Error).message);
} } useEffect(() => {
    api<Billing>('/api/billing').then(data => {
        setBilling(data);
        setToken(data.paymentsEnabled ? new URLSearchParams(location.search).get('testCheckout') ?? '' : '');
    }).catch(e => setError((e as Error).message));
}, []); async function post(path: string, body: unknown = {}) { if (!billing?.paymentsEnabled) return; setBusy(true); setError(''); try {
    const result = await api<{
        url?: string;
    }>(path, 'POST', body);
    if (result.url) {
        const url = new URL(result.url, location.origin);
        if (url.origin !== location.origin && url.protocol !== 'https:')
            throw new Error('The payment destination could not be verified.');
        location.assign(url.href);
    }
    else {
        setToken('');
        await load();
    }
}
catch (e) {
    setError((e as Error).message);
}
finally {
    setBusy(false);
} } return <Shell>
      <p className="eyebrow">More room to think</p>
      <h1>Billing</h1>
      <p className="lead">Both perspectives. One private place to work things through.</p>{billing && !billing.paymentsEnabled && <div className="notice" role="status"><strong>Payments are not connected yet</strong><p>Plans are shown below for reference. Checkout and subscription management will become available when payments are connected.</p></div>}{billing?.paymentsEnabled && billing.testMode && <div className="notice">
      <strong>{billing.runtimeMode === 'local' ? 'Local simulation · no payment is sent' : 'Stripe test mode · no live payments'}</strong>
      <p>This is a development payment flow, not a production subscription service.</p>
      </div>}{error && <ErrorNotice error={error} retry={load}/>}<section className="panel">
      <h2>Your access</h2>{billing ? <>
      <p>{billing.access.allowed ? 'Generation is available' : 'Generation is unavailable'} · {billing.access.reason}</p>{billing.subscription && <p>Subscription: {billing.subscription.status}. {billing.subscription.cancelAtPeriodEnd ? 'Renewal cancelled. Access continues until the paid period ends.' : 'Renews at the end of the current period.'} Current period ends {new Date(billing.subscription.currentPeriodEnd).toLocaleDateString()}.</p>}</> : <p role="status">Loading billing…</p>}<p>History, card export and deletion remain available after generation access expires.</p>
      </section>{billing?.paymentsEnabled && token && <section className="panel">
      <h2>Confirm a simulated subscription</h2>
      <p>Opening this page does not grant access. The button below explicitly completes the local test checkout.</p>
      <button className="primary" disabled={busy || !billing?.paymentsEnabled} onClick={() => post('/api/billing/local-confirm', { token })}>Confirm simulated subscription</button>
      </section>}<div className="mode-grid">
      <section className="panel">
      <h2>Monthly</h2>
      <p className="price">$59<span> / month</span>
      </p>
      <p>Business and philosophy modes, saved conversations, source inspection and hand-back cards.</p>
      <button disabled={busy || !billing?.paymentsEnabled || !!billing?.subscription} className="primary" onClick={() => post('/api/billing/checkout', { plan: 'monthly' })}>Choose monthly</button>
      </section>
      <section className="panel">
      <h2>Yearly</h2>
      <p className="price">$150<span> / year</span>
      </p>
      <p>$12.50 per month, billed yearly. Save $558 a year (about 79%) compared with 12 monthly payments.</p>
      <button disabled={busy || !billing?.paymentsEnabled || !!billing?.subscription} className="primary" onClick={() => post('/api/billing/checkout', { plan: 'yearly' })}>Choose yearly</button>
      </section>
      </div>
      <section className="panel">
      <h2>Manage your subscription</h2>
      <div className="actions">
      <button disabled={busy || !billing?.paymentsEnabled} onClick={() => post('/api/billing/portal')}>Manage billing</button>{billing?.paymentsEnabled && billing.runtimeMode === 'local' && billing.subscription && !billing.subscription.cancelAtPeriodEnd && <button disabled={busy || !billing?.paymentsEnabled} onClick={() => post('/api/billing/local-cancel')}>Cancel simulated renewal</button>}</div>
      <p className="fine">Fair use: 10 submissions/minute, one generation per user, 12,000 characters per message, 24-message context and an operator daily cost limit. No monthly debate quota.</p>
      </section>
      </Shell>; }
