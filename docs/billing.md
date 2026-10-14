# Test billing

Billing is test-only. Monthly costs $59 USD; yearly costs $150 USD. Both plans enable the same generation features. A checkout redirect never grants access. Access uses a verified subscription status and an unexpired canonical billing period; beta invites remain independent. Expired users keep history, export, and deletion access.

`createBillingService(request?)` obtains server configuration and the privileged store. Tests may call `createBillingService({config,store,persistence?,stripe?})`. The concrete service implements the existing BillingService contract and adds `confirmLocal(identity,token)`.

Authenticated endpoints attach refreshed auth cookies, including error responses:

- `GET /api/billing`: `{subscription,access,runtimeMode,plans,testMode:true}`.
- `POST /api/billing/checkout`: strict `{plan:"monthly"|"yearly"}` to `{url}`.
- `POST /api/billing/portal`: `{url}` for the authenticated server-linked customer.
- `POST /api/billing/local-confirm`: strict `{token}` to `{confirmed:true,testMode:true,message}`.
- `POST /api/billing/local-cancel`: local runtime only, `{canceled:true,testMode:true}`; access continues through the current period.
- `POST /api/billing/webhook`: raw body, `Stripe-Signature`, 256 KB maximum; this signature endpoint alone omits browser same-origin checks.

Browser mutations require the configured app origin. Local runtime is forbidden in production. Local checkout returns `/billing?testCheckout=<random-owned-token>` and management returns `/billing?manage=local`. The UI must explicitly say this is a simulated subscription and no payment occurred. Only authenticated same-origin confirmation can complete it. Confirmation constructs a real HMAC signature and invokes the same verified webhook processing path. Local simulation has no Stripe network calls or payment fields.

Service runtime requires secure Stripe credentials, raw `whsec_` signing secret, and the two configured price IDs. Opaque platform proxy credentials are permitted; known live key prefixes are rejected. Before every Stripe write workflow, the API balance response must explicitly attest `livemode:false`. Prices must be active test USD recurring prices with quantity one, the advertised amounts, and exactly one month/year interval. Checkout/portal destinations must be HTTPS on the exact Stripe checkout/portal host. Customer ownership comes exclusively from durable server billing context. Neither request metadata nor redirects supply subscription authority.

Apply `001_application.sql`, then `002_billing.sql`. Billing context is server-only, with a stable idempotent customer and one durable pending checkout across both plans. SQLite uses the configured application database; hosted mode uses a service-role-only RPC. The service rejects a second subscription while the stored paid period is active and additionally checks provider subscriptions before creating checkout. Stripe idempotency keys stabilize customer and checkout creation across concurrent requests and retries.

Webhook processing verifies raw-body signatures and a five-minute timestamp window in either direction, rejects live events, and reserves the durable receipt before retrieving canonical subscription state. Event payload status and event ordering do not grant access. Canonical customer, configured price, currency, quantity, billing period, and status are validated. Provider failures mark the receipt failed for retry. Completed receipts acknowledge successfully; processing receipts return retryable 503. Unrecognized signed test events are acknowledged without access changes. The provider must deliver subscription changes and invoice/checkout events to this endpoint.

`npx vitest run tests/billing.test.ts tests/config.test.ts` covers local ownership, redirect non-authority, renewal cancellation, signatures, timestamps, live mode rejection, price verification, canonical state, retry/deduplication, and opaque credentials. Real Stripe integration requires test bindings; no real payment is authorized or exercised.
