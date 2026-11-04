import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { DodoBilling } from "../src/lib/billing/dodo-service";
import { billingPersistence } from "../src/lib/billing/context";
import { readConfig } from "../src/lib/config";
import { LocalStore } from "../src/lib/store/local";
import { accessDecision } from "../src/lib/auth/access";
import type {
  DodoProvider,
  SDKProduct,
  SDKSubscription,
  SDKPayment,
  SDKWebhookEvent,
} from "../src/lib/billing/dodo-provider";
const cleanups: (() => void)[] = [];
afterEach(() => {
  cleanups.splice(0).forEach((fn) => fn());
});
async function setup() {
  const dir = mkdtempSync(join(tmpdir(), "dodo-billing-"));
  const config = readConfig({
    DEVILS_RUNTIME_MODE: "local",
    DEVILS_LOCAL_AUTH_SECRET: "dev-only-signing-secret-with-over-32-characters",
    DEVILS_SQLITE_PATH: join(dir, "db.sqlite"),
    DEVILS_BILLING_PROVIDER: "dodo",
    DEVILS_DODO_TEST_USER_IDS: "alex",
  });
  const store = new LocalStore(config.sqlitePath);
  cleanups.push(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const user = { id: "alex", email: "alex@example.test" };
  await store.putProfile({
    ...user,
    disabled: false,
    deletionState: "none",
    createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
  });
  const persistence = billingPersistence(config);
  const settings = {
    apiKey: "synthetic-key",
    environment: "test_mode" as "test_mode" | "live_mode",
    productId: "pdt_month",
    webhookSecret: "synthetic-secret",
    appUrl: config.appUrl,
  };
  const product = {
    product_id: "pdt_month",
    business_id: "biz_app",
  } as SDKProduct;
  const sub = {
    subscription_id: "sub_one",
    customer: { customer_id: "cus_alex" },
    metadata: {},
    product_id: "pdt_month",
    quantity: 1,
    trial_period_days: 0,
    payment_frequency_count: 1,
    payment_frequency_interval: "Month",
    status: "active",
    next_billing_date: new Date(Date.now() + 20 * 86400000).toISOString(),
    created_at: new Date().toISOString(),
    cancel_at_next_billing_date: false,
  } as SDKSubscription;
  const payment = {
    payment_id: "pay_one",
    business_id: "biz_app",
    customer: { customer_id: "cus_alex" },
    status: "succeeded",
    total_amount: 200000,
    subscription_ids: ["sub_one"],
    is_update_payment_method: false,
    refunds: [],
    disputes: [],
    service_periods: [
      {
        subscription_id: "sub_one",
        starts_at: new Date(Date.now() - 1000).toISOString(),
        ends_at: new Date(Date.now() + 20 * 86400000).toISOString(),
        proration_factor: "1",
      },
    ],
  } as unknown as SDKPayment;
  const provider = {
    verifyProduct: vi.fn().mockResolvedValue(product),
    customers: vi.fn().mockResolvedValue([]),
    createCustomer: vi.fn().mockResolvedValue({ customer_id: "cus_alex" }),
    createCheckout: vi.fn().mockResolvedValue({
      session_id: "cks_one",
      checkout_url: "https://test.checkout.dodopayments.com/session",
    }),
    getCheckout: vi
      .fn()
      .mockResolvedValue({ id: "cks_one", payment_status: null }),
    subscriptions: vi.fn().mockResolvedValue([]),
    getSubscription: vi.fn().mockImplementation(async () => sub),
    payments: vi.fn().mockResolvedValue([{ payment_id: "pay_one" }]),
    getPayment: vi.fn().mockImplementation(async () => payment),
    portal: vi
      .fn()
      .mockResolvedValue({ url: "https://customer.dodopayments.com/session" }),
    cancel: vi
      .fn()
      .mockImplementation(async () =>
        Object.assign(sub, { cancel_at_next_billing_date: true }),
      ),
    unwrap: vi.fn().mockReturnValue({
      business_id: "biz_app",
      type: "payment.succeeded",
      data: { customer: { customer_id: "cus_alex" } },
    } as unknown as SDKWebhookEvent),
  };
  const service = new DodoBilling({
    config,
    store,
    persistence,
    settings,
    provider: provider as unknown as DodoProvider,
  });
  async function linked() {
    await persistence.save({
      userId: user.id,
      token: "attempt-one",
      plan: "monthly",
      expiresAt: Date.now() + 86400000,
      provider: "dodo",
      environment: settings.environment,
      businessId: "biz_app",
      customerId: "cus_alex",
    });
    provider.subscriptions.mockResolvedValue([{ subscription_id: "sub_one" }]);
  }
  const headers = new Headers({
    "webhook-id": "evt_one",
    "webhook-timestamp": `${Math.floor(Date.now() / 1000)}`,
    "webhook-signature": "verified-at-provider-boundary",
  });
  return {
    config,
    store,
    user,
    persistence,
    settings,
    service,
    provider,
    product,
    sub,
    payment,
    linked,
    headers,
  };
}
describe("Dodo monthly billing and access", () => {
  it("refuses yearly plans and disabled public checkout before any provider write", async () => {
    const x = await setup();
    await expect(x.service.checkout(x.user, "yearly")).rejects.toMatchObject({
      status: 400,
    });
    x.config.dodoTestUserIds = [];
    await expect(x.service.checkout(x.user, "monthly")).rejects.toMatchObject({
      status: 503,
    });
    expect(x.provider.createCustomer).not.toHaveBeenCalled();
  });
  it("creates one server-owned checkout and reuses it without a duplicate charge request", async () => {
    const x = await setup();
    const first = await x.service.checkout(x.user, "monthly");
    expect(await x.service.checkout(x.user, "monthly")).toEqual(first);
    expect(x.provider.createCustomer).toHaveBeenCalledTimes(1);
    expect(x.provider.createCheckout).toHaveBeenCalledTimes(1);
    expect(x.provider.createCheckout.mock.calls[0].slice(0, 2)).toEqual([
      "cus_alex",
      "alex",
    ]);
    expect(await x.store.getSubscription(x.user.id)).toBeNull();
  });
  it("persists an uncertain customer write and does not blindly retry it", async () => {
    const x = await setup();
    x.provider.createCustomer.mockRejectedValue(
      new Error("network outcome unknown"),
    );
    await expect(x.service.checkout(x.user, "monthly")).rejects.toThrow();
    await expect(x.service.checkout(x.user, "monthly")).rejects.toMatchObject({
      status: 503,
    });
    expect(x.provider.createCustomer).toHaveBeenCalledTimes(1);
    expect((await x.persistence.get(x.user.id))?.customerPending).toBe(true);
  });
  it("recovers a customer only using the matching server operation metadata", async () => {
    const x = await setup();
    x.provider.createCustomer.mockRejectedValueOnce(new Error("unknown"));
    await expect(x.service.checkout(x.user, "monthly")).rejects.toThrow();
    const ctx = (await x.persistence.get(x.user.id))!;
    x.provider.customers.mockResolvedValue([
      { customer_id: "cus_alex", metadata: { app_operation_id: ctx.token } },
    ]);
    await x.service.checkout(x.user, "monthly");
    expect(x.provider.createCustomer).toHaveBeenCalledTimes(1);
    expect(x.provider.createCheckout).toHaveBeenCalledTimes(1);
  });
  it("persists an uncertain checkout write and never retries it automatically", async () => {
    const x = await setup();
    x.provider.createCheckout.mockRejectedValue(new Error("unknown"));
    await expect(x.service.checkout(x.user, "monthly")).rejects.toThrow();
    await expect(x.service.checkout(x.user, "monthly")).rejects.toMatchObject({
      status: 503,
    });
    expect(x.provider.createCheckout).toHaveBeenCalledTimes(1);
  });
  it("refuses another checkout when a provider subscription already exists", async () => {
    const x = await setup();
    await x.linked();
    await expect(x.service.checkout(x.user, "monthly")).rejects.toMatchObject({
      status: 409,
    });
    expect(x.provider.createCheckout).not.toHaveBeenCalled();
  });
  it("keeps an existing customer from a different mode intact", async () => {
    const x = await setup();
    await x.linked();
    x.settings.environment = "live_mode";
    x.config.paymentsEnabled = true;
    const ctx = (await x.persistence.get(x.user.id))!;
    ctx.environment = "live_mode";
    await x.persistence.save(ctx);
    x.settings.environment = "test_mode";
    x.config.paymentsEnabled = false;
    await expect(x.service.checkout(x.user, "monthly")).rejects.toMatchObject({
      status: 503,
    });
    expect((await x.persistence.get(x.user.id))?.environment).toBe("live_mode");
    expect(x.provider.createCheckout).not.toHaveBeenCalled();
  });
  it("archives test authority before creating an independent live customer", async () => {
    const x = await setup();
    await x.linked();
    x.settings.environment = "live_mode";
    x.config.paymentsEnabled = true;
    x.provider.subscriptions.mockResolvedValue([]);
    await x.service.checkout(x.user, "monthly");
    const ctx = (await x.persistence.get(x.user.id))!;
    expect(ctx.environment).toBe("live_mode");
    expect(ctx.archivedTestContext).toMatchObject({
      environment: "test_mode",
      customerId: "cus_alex",
    });
    expect(x.provider.createCustomer).toHaveBeenCalledTimes(1);
  });
  it("allows a new month after the prior paid subscription and single-use checkout have ended", async () => {
    const x = await setup();
    await x.service.checkout(x.user, "monthly");
    x.provider.getCheckout.mockResolvedValue({
      id: "cks_one",
      payment_id: "pay_one",
      payment_status: "succeeded",
    });
    x.sub.status = "cancelled";
    x.payment.service_periods[0].ends_at = new Date(
      Date.now() - 1000,
    ).toISOString();
    x.provider.subscriptions.mockResolvedValue([
      { subscription_id: "sub_one" },
    ]);
    await x.service.checkout(x.user, "monthly");
    expect(x.provider.createCheckout).toHaveBeenCalledTimes(2);
  });
  it("grants no entitlement for checkout redirect or unverified local confirmation", async () => {
    const x = await setup();
    x.config.paymentsEnabled = true;
    expect((await accessDecision(x.store, x.user.id, x.config)).allowed).toBe(
      false,
    );
    await expect(x.service.confirmLocal()).rejects.toMatchObject({
      status: 404,
    });
  });
  it("stores verified test periods but never grants live paid access for them", async () => {
    const x = await setup();
    await x.linked();
    await x.service.processDodoWebhook("{}", x.headers);
    const stored = await x.store.getSubscription(x.user.id);
    expect(stored).toMatchObject({
      provider: "dodo",
      environment: "test_mode",
      verifiedPaymentId: "pay_one",
    });
    x.config.paymentsEnabled = true;
    expect((await accessDecision(x.store, x.user.id, x.config)).allowed).toBe(
      false,
    );
  });
  it("deduplicates signed delivery IDs and canonicalizes delayed payloads", async () => {
    const x = await setup();
    await x.linked();
    await x.service.processDodoWebhook("{}", x.headers);
    await x.service.processDodoWebhook("{}", x.headers);
    expect(x.provider.getSubscription).toHaveBeenCalledTimes(1);
    x.sub.status = "past_due";
    x.headers.set("webhook-id", "evt_later");
    await x.service.processDodoWebhook("{}", x.headers);
    expect((await x.store.getSubscription(x.user.id))?.status).toBe("past_due");
  });
  it("rejects a signature before canonical reads or receipt changes", async () => {
    const x = await setup();
    x.provider.unwrap.mockImplementation(() => {
      throw new Error("invalid signature");
    });
    await expect(x.service.processDodoWebhook("{}", x.headers)).rejects.toThrow(
      "invalid",
    );
    expect(x.provider.verifyProduct).not.toHaveBeenCalled();
  });
  it("ignores a signed foreign customer without attaching it by email", async () => {
    const x = await setup();
    x.provider.unwrap.mockReturnValue({
      business_id: "biz_app",
      data: { customer: { customer_id: "foreign" } },
    });
    await x.service.processDodoWebhook("{}", x.headers);
    expect(x.provider.subscriptions).not.toHaveBeenCalled();
    expect(await x.persistence.get(x.user.id)).toBeNull();
  });
  it("rejects a signed event from another business", async () => {
    const x = await setup();
    x.provider.unwrap.mockReturnValue({ business_id: "foreign", data: {} });
    await expect(
      x.service.processDodoWebhook("{}", x.headers),
    ).rejects.toMatchObject({ status: 400 });
  });
  it.each(["customer", "product", "quantity", "trial"])(
    "rejects canonical subscription mismatch: %s",
    async (kind) => {
      const x = await setup();
      await x.linked();
      if (kind === "customer") x.sub.customer.customer_id = "foreign";
      if (kind === "product") x.sub.product_id = "foreign";
      if (kind === "quantity") x.sub.quantity = 2;
      if (kind === "trial") x.sub.trial_period_days = 1;
      await expect(
        x.service.processDodoWebhook("{}", x.headers),
      ).rejects.toMatchObject({ status: 503 });
      expect(await x.store.getSubscription(x.user.id)).toBeNull();
    },
  );
  it.each([
    "zero-amount",
    "refund-summary",
    "no-period",
    "setup",
    "refund",
    "dispute",
    "foreign-customer",
    "future-period",
  ])("does not grant time for invalid payment proof: %s", async (kind) => {
    const x = await setup();
    await x.linked();
    if(kind==="zero-amount")x.payment.total_amount=0;
    if(kind==="refund-summary")x.payment.refund_status="full";
    if (kind === "no-period") x.payment.service_periods = [];
    if (kind === "setup") x.payment.is_update_payment_method = true;
    if (kind === "refund")
      x.payment.refunds = [
        {
          status: "succeeded",
          is_partial: false,
        } as SDKPayment["refunds"][number],
      ];
    if (kind === "dispute")
      x.payment.disputes = [
        { dispute_status: "dispute_lost" } as SDKPayment["disputes"][number],
      ];
    if (kind === "foreign-customer") x.payment.customer.customer_id = "foreign";
    if (kind === "future-period")
      x.payment.service_periods[0].starts_at = new Date(
        Date.now() + 86400000,
      ).toISOString();
    await x.service.processDodoWebhook("{}", x.headers);
    expect(
      (await x.store.getSubscription(x.user.id))?.verifiedPaymentId,
    ).toBeUndefined();
  });
  it("retries a failed canonical fetch without granting stale webhook status", async () => {
    const x = await setup();
    await x.linked();
    x.provider.getSubscription.mockRejectedValueOnce(new Error("unavailable"));
    await expect(
      x.service.processDodoWebhook("{}", x.headers),
    ).rejects.toThrow();
    expect(await x.store.getSubscription(x.user.id)).toBeNull();
    await x.service.processDodoWebhook("{}", x.headers);
    expect((await x.store.getSubscription(x.user.id))?.verifiedPaymentId).toBe(
      "pay_one",
    );
  });
  it("fences both durable checkout context and entitlement after lease reassignment", async () => {
    const x = await setup();
    await x.linked();
    const db = new DatabaseSync(x.config.sqlitePath);
    x.provider.getSubscription.mockImplementationOnce(async () => {
      db.prepare("UPDATE billing_sync_leases SET token=?").run("replacement");
      return x.sub;
    });
    await expect(x.service.processDodoWebhook("{}", x.headers)).rejects.toThrow(
      "lease",
    );
    expect(await x.store.getSubscription(x.user.id)).toBeNull();
    expect(
      (await x.persistence.get(x.user.id))?.subscriptionId,
    ).toBeUndefined();
    db.close();
  });
  it("cancels renewal with readback even when new checkout is disabled", async () => {
    const x = await setup();
    await x.linked();
    x.config.dodoTestUserIds = [];
    await x.service.cancelRenewal(x.user.id);
    expect(x.provider.cancel).toHaveBeenCalledWith("sub_one");
    expect((await x.store.getSubscription(x.user.id))?.cancelAtPeriodEnd).toBe(
      true,
    );
    expect((await x.persistence.get(x.user.id))?.cancelAtPeriodEnd).toBe(true);
  });
  it("keeps account closure pending for an open checkout that cannot be expired", async () => {
    const x = await setup();
    await x.service.checkout(x.user, "monthly");
    await expect(x.service.cancelRenewal(x.user.id)).rejects.toMatchObject({
      status: 503,
    });
  });
  it("expires the cardless trial exactly 24 hours after server profile creation", async () => {
    const x = await setup();
    x.config.paymentsEnabled = true;
    const now = new Date();
    const p = (await x.store.getProfile(x.user.id))!;
    p.createdAt = now.toISOString();
    await x.store.putProfile(p);
    expect(
      await accessDecision(
        x.store,
        x.user.id,
        x.config,
        new Date(now.getTime() + 86399999),
      ),
    ).toMatchObject({ allowed: true, reason: "trial" });
    expect(
      await accessDecision(
        x.store,
        x.user.id,
        x.config,
        new Date(now.getTime() + 86400000),
      ),
    ).toMatchObject({ allowed: false, reason: "expired" });
  });
  it("retains verified paid time after cancellation and always blocks disabled accounts", async () => {
    const x = await setup();
    await x.linked();
    x.settings.environment = "live_mode";
    x.config.paymentsEnabled = true;
    const ctx = (await x.persistence.get(x.user.id))!;
    ctx.environment = "live_mode";
    await x.persistence.save(ctx);
    x.sub.status = "cancelled";
    await x.service.processDodoWebhook("{}", x.headers);
    expect(await accessDecision(x.store, x.user.id, x.config)).toMatchObject({
      allowed: true,
      reason: "paid",
    });
    await x.store.beginAccountDeletion(x.user.id);
    expect(await accessDecision(x.store, x.user.id, x.config)).toMatchObject({
      allowed: false,
      reason: "disabled",
    });
  });
});
