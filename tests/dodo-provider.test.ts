import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { DodoProvider, type DodoProviderConfig } from '@/lib/billing/dodo-provider';

const secret = `whsec_${Buffer.from('synthetic-webhook-secret-32-bytes!').toString('base64')}`;
const config: DodoProviderConfig = { apiKey: 'synthetic-api-token', environment: 'test_mode', productId: 'pdt_test', webhookSecret: secret, appUrl: 'https://www.devils-advocate.app' };
const price = { type: 'recurring_price', currency: 'INR', price: 200000, payment_frequency_count: 1, payment_frequency_interval: 'Month', subscription_period_count: 20, subscription_period_interval: 'Year', trial_period_days: 0 };
const product = { product_id: 'pdt_test', is_recurring: true, price };
function harness(responses: unknown[]) {
  const requests: Request[] = [];
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Request(input, init));
    const next = responses.shift();
    if (next instanceof Response) return next;
    return Response.json(next);
  }) as unknown as typeof fetch;
  return { provider: new DodoProvider(config, fetcher), requests, fetcher };
}
function signed(raw: string, timestamp = Math.floor(Date.now() / 1000), id = 'evt_test') {
  const signature = createHmac('sha256', Buffer.from(secret.slice(6), 'base64')).update(`${id}.${timestamp}.${raw}`).digest('base64');
  return new Headers({ 'webhook-id': id, 'webhook-timestamp': String(timestamp), 'webhook-signature': `v1,${signature}` });
}

