import { randomUUID } from "node:crypto";
import type {
  BillingService,
  Identity,
  Store,
  Subscription,
} from "../contracts";
import type { RuntimeConfig } from "../config";
import { AppError } from "../errors";
import {
  billingPersistence,
  type BillingContext,
  type BillingPersistence,
} from "./context";
import { dodoConfig } from "./dodo-config";
import {
  DodoProvider,
  type DodoProviderConfig,
  type SDKSubscription,
  type SDKPayment,
} from "./dodo-provider";
type Provider = Pick<
  DodoProvider,
  | "verifyProduct"
  | "customers"
  | "createCustomer"
  | "createCheckout"
  | "getCheckout"
  | "getSubscription"
  | "subscriptions"
  | "payments"
  | "getPayment"
  | "portal"
  | "cancel"
  | "unwrap"
>;
type Guard = { key: string; token: string };
const unavailable = (
  message = "Billing needs reconciliation. Please contact support before starting another payment.",
) => new AppError("DODO_RECONCILIATION_REQUIRED", message, 503);
const terminal = (status: string) =>
  ["cancelled", "expired", "failed"].includes(status);
export class DodoBilling implements BillingService {
  private readonly store: Store;
  private readonly config: RuntimeConfig;
  private _persistence?: BillingPersistence;
  private _provider?: Provider;
  private _settings?: DodoProviderConfig;
  constructor(options: {
    config: RuntimeConfig;
    store: Store;
    persistence?: BillingPersistence;
    provider?: Provider;
    settings?: DodoProviderConfig;
  }) {
    this.store = options.store;
    this.config = options.config;
    this._persistence = options.persistence;
    this._provider = options.provider;
    this._settings = options.settings;
  }
  private get settings() {
    return (this._settings ??= dodoConfig(this.config));
  }
  private get provider() {
    return (this._provider ??= new DodoProvider(this.settings));
  }
  private get persistence() {
    return (this._persistence ??= billingPersistence(this.config));
  }
  private enabled(userId: string) {
    if (
      !this.config.paymentsEnabled &&
      !(
        this.settings.environment === "test_mode" &&
        this.config.dodoTestUserIds?.includes(userId)
      )
    )
      throw new AppError(
        "PAYMENTS_DISABLED",
        "Payments are not available yet. Your current access is unchanged.",
        503,
      );
  }
  private async owned(userId: string, deleting = false) {
    const p = await this.store.getProfile(userId);
    if (!p || (p.disabled && !(deleting && p.deletionState === "pending")))
      throw new AppError("FORBIDDEN", "Billing account is unavailable.", 403);
    return p;
  }
  private async lease(userId: string) {
    const guard = {
      key: `account:${userId}`,
      token: randomUUID(),
    };
    if (
      !(await this.persistence.acquireSync(
        guard.key,
        guard.token,
        Date.now() + 300000,
      ))
    )
      throw new AppError(
        "BILLING_SYNC_PENDING",
        "A billing update is in progress. Please refresh shortly.",
        503,
        5,
      );
    return guard;
  }
  private async save(ctx: BillingContext, guard: Guard) {
    if (!this.persistence.saveGuarded)
      throw unavailable("The billing database update is required.");
    await this.persistence.saveGuarded(ctx, guard);
  }
  private checkContext(ctx: BillingContext) {
    if (
      ctx.provider !== "dodo" ||
      ctx.environment !== this.settings.environment
    )
      throw unavailable(
        "Existing billing belongs to a different payment environment and must be retained for reconciliation.",
      );
  }
  private validateSub(sub: SDKSubscription, ctx: BillingContext) {
    if (
      sub.customer.customer_id !== ctx.customerId ||
      sub.product_id !== this.settings.productId ||
      sub.quantity !== 1 ||
      sub.trial_period_days !== 0 ||
      sub.payment_frequency_count !== 1 ||
      sub.payment_frequency_interval !== "Month"
    )
      throw unavailable(
        "The subscription does not match this account and monthly plan.",
      );
  }
  async checkout(user: Identity, plan: "monthly" | "yearly") {
    this.enabled(user.id);
    if (plan !== "monthly")
      throw new AppError(
        "INVALID_PLAN",
        "Only the INR 2,000 monthly plan is available.",
        400,
      );
    const guard = await this.lease(user.id);
    try {
      await this.owned(user.id);
      const product = await this.provider.verifyProduct();
      let ctx = await this.persistence.get(user.id);
      if (
        ctx?.provider === "dodo" &&
        ctx.environment === "test_mode" &&
        this.settings.environment === "live_mode"
      ) {
        ctx = {
          provider: "dodo",
          environment: "live_mode",
          businessId: product.business_id,
          userId: user.id,
          plan: "monthly",
          token: randomUUID(),
          expiresAt: Date.now() + 86400000,
          archivedTestContext: ctx,
        };
        await this.save(ctx, guard);
      }
      if (ctx) {
        this.checkContext(ctx);
        if (ctx.businessId !== product.business_id) throw unavailable();
      } else {
        ctx = {
          provider: "dodo",
          environment: this.settings.environment,
          businessId: product.business_id,
          userId: user.id,
          plan: "monthly",
          token: randomUUID(),
          expiresAt: Date.now() + 86400000,
        };
        await this.save(ctx, guard);
      }
      if (!ctx.customerId) {
        if (ctx.customerPending) {
          const matches = (await this.provider.customers(user)).filter(
            (c) => c.metadata?.app_operation_id === ctx!.token,
          );
          if (matches.length !== 1)
            throw unavailable(
              "A customer setup is awaiting confirmation. Do not start another payment.",
            );
          ctx.customerId = matches[0].customer_id;
          ctx.customerPending = false;
          await this.save(ctx, guard);
        } else {
          ctx.customerPending = true;
          await this.save(ctx, guard);
          const customer = await this.provider.createCustomer(user, ctx.token);
          ctx.customerId = customer.customer_id;
          ctx.customerPending = false;
          await this.save(ctx, guard);
        }
      }
      const stored = await this.store.getSubscription(user.id);
      if (
        stored?.provider === "dodo" &&
        stored.environment === this.settings.environment &&
        stored.verifiedPaymentId &&
        Date.parse(stored.currentPeriodEnd) > Date.now()
      )
        throw new AppError(
          "ALREADY_SUBSCRIBED",
          "Your paid month is still available. Manage your existing subscription.",
          409,
        );
      // Discover every subscription before creating a new chargeable checkout.
      const subscriptions = await this.provider.subscriptions(ctx.customerId);
      for (const row of subscriptions) {
        const sub = await this.provider.getSubscription(row.subscription_id);
        this.validateSub(sub, ctx);
        if (!terminal(sub.status))
          throw new AppError(
            "ALREADY_SUBSCRIBED",
            "Manage your existing subscription instead of starting another one.",
            409,
          );
      }
      if (ctx.checkoutPending)
        throw unavailable(
          "A checkout request is awaiting confirmation. Do not retry payment.",
        );
      if (ctx.checkoutSessionId) {
        const status = await this.provider.getCheckout(ctx.checkoutSessionId);
        if (status.id !== ctx.checkoutSessionId) throw unavailable();
        if (status.payment_status === "processing")
          throw unavailable(
            "Your payment is still processing. Refresh billing shortly.",
          );
        if (status.payment_id) {
          const payment = await this.provider.getPayment(status.payment_id);
          if (
            payment.payment_id !== status.payment_id ||
            payment.business_id !== ctx.businessId ||
            payment.customer.customer_id !== ctx.customerId
          )
            throw unavailable();
          if (
            !["succeeded", "failed", "cancelled"].includes(payment.status ?? "")
          )
            throw unavailable("Your payment is still being reconciled.");
          if (
            payment.status === "succeeded" &&
            (!payment.subscription_ids.length ||
              payment.service_periods.some(
                (p) => Date.parse(p.ends_at) > Date.now(),
              ))
          )
            throw new AppError(
              "ALREADY_SUBSCRIBED",
              "Your paid month is still available. Refresh billing or manage the existing subscription.",
              409,
            );
          // The single-use session has reached a terminal payment outcome. Subscription
          // discovery above has already ruled out any remaining renewal authority.
        } else {
          if (status.payment_status === "succeeded") throw unavailable();
          if ((ctx.checkoutCreatedAt ?? Date.now()) + 86400000 > Date.now()) {
            if (!ctx.checkoutUrl) throw unavailable();
            return { url: ctx.checkoutUrl };
          }
        }
      }
      ctx.token = randomUUID();
      ctx.checkoutPending = true;
      ctx.checkoutSessionId = undefined;
      ctx.checkoutUrl = undefined;
      ctx.checkoutCreatedAt = Date.now();
      await this.save(ctx, guard);
      await this.owned(user.id);
      const checkout = await this.provider.createCheckout(
        ctx.customerId,
        user.id,
        ctx.token,
      );
      ctx.checkoutSessionId = checkout.session_id;
      ctx.checkoutUrl = checkout.checkout_url;
      ctx.checkoutPending = false;
      await this.save(ctx, guard);
      await this.owned(user.id);
      return { url: checkout.checkout_url };
    } finally {
      await this.persistence.releaseSync(guard.key, guard.token);
    }
  }
  async portal(user: Identity) {
    this.enabled(user.id);
    await this.owned(user.id);
    const ctx = await this.persistence.get(user.id);
    if (!ctx?.customerId)
      throw new AppError(
        "NO_SUBSCRIPTION",
        "You do not have a billing account yet.",
        404,
      );
    this.checkContext(ctx);
    await this.provider.verifyProduct();
    return this.provider.portal(ctx.customerId);
  }
  async confirmLocal(): Promise<void> {
    throw new AppError(
      "NOT_FOUND",
      "Local payment confirmation is unavailable for Dodo.",
      404,
    );
  }
  async processWebhook(): Promise<void> {
    throw new AppError(
      "INVALID_SIGNATURE",
      "Use the signed Dodo webhook endpoint.",
      400,
    );
  }
  private validPayment(
    payment: SDKPayment,
    ctx: BillingContext,
    sub: SDKSubscription,
    now: number,
  ) {
    if (
      payment.business_id !== ctx.businessId ||
      payment.customer.customer_id !== ctx.customerId ||
      payment.status !== "succeeded" ||
      payment.is_update_payment_method ||
      !Number.isSafeInteger(payment.total_amount) || payment.total_amount<=0 ||
      !payment.subscription_ids.includes(sub.subscription_id)
    )
      return null;
    if (
      payment.refund_status === "full" ||
      payment.refunds.some((r) => r.status === "succeeded" && !r.is_partial) ||
      payment.disputes.some(
        (d) => !["dispute_won", "dispute_cancelled"].includes(d.dispute_status),
      )
    )
      return null;
    const periods = payment.service_periods.filter(
      (p) =>
        p.subscription_id === sub.subscription_id &&
        Date.parse(p.starts_at) <= now &&
        Date.parse(p.ends_at) > now,
    );
    const end = Math.min(
      Math.max(...periods.map((p) => Date.parse(p.ends_at))),
      Date.parse(sub.next_billing_date),
    );
    return Number.isFinite(end) && end > now ? end : null;
  }
  private async canonical(ctx: BillingContext): Promise<Subscription | null> {
    const product = await this.provider.verifyProduct();
    if (product.business_id !== ctx.businessId || !ctx.customerId)
      throw unavailable();
    const rows = await this.provider.subscriptions(ctx.customerId);
    const subs: SDKSubscription[] = [];
    for (const row of rows) {
      const sub = await this.provider.getSubscription(row.subscription_id);
      this.validateSub(sub, ctx);
      subs.push(sub);
    }
    const current = subs.filter((s) => !terminal(s.status));
    if (current.length > 1)
      throw unavailable(
        "Multiple subscriptions require support to review safely.",
      );
    const sub =
      current[0] ??
      subs.find((s) => s.subscription_id === ctx.subscriptionId) ??
      subs.sort(
        (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
      )[0];
    if (!sub) {
      if (await this.store.getSubscription(ctx.userId))
        throw unavailable(
          "An existing subscription is missing from the provider response.",
        );
      return null;
    }
    const now = Date.now();
    let proof: { id: string; end: number } | undefined;
    for (const row of await this.provider.payments(
      sub.subscription_id,
      ctx.customerId,
    )) {
      const payment = await this.provider.getPayment(row.payment_id);
      if (payment.payment_id !== row.payment_id) throw unavailable();
      const end = this.validPayment(payment, ctx, sub, now);
      if (end && (!proof || end > proof.end))
        proof = { id: payment.payment_id, end };
    }
    return {
      provider: "dodo",
      environment: this.settings.environment,
      userId: ctx.userId,
      customerId: ctx.customerId,
      subscriptionId: sub.subscription_id,
      priceId: this.settings.productId,
      status:
        sub.status === "active"
          ? "active"
          : sub.status === "cancelled"
            ? "canceled"
            : sub.status === "past_due"
              ? "past_due"
              : sub.status === "paused"
                ? "paused"
                : sub.status === "expired"
                  ? "incomplete_expired"
                  : "unpaid",
      currentPeriodEnd: new Date(proof?.end ?? 0).toISOString(),
      verifiedPaymentId: proof?.id,
      cancelAtPeriodEnd: sub.cancel_at_next_billing_date,
      updatedAt: new Date().toISOString(),
    };
  }
  async sync(user: Identity) {
    this.enabled(user.id);
    await this.owned(user.id);
    const ctx = await this.persistence.get(user.id);
    if (!ctx?.customerId) return;
    this.checkContext(ctx);
    await this.commitCanonical(
      ctx,
      `dodo-sync:${this.settings.environment}:${randomUUID()}`,
    );
  }
  private async commitCanonical(initial: BillingContext, eventId: string) {
    const guard = await this.lease(initial.userId);
    try {
      await this.persistCanonical(initial, eventId, guard);
    } finally {
      await this.persistence.releaseSync(guard.key, guard.token);
    }
  }
  private async persistCanonical(
    initial: BillingContext,
    eventId: string,
    guard: Guard,
  ) {
    let begun = false;
    try {
      const now = new Date();
      const result = await this.store.beginWebhook(
        eventId,
        now.toISOString(),
        new Date(now.getTime() + 300000).toISOString(),
      );
      if (result === "duplicate") return;
      if (result === "pending")
        throw unavailable("The payment update is already processing.");
      begun = true;
      const ctx = await this.persistence.get(initial.userId);
      if (!ctx || ctx.customerId !== initial.customerId) throw unavailable();
      this.checkContext(ctx);
      const subscription = await this.canonical(ctx);
      if (subscription) {
        ctx.subscriptionId = subscription.subscriptionId;
        await this.save(ctx, guard);
      }
      await this.store.completeWebhook(eventId, subscription, {
        customerId: guard.key,
        token: guard.token,
      });
    } catch (error) {
      if (begun) await this.store.failWebhook(eventId);
      throw error;
    }
  }
  async processDodoWebhook(raw: string, headers: Headers) {
    const event = this.provider.unwrap(raw, headers);
    const product = await this.provider.verifyProduct();
    if (event.business_id !== product.business_id)
      throw new AppError(
        "DODO_WRONG_BUSINESS",
        "Invalid payment business.",
        400,
      );
    // Signed event data only locates an existing server-owned customer. It never grants access.
    const data = event.data as unknown as {
      customer?: { customer_id: string };
      payment_id?: string;
    };
    let customerId = data.customer?.customer_id;
    if (!customerId && data.payment_id) {
      const payment = await this.provider.getPayment(data.payment_id);
      if (payment.business_id !== product.business_id) throw unavailable();
      customerId = payment.customer.customer_id;
    }
    const ctx = customerId
      ? await this.persistence.findCustomer(customerId)
      : null;
    if (!ctx) return;
    this.checkContext(ctx);
    if (ctx.businessId !== event.business_id) throw unavailable();
    await this.commitCanonical(
      ctx,
      `dodo:${this.settings.environment}:${headers.get("webhook-id")!}`,
    );
  }
  async cancelRenewal(userId: string) {
    await this.owned(userId, true);
    const initial = await this.persistence.get(userId);
    const stored = await this.store.getSubscription(userId);
    if (!initial) {
      if (stored) throw unavailable();
      return;
    }
    this.checkContext(initial);
    const guard = await this.lease(userId);
    try {
      const ctx = await this.persistence.get(userId);
      if (!ctx) throw unavailable();
      this.checkContext(ctx);
      await this.provider.verifyProduct();
      if (ctx.customerPending || ctx.checkoutPending)
        throw unavailable(
          "An uncertain payment request must be resolved before account closure.",
        );
      const ids = new Set<string>();
      if (ctx.subscriptionId) ids.add(ctx.subscriptionId);
      if (ctx.checkoutSessionId) {
        const checkout = await this.provider.getCheckout(ctx.checkoutSessionId);
        if (checkout.id !== ctx.checkoutSessionId) throw unavailable();
        if (
          checkout.payment_status === "processing" ||
          (!checkout.payment_id &&
            (ctx.checkoutCreatedAt ?? Date.now()) + 86400000 > Date.now())
        )
          throw unavailable(
            "An open checkout must expire or complete before account closure. You can cancel an existing subscription from billing.",
          );
        if (checkout.payment_id) {
          const payment = await this.provider.getPayment(checkout.payment_id);
          if (
            payment.business_id !== ctx.businessId ||
            payment.customer.customer_id !== ctx.customerId ||
            !["succeeded", "failed", "cancelled"].includes(payment.status ?? "")
          )
            throw unavailable();
          for (const id of payment.subscription_ids) ids.add(id);
          if (
            payment.status === "succeeded" &&
            !payment.subscription_ids.length
          )
            throw unavailable();
        }
      }
      if (ctx.customerId) {
        for (const row of await this.provider.subscriptions(ctx.customerId))
          ids.add(row.subscription_id);
        for (const id of ids) {
          let sub = await this.provider.getSubscription(id);
          this.validateSub(sub, ctx);
          if (!terminal(sub.status) && !sub.cancel_at_next_billing_date)
            sub = await this.provider.cancel(sub.subscription_id);
          this.validateSub(sub, ctx);
          if (!terminal(sub.status) && !sub.cancel_at_next_billing_date)
            throw unavailable();
        }
      }
      ctx.cancelAtPeriodEnd = true;
      await this.save(ctx, guard);
      if (ctx.customerId)
        await this.persistCanonical(
          ctx,
          `dodo-cancel:${this.settings.environment}:${randomUUID()}`,
          guard,
        );
    } finally {
      await this.persistence.releaseSync(guard.key, guard.token);
    }
  }
}
