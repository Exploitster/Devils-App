# Operating the development app

The application uses a Node 24 server with Supabase persistence in services mode. Static GitHub Pages hosting can serve the existing marketing website, but cannot run the app's private server routes. No deployment has been performed.

## Runtime and costs

Follow [setup-guide.md](setup-guide.md) for connections. Missing required service bindings fail closed; the server never silently falls back to local authentication or deterministic responses. `DEVILS_PAYMENTS_ENABLED=false` is the default and removes the Stripe configuration requirement. Keep beta invitations explicitly enabled and time limited.

The Gemini adapter makes one native `generateContent` request per attempt. The engine owns the deadline and allows at most two attempts for transient failures. `gemini-2.5-flash` is the configured default; thinking is disabled, and any reported thought tokens still count as output. The app passes no tools or explicit cache. Google account terms determine retention and training policies; this code does not guarantee provider retention settings.

Cost in USD is `(inputTokens × inputPrice + outputTokens × outputPrice) / 1,000,000`, where prices are per million tokens. Each provider attempt reserves a conservative input/output amount before calling the provider. Known usage reconciles that reservation; unknown usage keeps the reserve. The global UTC daily breaker defaults to 5,000,000 microdollars ($5). Configure actual prices and the budget deliberately. The reserve estimates serialized prompt size conservatively; it is not a provider invoice reconciliation or a guaranteed exact token count.

User submissions are limited to 10 per minute, one active generation per user, and 12,000 characters per message. Context retains at most 24 messages plus the state and latest card for generation. Complete saved history remains in storage. Failed attempts still consume submission limits. Operation IDs are bound to an input fingerprint and expected revision; identical completed retries reuse the saved result, while changed duplicates fail.

## Storage and privacy

Apply migrations in order in a dedicated development Supabase project. The service role is restricted to server code. Browser-authenticated users can select their own rows through RLS but cannot mutate generated state, invites, subscriptions, or provider receipts. Disabled accounts cannot read private sessions, operations, or usage through direct RLS access. Account profiles remain readable for closure retry.

Conversation deletion cascades private operations and usage. Account closure first disables the account, revokes pending writes, resolves any retained billing authority, removes private records, and removes the authentication identity. Provider failure leaves closure pending and retryable. Pseudonymous accounting/customer links and provider spend remain; backups follow their own retention window. See [privacy.md](privacy.md). Do not log request bodies, cookies, authentication callback codes, source queries containing user content, or raw provider errors. The logging helper allows only explicit fields; Next development request logging is disabled.

## Release checklist

1. Supply Supabase and Gemini bindings securely, then run the live development-project checks in the setup guide. A green health endpoint only proves configuration parsing.
2. Verify two separate users cannot access each other's records through HTTP or Supabase RLS. Verify sign-in, refresh, expiry, sign-out and deletion against hosted Supabase.
3. Review real Gemini outputs using `tests/evaluations/cases.json`, including source applicability, honest exhaustion, corrected positions, crisis paraphrases and qualified advice. Offline fixture contracts do not establish model quality.
4. Run frozen dependency installation, type checking, lint, unit tests, evidence verification, offline evaluation, production build, PostgreSQL checks, and browser tests.
5. Review corpus provenance before expanding it. The six reviewed records have narrow coverage. Unsupported domains must show an explicit evidence limit.
6. Keep payments disconnected until a separate test-mode integration review. Live Stripe keys are refused even when the dormant test integration is enabled.
7. Test backup recovery and deletion retention policies with the eventual hosting providers. Confirm the final HTTPS origin and Supabase callback allowlist before deploying.

For a compatible Node host, run `npm ci`, `npm run build`, then `npm start` with secure services-mode bindings. The host must support persistent server processes, outbound HTTPS to the project's Supabase host and Gemini, and request deadlines long enough for the configured generation timeout. Never run `dev:local` as a production service.