describe('official Dodo SDK adapter', () => {
  it('accepts INR 2000 monthly with a long renewable lifetime', async () => {
    const { provider, requests } = harness([product]);
    await expect(provider.verifyProduct()).resolves.toEqual(product);
    expect(requests[0].url).toBe('https://test.dodopayments.com/products/pdt_test');
  });
  it.each([{ price: 50000 }, { currency: 'USD' }, { payment_frequency_interval: 'Year' }, { subscription_period_count: 1, subscription_period_interval: 'Month' }, { discount_bps: 1 }, { purchasing_power_parity: true }, { trial_period_days: 1 }, { trial_amount: 100 }])('rejects a mismatched declared plan %j', async (change) => {
    const { provider } = harness([{ ...product, price: { ...price, ...change } }]);
    await expect(provider.verifyProduct()).rejects.toMatchObject({ code: 'DODO_PRODUCT_MISMATCH' });
  });
  it('creates only the configured cart with server metadata, no native trial, and local currency selection', async () => {
    const { provider, requests } = harness([{ session_id: 'cks_1', checkout_url: 'https://test.checkout.dodopayments.com/session' }]);
    await provider.createCheckout('cus_1', 'user_1', 'operation_1');
    expect(await requests[0].json()).toEqual({ product_cart: [{ product_id: 'pdt_test', quantity: 1 }], customer: { customer_id: 'cus_1' }, metadata: { app_user_id: 'user_1', app_environment: 'test_mode', app_operation_id: 'operation_1' }, return_url: `${config.appUrl}/billing?checkout=returned`, cancel_url: `${config.appUrl}/billing?checkout=canceled`, subscription_data: { trial_period_days: 0 }, feature_flags: { allow_currency_selection: true, allow_discount_code: false, allow_customer_editing_email: false, allow_editing_addons: false } });
  });
  it.each(['https://checkout.dodopayments.com/session', 'https://test.checkout.dodopayments.com.evil.example/', 'http://test.checkout.dodopayments.com/', 'https://user:pass@test.checkout.dodopayments.com/', null])('rejects an unsafe or wrong-environment checkout URL %s', async (checkout_url) => {
    const { provider } = harness([{ session_id: 'cks_1', checkout_url }]);
    await expect(provider.createCheckout('cus_1', 'user_1', 'op_1')).rejects.toMatchObject({ code: 'DODO_INVALID_RESPONSE' });
  });
  it('does not automatically retry a failed write or expose a provider error body', async () => {
    const { provider, fetcher } = harness([Response.json({ message: 'secret provider body' }, { status: 500 })]);
    await expect(provider.createCustomer({ id: 'user_1', email: 'user@example.com' }, 'op_1')).rejects.toMatchObject({ code: 'DODO_UNAVAILABLE', message: 'The payment provider is temporarily unavailable. Please try again later.' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('paginates a nonempty page to an empty page and filters customer metadata', async () => {
    const own = { customer_id: 'cus_1', email: 'user@example.com', metadata: { app_user_id: 'u1', app_environment: 'test_mode' } };
    const { provider, requests } = harness([{ items: [own, { ...own, customer_id: 'foreign', metadata: {} }] }, { items: [] }]);
    await expect(provider.customers({ id: 'u1', email: own.email })).resolves.toEqual([own]);
    expect(new URL(requests[0].url).searchParams.get('page_number')).toBe('1');
    expect(new URL(requests[1].url).searchParams.get('page_number')).toBe('2');
  });
  it('rejects list overflow instead of silently truncating', async () => {
    const { provider, fetcher } = harness(Array.from({ length: 10 }, () => ({ items: [{ customer_id: 'cus_1' }] })));
    await expect(provider.customers({ id: 'u1', email: 'a@b.com' })).rejects.toMatchObject({ code: 'DODO_PAGINATION_LIMIT' });
    expect(fetcher).toHaveBeenCalledTimes(10);
  });
  it('verifies real HMAC signatures and rejects forgery, stale signatures, changed body and changed event ID', () => {
    const { provider, fetcher } = harness([]);
    const raw = JSON.stringify({ type: 'subscription.active', data: { subscription_id: 'sub_1' }, business_id: 'business', timestamp: new Date().toISOString() });
    expect(provider.unwrap(raw, signed(raw))).toMatchObject({ type: 'subscription.active' });
    const forged = signed(raw); forged.set('webhook-signature', 'v1,Zm9yZ2Vk');
    const changedId = signed(raw); changedId.set('webhook-id', 'evt_other');
    for (const headers of [forged, signed(raw, 1), changedId, new Headers()]) expect(() => provider.unwrap(raw, headers)).toThrow();
    expect(() => provider.unwrap(`${raw} `, signed(raw))).toThrow();
    expect(() => provider.unwrap('x'.repeat(256001), signed(raw))).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('creates customers with identity and operation metadata owned by the server', async () => {
    const customer = { customer_id: 'cus_1', email: 'a@example.com' };
    const { provider, requests } = harness([customer]);
    await expect(provider.createCustomer({ id: 'user_1', email: customer.email, name: 'Ada' }, 'op_1')).resolves.toEqual(customer);
    expect(await requests[0].json()).toEqual({ email: customer.email, name: 'Ada', metadata: { app_user_id: 'user_1', app_environment: 'test_mode', app_operation_id: 'op_1' } });
  });
  it('uses the explicit live SDK endpoint and live checkout host', async () => {
    const fetcher = vi.fn(async () => Response.json({ session_id: 'cks_live', checkout_url: 'https://checkout.dodopayments.com/cks_live' })) as unknown as typeof fetch;
    const provider = new DodoProvider({ ...config, environment: 'live_mode' }, fetcher);
    await expect(provider.createCheckout('cus_live', 'u1', 'op_1')).resolves.toMatchObject({ session_id: 'cks_live' });
    expect(String(vi.mocked(fetcher).mock.calls[0][0])).toBe('https://live.dodopayments.com/checkouts');
  });
  it('requests only recent successful payments for the server product, customer and subscription', async () => {
    const { provider, requests } = harness([{ items: [] }]);
    await expect(provider.payments('sub_1', 'cus_1')).resolves.toEqual([]);
    const query = new URL(requests[0].url).searchParams;
    expect(Object.fromEntries(query)).toMatchObject({ subscription_id: 'sub_1', customer_id: 'cus_1', product_id: 'pdt_test', status: 'succeeded', page_number: '1', page_size: '100' });
    expect(Date.parse(query.get('created_at_gte')!)).toBeGreaterThan(Date.now() - 91 * 86400000);
  });
  it.each(['https://portal.dodopayments.com/session', 'https://customer.dodopayments.com/session'])('returns a Dodo-owned portal URL %s', async (link) => {
    const { provider, requests } = harness([{ link }]);
    await expect(provider.portal('cus_1')).resolves.toEqual({ url: link });
    expect(Object.fromEntries(new URL(requests[0].url).searchParams)).toEqual({ return_url: `${config.appUrl}/billing`, send_email: 'false' });
  });
  it.each(['https://dodopayments.com.evil.example/session', 'http://portal.dodopayments.com/session', 'https://user:password@portal.dodopayments.com/session'])('rejects an unsafe portal URL %s', async (link) => {
    const { provider } = harness([{ link }]);
    await expect(provider.portal('cus_1')).rejects.toMatchObject({ code: 'DODO_INVALID_RESPONSE' });
  });
  it('refuses missing signing credentials rather than accepting an unsigned webhook', () => {
    expect(() => new DodoProvider({ ...config, webhookSecret: '' })).toThrow('Payments are not configured.');
  });
  it('reads back cancellation instead of trusting the write result', async () => {
    const { provider, requests } = harness([{ subscription_id: 'sub_1', cancel_at_next_billing_date: true }, { subscription_id: 'sub_1', cancel_at_next_billing_date: false, status: 'active' }]);
    await expect(provider.cancel('sub_1')).rejects.toMatchObject({ code: 'DODO_CANCELLATION_UNCONFIRMED' });
    expect(requests.map((r) => r.method)).toEqual(['PATCH', 'GET']);
  });
});
