"use client";
import { useEffect, useState } from "react";
import { api, ErrorNotice, Icon, Shell } from "@/components/app";
import type { AccessDecision } from "@/lib/contracts";
interface Billing {
  access: AccessDecision;
  paymentsEnabled: boolean;
  checkoutAvailable: boolean;
  testMode: boolean;
  subscription: null | {
    status: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
    testMode: boolean;
  };
}
export default function BillingPage() {
  const [data, setData] = useState<Billing>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  async function load() {
    try {
      setData(await api<Billing>("/api/billing"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    let active = true;
    api<Billing>("/api/billing")
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e: Error) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function action(path: string, redirect = false) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const result = await api<{ url?: string }>(path, "POST");
      if (redirect && result.url) {
        window.location.assign(result.url);
        return;
      }
      await load();
      setStatus(
        path.endsWith("/cancel")
          ? "Renewal has been canceled. Any verified paid access remains until the end of its paid period."
          : "Billing status refreshed. Access changes only after payment is verified.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const sub = data?.subscription;
  const existing =
    sub && !["incomplete_expired", "canceled"].includes(sub.status);
  return (
    <Shell>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ONE PLAN. BOTH PERSPECTIVES.</p>
          <h1>Your subscription</h1>
          <p className="lead">
            Business validation and philosophical reflection, together.
          </p>
        </div>
      </div>
      {error && <ErrorNotice error={error} retry={load} />}
      {!data ? (
        <p role="status">Loading billing…</p>
      ) : (
        <div className="settings-grid">
          <section className="panel">
            <span className="icon-tile blue">
              <Icon name="spark" />
            </span>
            <h2>Devils Advocate</h2>
            <p>
              <strong style={{ fontSize: "2.5rem" }}>₹2,000</strong> / month
            </p>
            <p>One monthly payment. No annual plan.</p>
            <ul>
              <li>
                Challenge business assumptions and explore practical
                experiments.
              </li>
              <li>
                Think through personal decisions using philosophical
                perspectives.
              </li>
              <li>
                Save conversations, review sources and export decision cards.
              </li>
            </ul>
            <p className="fine">
              International checkout can show a local-currency equivalent when
              available. Dodo displays the applicable currency, conversion and
              taxes before payment. Payment methods and recurring payment
              support depend on your country and provider.
            </p>
            {!data.paymentsEnabled && (
              <p className="notice">
                Subscriptions are being prepared. Your current free access
                continues; no payment is required now.
              </p>
            )}
            {data.testMode && data.checkoutAvailable && (
              <p className="notice">
                Test checkout only. No real payment or paid entitlement.
              </p>
            )}
            {data.checkoutAvailable && !existing && (
              <button
                className="primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const result = await api<{ url: string }>(
                      "/api/billing/checkout",
                      "POST",
                      { plan: "monthly" },
                    );
                    window.location.assign(result.url);
                  } catch (e) {
                    setError((e as Error).message);
                    setBusy(false);
                  }
                }}
              >
                {busy
                  ? "Opening checkout…"
                  : data.testMode
                    ? "Open test checkout"
                    : "Subscribe for ₹2,000/month"}
              </button>
            )}
            <p className="fine">
              Subscriptions renew monthly until canceled. Cancel before the next
              renewal to stop future subscription charges. AI responses remain
              subject to fair-use and provider availability.
            </p>
          </section>
          <section className="panel">
            <h2>Your access</h2>
            <p>
              {data.access.reason === "free"
                ? "Free access is currently active."
                : data.access.reason === "trial"
                  ? "Your 24-hour trial is active. No payment details are needed for the trial."
                  : data.access.reason === "paid"
                    ? "Your monthly subscription is active."
                    : "Your trial or subscription is not active. Your saved history remains available."}
            </p>
            {data.access.expiresAt && (
              <p>
                Access until {new Date(data.access.expiresAt).toLocaleString()}
              </p>
            )}
            {sub && (
              <>
                <p>
                  {sub.testMode ? "Test subscription" : "Subscription"}:{" "}
                  {sub.status.replaceAll("_", " ")}
                </p>
                {Date.parse(sub.currentPeriodEnd) > 0 && (
                  <p>
                    Verified paid period ends{" "}
                    {new Date(sub.currentPeriodEnd).toLocaleString()}
                  </p>
                )}
                <p>
                  {sub.cancelAtPeriodEnd
                    ? "Renewal is canceled."
                    : "Monthly renewal is enabled for an active subscription."}
                </p>
              </>
            )}
            {data.checkoutAvailable && (
              <div className="actions">
                <button
                  disabled={busy}
                  onClick={() => void action("/api/billing/refresh")}
                >
                  Refresh payment status
                </button>
                {sub && (
                  <button
                    disabled={busy}
                    onClick={() => void action("/api/billing/portal", true)}
                  >
                    Manage payments & invoices
                  </button>
                )}
                {existing && !sub?.cancelAtPeriodEnd && (
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Cancel the next monthly renewal? Your verified paid period will remain available.",
                        )
                      )
                        void action("/api/billing/cancel");
                    }}
                  >
                    Cancel renewal
                  </button>
                )}
              </div>
            )}
            <p className="fine">
              Returning from checkout does not confirm payment. Refresh to check
              the provider’s verified status.
            </p>
            <p role="status">{status}</p>
          </section>
        </div>
      )}
    </Shell>
  );
}
