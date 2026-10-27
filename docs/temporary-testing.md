# Temporary testing site and production release

Testing address: https://devils-advocate-preview-exploitster1.vercel.app

The owner selected a temporary site using existing accounts on 23 October 2026. This is a separate website deployment, with the same Supabase accounts and saved data as the main website. It is **not an isolated staging database**. Profile edits, conversation deletion, password changes and account deletion affect the same account. Use your own account and disposable conversations. Do not delete your normal account just to test the delete button.

The main website stays at https://www.devils-advocate.app on its existing deployment until a production release is explicitly requested. Public payments remain disabled. Dodo uses Test Mode, and only the configured test-account UUIDs may create test checkouts.

## One-time return addresses

1. Supabase → Authentication → URL Configuration → Redirect URLs → Add URL:
   `https://devils-advocate-preview-exploitster1.vercel.app/auth/callback`
2. Keep the Site URL at `https://www.devils-advocate.app` and preserve existing redirect entries.
3. Dodo Test Mode → Webhooks → edit the previously configured endpoint URL to:
   `https://devils-advocate-preview-exploitster1.vercel.app/api/billing/dodo/webhook`
4. Keep the existing test webhook signing secret and events. Changing the URL does not mean creating or rotating a key. If Dodo requires a new endpoint instead, its separate secret must be saved privately for Preview; do not silently replace the Production secret.

## What to test

- Open the testing address. Confirm the temporary-site notice and both business validation and philosophical reflection on the homepage.
- Sign in with Google and with email/password. New email accounts still need email confirmation. Verify onboarding and password reset return to the testing address.
- Try both conversation modes. Review sources, generate a decision card, reload, resume from History and export a card. Report provider capacity errors rather than bypassing citation validation.
- Open Billing. Verify ₹2,000/month, no annual plan and an explicit test-checkout label. Your account must match a configured `DEVILS_DODO_TEST_USER_IDS` UUID.
- Use Dodo's official Test Mode payment details. Verify the final amount, international currency conversion where available, consent to monthly renewal, successful return to this testing address and a successful webhook delivery in Dodo.
- Refresh billing and verify a **test** subscription. Try the customer portal, invoice/payment-method controls, cancellation and readback. Test a failed payment, renewal, refund and dispute with Dodo's supported test controls. Open checkouts and unknown provider outcomes are held for reconciliation rather than retried into duplicate subscriptions.

While `DEVILS_PAYMENTS_ENABLED=false`, existing free AI access continues. A test payment does not grant a live paid entitlement. The exact 24-hour cardless trial cutoff and paid entitlement boundaries are covered by automated tests; this temporary site does not turn on the public paywall or alter production trial timestamps just to simulate expiry. For fully separate destructive testing or an enabled trial/paywall rehearsal, provision the isolated staging environment described in [testing-and-production.md](testing-and-production.md).

## After testing: production steps

1. Confirm the test flows and actual product recurrence, INR base price, taxes, supported recurring methods and conversion are correct. Confirm hosted AI availability and a budget/capacity suitable for paying customers.
2. Complete Dodo's merchant approval. Create a **Live Mode** recurring product for INR ₹2,000 every month, with no annual plan and no Dodo-managed trial. The app supplies the cardless trial. Preserve all Test Mode settings separately.
3. Create a Live Mode webhook for `https://www.devils-advocate.app/api/billing/dodo/webhook`. Configure the Live Mode API key, product ID, mode and signing secret privately in Vercel **Production only**. Keep Preview test bindings separate; never change a shared Test/Live secret in place.
4. Stage a reviewed production build with the canonical production origin and production database, keeping public payment collection disabled. Verify authentication, product readiness, signed deliveries, invoices and cancellation through an owner-controlled live rehearsal before opening payments publicly. Any privileged live rehearsal must remain restricted to the verified owner account.
5. Make a reviewed release enabling the one-day trial and paid access. The existing release guard intentionally rejects `DEVILS_PAYMENTS_ENABLED=true` until that activation change is reviewed and verified. Do not bypass the guard by editing dashboard flags alone.
6. Promote the verified production build to the main domain, inspect public/authenticated health and monitor payment/AI errors. Keep the previous deployment available for code rollback. Never reset Git or attempt to roll back customer data automatically.

The repository's automated isolated-staging release workflow remains separate and blocked until a separate Vercel testing project, Supabase testing database and protected GitHub deployment credentials are configured. The temporary rehearsal is explicitly labeled as shared data; it does not pretend those requirements are satisfied.

## Monthly product settings and checkout troubleshooting

In Dodo **Test Mode**, edit the configured product (`pdt_0NqAtRm0gZXBQTwdAy6Br`):

| Setting | Required value |
| --- | --- |
| Type | Recurring subscription |
| Base currency | INR |
| Price shown in dashboard | ₹2,000 (API uses 200000 paise) |
| Payment frequency | Every 1 Month |
| Subscription lifetime / total subscription duration | 20 Year, or 240 Month |
| Discount | 0; no discount codes at checkout |
| Purchasing-power parity | Off |
| Provider trial duration and trial amount | 0 |
| Localized fixed pricing rules | None; use the INR base price and supported currency conversion |

Save changes. A 20-year **lifetime** keeps monthly renewals available; it does not change the **payment frequency**, collect an annual or 20-year charge, or prevent cancellation. The app checks the product again before checkout; no app redeployment is needed for a saved product change. An already-created checkout is not rewritten by changing the product. Do not retry an open or uncertain payment as a new subscription; use Billing refresh/reconciliation.

The updated mismatch message identifies which fields fail the checks, using fixed setting names rather than provider response text. It does not silently modify the merchant product or relax price validation. This workspace has no authenticated Dodo management connection, so dashboard values still require owner verification.

Homepage → Subscribe opens Billing for an existing signed-in account, or sign-in with the billing destination preserved. Google sign-in opens Billing directly; email signup/confirmation from this path also retains the destination. Conversation onboarding is not required to view the plan. Authentication remains required before checkout to bind the purchase to the correct verified account. No card is charged merely by selecting Subscribe or signing in.

Post-deploy verification owner: application owner. During the first testing session after deployment, verify the homepage pricing, Google/email return to Billing, and successful Dodo Test Mode checkout/webhook and cancellation. Inspect sanitized Vercel error codes for `DODO_PRODUCT_MISMATCH`, auth callback errors and unexpected 5xx failures. A product mismatch requires correcting the listed dashboard settings; it is not a reason to disable validation. If a newly introduced redirect loop, missing price or unrelated 5xx regression appears, restore the previous preview alias while preserving accounts and data. Production remains unchanged until a separate verified release.

Subscription intent uses a one-hour, Secure, HttpOnly, SameSite=Lax cookie scoped to `/auth/callback`, consumed and cleared on callback. The provider still receives the exact registered callback URL, with no additional query string requiring a new Supabase allowlist entry. The cookie is only a fixed navigation hint, never proof of payment or identity; normal PKCE/session verification remains required. Email confirmation must complete in the originating browser, as required by the existing PKCE flow. Recovery callbacks always take priority over subscription navigation.
