# Dodo billing verification — 2026-10-21

The implementation prepares one INR ₹2,000 monthly product, a cardless 24-hour trial, hosted Dodo checkout and portal, renewal cancellation, and signed canonical payment reconciliation. Public payment collection remains disabled, including in the release guard. This is not certification of a live merchant account or a completed paid launch.

Validation completed locally:

- 250 unit tests passed; one hosted Supabase sandbox test skipped because its separate sandbox is not configured.
- 12 browser tests passed. Follow-up checks cover the final mobile billing navigation and accessible billing screen. The public signup/sign-in flow also checks that signing in again preserves the original profile creation timestamp.
- TypeScript and production Next.js build passed. Lint has no errors; one existing warning remains in an ignored diagnostic script.
- Real isolated PostgreSQL tests passed, including versioned setup retries, data preservation, RLS, privileged RPC restrictions, stale billing-save refusal and migration rollback.
- Nine reviewed evidence records and twelve exact excerpts verified. Thirteen offline conversation fixture contracts passed. Existing Gemini schema/citation regressions pass; live AI capacity and response quality remain separate hosted checks.

Dodo-specific verification includes genuine official-SDK request construction with synthetic HTTP responses, real Standard Webhooks HMAC verification, strict product/currency/monthly-price validation, bounded pagination, environment isolation, checkout redirect non-authority, duplicate-request prevention, uncertain-write persistence, signature rejection, canonical-event deduplication, full-refund/zero-amount/dispute exclusions, current paid service periods, account-lease fencing, cancellation readback, and retention of billing authority during pending deletion. Test payment records never authorize live paid access. Historical Stripe USD/annual records and code remain for legacy reconciliation and isolated tests; the current public offer has one INR monthly plan.

Manual code inspection resolved these edge cases before checkpointing: test/live deployments share the same account lease; test context is archived when starting live billing; canceled but unexpired paid months block duplicate checkout; completed old sessions allow a new subscription only after prior service periods and renewal authority end; full refund summaries revoke proof even if refund entries were individually partial; account closure discovers subscriptions from both the customer list and completed checkout payment.

Pending merchant/hosted checks:

1. Actual Dodo product price/recurrence/duration and Adaptive Currency setting.
2. Signed webhook secret, migration 004 applied to hosted Supabase, owner-only test account UID.
3. Genuine owner-driven test checkout and international checkout amount, renewal/failure/cancellation/refund/dispute/portal flows, and hosted entitlement reconciliation.
4. Approved Live Mode credentials/product/webhook, real-payment rehearsal and a reviewed activation of paid access.
5. Hosted Google/email browser flow, AI capacity/budget suitable for paying customers, and merchant support/refund disclosures.

The managed workspace currently permits Vercel API access but excludes Dodo API/checkout hosts, custom application domain and deployment hosts from local outbound access. No proxy/network bypass or retrieval of sensitive Vercel keys was used. A deployment's READY state alone cannot establish hosted payment or application health. Do not publish a paid-ready claim based solely on the local test results.

Setup: [Complete owner instructions](dodo-payments-setup.md). Database: [Complete versioned setup](Devils-Advocate-Supabase-Setup.sql). Existing files, commits and API keys are preserved.
