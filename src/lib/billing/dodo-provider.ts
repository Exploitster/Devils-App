import DodoPayments from 'dodopayments';
import type { Product } from 'dodopayments/resources/products/products';
import type { Customer } from 'dodopayments/resources/customers/customers';
import type { CheckoutSessionStatus } from 'dodopayments/resources/checkout-sessions';
import type { Subscription, SubscriptionListResponse } from 'dodopayments/resources/subscriptions';
import type { Payment, PaymentListResponse } from 'dodopayments/resources/payments';
import type { UnwrapWebhookEvent } from 'dodopayments/resources/webhooks/webhooks';
import { AppError } from '@/lib/errors';

export type { Product as SDKProduct, Customer as SDKCustomer, CheckoutSessionStatus as SDKCheckoutSessionStatus, Subscription as SDKSubscription, SubscriptionListResponse as SDKSubscriptionListResponse, Payment as SDKPayment, PaymentListResponse as SDKPaymentListResponse, UnwrapWebhookEvent as SDKWebhookEvent };
export interface DodoProviderConfig {
  apiKey: string;
  environment: 'test_mode' | 'live_mode';
  productId: string;
  webhookSecret: string;
  appUrl: string;
}
type AppUser = { id: string; email: string; name?: string };
const MAX_PAGES = 10;
const PAGE_SIZE = 100;

/** Thin official-SDK boundary. Ownership, durable operations and entitlements live in the billing service. */
export class DodoProvider {
  private readonly client: DodoPayments;
  private readonly config: Readonly<DodoProviderConfig>;
  constructor(config: DodoProviderConfig, fetcher?: typeof fetch) {
    if (!config.apiKey.trim() || !config.productId.trim() || !config.webhookSecret.trim() || !['test_mode', 'live_mode'].includes(config.environment)) {
      throw new AppError('DODO_NOT_CONFIGURED', 'Payments are not configured.', 503);
    }
    let appUrl: URL;
    try { appUrl = new URL(config.appUrl); } catch { throw new AppError('DODO_NOT_CONFIGURED', 'Payments are not configured.', 503); }
    if (!['https:', 'http:'].includes(appUrl.protocol) || appUrl.username || appUrl.password || (appUrl.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(appUrl.hostname))) {
      throw new AppError('DODO_NOT_CONFIGURED', 'Payments are not configured.', 503);
    }
    this.config = Object.freeze({ ...config, appUrl: appUrl.origin });
    this.client = new DodoPayments({ bearerToken: config.apiKey, environment: config.environment, webhookKey: config.webhookSecret, maxRetries: 0, timeout: 8000, ...(fetcher ? { fetch: fetcher } : {}) });
  }

  private async request<T>(operation: () => PromiseLike<T>): Promise<T> {
    try { return await operation(); } catch (error) {
      if (error instanceof AppError) throw error;
      // SDK errors can contain credentials, customer information and provider bodies.
      throw new AppError('DODO_UNAVAILABLE', 'The payment provider is temporarily unavailable. Please try again later.', 503);
    }
  }
  private metadata(userId: string, operationId: string) {
    return { app_user_id: userId, app_environment: this.config.environment, app_operation_id: operationId };
  }
  private invalidResponse(): never {
    throw new AppError('DODO_INVALID_RESPONSE', 'The payment provider returned an unexpected response.', 502);
  }
  private async pages<T>(load: (page: number) => PromiseLike<{ items: T[] }>): Promise<T[]> {
    const result: T[] = [];
    // Match the official SDK's one-based default. A nonempty SDK page always claims another page.
    for (let page = 1; page <= MAX_PAGES; page++) {
      const response = await this.request(() => load(page));
      if (!Array.isArray(response.items)) this.invalidResponse();
      if (response.items.length === 0) return result;
      if (response.items.length > PAGE_SIZE) this.invalidResponse();
      result.push(...response.items);
    }
    throw new AppError('DODO_PAGINATION_LIMIT', 'Your billing history requires support to review safely.', 503);
  }
  async verifyProduct(): Promise<Product> {
    const product = await this.request(() => this.client.products.retrieve(this.config.productId));
    const p = product.price;
    const lifetimeIsOngoing = p.type === 'recurring_price' && ((p.subscription_period_interval === 'Year' && p.subscription_period_count === 20) || (p.subscription_period_interval === 'Month' && p.subscription_period_count === 240));
    if (product.product_id !== this.config.productId || !product.is_recurring || p.type !== 'recurring_price' || p.currency !== 'INR' || p.price !== 200000 || p.payment_frequency_count !== 1 || p.payment_frequency_interval !== 'Month' || !lifetimeIsOngoing || (p.discount ?? 0) !== 0 || (p.discount_bps ?? 0) !== 0 || p.purchasing_power_parity === true || (p.trial_period_days ?? 0) !== 0 || (p.trial_amount ?? 0) !== 0 || product.pricing_mode != null) {
      throw new AppError('DODO_PRODUCT_MISMATCH', 'Configure the Dodo product as INR 2,000 charged every month, with no discounts, purchasing-power pricing or provider trial, and a 20-year subscription lifetime for ongoing monthly renewals. The lifetime is not an annual charge or a commitment to pay for 20 years.', 503);
    }
    return product;
  }
  createCustomer(user: AppUser, attemptId: string): Promise<Customer> {
    return this.request(() => this.client.customers.create({ email: user.email, name: user.name || user.email, metadata: this.metadata(user.id, attemptId) }));
  }
  async customers(user: AppUser): Promise<Customer[]> {
    const customers = await this.pages((page_number) => this.client.customers.list({ email: user.email, page_number, page_size: PAGE_SIZE }));
    return customers.filter((c) => c.email.toLowerCase() === user.email.toLowerCase() && c.metadata?.app_user_id === user.id && c.metadata?.app_environment === this.config.environment);
  }
  async createCheckout(customerId: string, userId: string, attemptId: string): Promise<{ session_id: string; checkout_url: string }> {
    const session = await this.request(() => this.client.checkoutSessions.create({
      product_cart: [{ product_id: this.config.productId, quantity: 1 }],
      customer: { customer_id: customerId }, metadata: this.metadata(userId, attemptId),
      return_url: `${this.config.appUrl}/billing?checkout=returned`, cancel_url: `${this.config.appUrl}/billing?checkout=canceled`,
      subscription_data: { trial_period_days: 0 },
      feature_flags: { allow_currency_selection: true, allow_discount_code: false, allow_customer_editing_email: false, allow_editing_addons: false },
    }));
    let url: URL;
    try { url = new URL(session.checkout_url ?? ''); } catch { return this.invalidResponse(); }
    const host = this.config.environment === 'test_mode' ? 'test.checkout.dodopayments.com' : 'checkout.dodopayments.com';
    if (url.protocol !== 'https:' || url.hostname !== host || url.username || url.password || url.port || !session.session_id) this.invalidResponse();
    return { session_id: session.session_id, checkout_url: url.href };
  }
  getCheckout(id: string): Promise<CheckoutSessionStatus> { return this.request(() => this.client.checkoutSessions.retrieve(id)); }
  getSubscription(id: string): Promise<Subscription> { return this.request(() => this.client.subscriptions.retrieve(id)); }
  /** List objects are discovery hints; retrieve canonically before granting access. */
  subscriptions(customerId: string): Promise<SubscriptionListResponse[]> {
    return this.pages((page_number) => this.client.subscriptions.list({ customer_id: customerId, product_id: this.config.productId, page_number, page_size: PAGE_SIZE }));
  }
  payments(subscriptionId: string, customerId: string): Promise<PaymentListResponse[]> {
    return this.pages((page_number) => this.client.payments.list({ subscription_id: subscriptionId, customer_id: customerId, product_id: this.config.productId, status: 'succeeded', created_at_gte: new Date(Date.now() - 90 * 86400000).toISOString(), page_number, page_size: PAGE_SIZE }));
  }
  getPayment(id: string): Promise<Payment> { return this.request(() => this.client.payments.retrieve(id)); }
  async portal(customerId: string): Promise<{ url: string }> {
    const portal = await this.request(() => this.client.customers.customerPortal.create(customerId, { return_url: `${this.config.appUrl}/billing`, send_email: false }));
    let url: URL;
    try { url = new URL(portal.link); } catch { return this.invalidResponse(); }
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.dodopayments.com') || url.username || url.password || url.port) this.invalidResponse();
    return { url: url.href };
  }
  async cancel(subscriptionId: string): Promise<Subscription> {
    await this.request(() => this.client.subscriptions.update(subscriptionId, { cancel_at_next_billing_date: true }));
    const current = await this.getSubscription(subscriptionId);
    if (current.subscription_id !== subscriptionId || (!current.cancel_at_next_billing_date && !['cancelled', 'expired', 'failed'].includes(current.status))) {
      throw new AppError('DODO_CANCELLATION_UNCONFIRMED', 'Cancellation could not yet be confirmed. Refresh billing before trying again.', 503);
    }
    return current;
  }
  unwrap(rawBody: string, headers: Headers): UnwrapWebhookEvent {
    if (Buffer.byteLength(rawBody, 'utf8') > 256000) throw new AppError('DODO_WEBHOOK_TOO_LARGE', 'The webhook payload is too large.', 413);
    const verifiedHeaders: Record<string, string> = {};
    for (const name of ['webhook-id', 'webhook-timestamp', 'webhook-signature']) {
      const value = headers.get(name);
      if (!value) throw new AppError('DODO_INVALID_WEBHOOK', 'The webhook signature is invalid.', 400);
      verifiedHeaders[name] = value;
    }
    try { return this.client.webhooks.unwrap(rawBody, { headers: verifiedHeaders, key: this.config.webhookSecret }); }
    catch { throw new AppError('DODO_INVALID_WEBHOOK', 'The webhook signature is invalid.', 400); }
  }
}
