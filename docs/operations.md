# Operating the development app

The application uses a Node 24 server with Supabase persistence in services mode.
The live app is https://www.devils-advocate.app. Follow
[testing and production](testing-and-production.md) for the current deployment
process and setup blockers. The historical service-check details below do not
authorize publishing directly to production or testing against its database.
Static GitHub Pages hosting cannot run the app's private server routes.

## Runtime and costs

Follow [setup-guide.md](setup-guide.md) for connections. Missing required service bindings fail closed; the server never silently falls back to local authentication or deterministic responses. `DEVILS_PAYMENTS_ENABLED=false` is the default and removes the Stripe configuration requirement. Keep beta invitations explicitly enabled and time limited.

The Gemini adapter makes one native `generateContent` request per attempt. The engine owns the deadline and allows at most two attempts for transient failures. `gemini-3.8-flash` is the configured default, with low thinking; reported thought tokens count as output. The previous 2.5 model returned a retirement/unavailability error for this account. A healthy model metadata endpoint does not prove generation works: 3.8 generation returned repeated high-demand 503 errors during October 15 verification. The app passes no tools or explicit cache and never substitutes local fixtures for failed live requests. Google account terms determine retention and training policies; this code does not guarantee provider retention settings.

Cost in USD is `(inputTokens × inputPrice + outputTokens × outputPrice) / 1,000,000`, where prices are per million tokens. Each provider attempt reserves a conservative input/output amount before calling the provider. Known usage reconciles that reservation; unknown usage keeps the reserve. The global UTC daily breaker defaults to 5,000,000 microdollars ($5). Configure actual prices and the budget deliberately. The reserve estimates serialized prompt size conservatively; it is not a provider invoice reconciliation or a guaranteed exact token count.

User submissions are limited to 10 per minute, one active generation per user, and 12,000 characters per message. Context retains at most 24 messages plus the state and latest card for generation. Complete saved history remains in storage. Failed attempts still consume submission limits. Operation IDs are bound to an input fingerprint and expected revision; identical completed retries reuse the saved result, while changed duplicates fail.

## Studio transcription

Each recording is one Gemini `generateContent` request with the audio sent inline, made with `DEVILS_GEMINI_API_KEY` and `DEVILS_TRANSCRIPTION_MODEL` whatever the chat provider is. Files are capped at 50 MB. Before the call, the spend breaker reserves the most the recording can cost: its audio tokens estimated at the slowest likely bitrate (16 kbps, 32 audio tokens a second) times `DEVILS_TRANSCRIPTION_INPUT_USD_PER_MILLION`, plus the output cap of 32,768 tokens (about an hour of speech) times `DEVILS_TRANSCRIPTION_OUTPUT_USD_PER_MILLION`. Gemini's reported usage then reconciles the reservation with the same two prices. Transcription counts against the same daily budget as chat.

The processing request may run for 300 seconds, and the Gemini call has its own 240-second deadline inside that. A timeout, or a transcript that hits the output cap, fails the item with "Recording too long: split it into shorter parts". A failed item shows its reason and can be retried. An item left processing for more than 10 minutes, for example by a killed function, can be processed again. A PDF without a text layer, such as a scan, fails with "This PDF has no text layer"; there is no OCR.

## Owner guidance in case prep

Every case-prep turn and assessment searches the approved library by keyword. No AI call and no owner key is involved, so it works the same for every provider. A turn matches on the person's latest answer, cut at 2,000 characters, and takes the best 3 passages. An assessment matches on all of the person's answers, cut at 4,000 characters, and takes the best 5. The current area's name and what it must establish, plus the conversation's title and topic, only reorder passages the answer already matched, so generic area words never pull a passage in alone. A skip or a pushback has no answer to match, so it carries no guidance, and a safety reply makes no search.

The search is capped at 1.5 seconds. An error or a timeout logs `knowledge_search_failed` and the turn goes ahead without guidance. Before migration 005 is applied, the search fails the same way and case prep uses the built-in question sets. Up to about 1,500 words of guidance can be added to a request. The spend reservation already prices the full serialised request, so it covers them.

After the provider replies, the reply and every assessment text field are compared with the passages sent. A run of 12 or more consecutive words matching a passage discards the reply, logs `knowledge_echo_blocked` with the conversation ID only, and writes it again once without guidance under a new spend reservation. Both attempts count toward spend.

## Case-prep return rate

The headline measure for case prep is how many people who complete a case start another within 30 days. Run `npm run report:return-rate` with `DEVILS_SUPABASE_URL` and `DEVILS_SUPABASE_SERVICE_ROLE_KEY` set (production), or with `DEVILS_RUNTIME_MODE=local` against the local SQLite file. The report only reads saved conversations. A completion is the first full assessment of a case; conversations and accounts that were deleted are not counted.

## Storage and privacy

Apply migrations in order in a dedicated development Supabase project. The service role is restricted to server code. Browser-authenticated users can select their own rows through RLS but cannot mutate generated state, invites, subscriptions, or provider receipts. Disabled accounts cannot read private sessions, operations, or usage through direct RLS access. Account profiles remain readable for closure retry.

Conversation deletion cascades private operations and usage. Account closure first disables the account, revokes pending writes, resolves any retained billing authority, removes private records, and removes the authentication identity. Provider failure leaves closure pending and retryable. Pseudonymous accounting/customer links and provider spend remain; backups follow their own retention window. See [privacy.md](privacy.md). Do not log request bodies, cookies, authentication callback codes, source queries containing user content, or raw provider errors. The logging helper allows only explicit fields; Next development request logging is disabled.

## Release checklist

1. Supply Supabase and Gemini bindings securely, then run the live development-project checks in the setup guide. A green health endpoint only proves configuration parsing.
2. Verify two separate users cannot access each other's records through HTTP or Supabase RLS. Verify sign-in, refresh, expiry, sign-out and deletion against hosted Supabase.
3. Review real Gemini outputs using `tests/evaluations/cases.json`, including source applicability, honest exhaustion, corrected positions, crisis paraphrases and qualified advice. Offline fixture contracts do not establish model quality.
4. Run frozen dependency installation, type checking, lint, unit tests, evidence verification, offline evaluation, production build, PostgreSQL checks, and browser tests.
5. Review corpus provenance before expanding it. The nine reviewed records have narrow coverage, including AI evaluation methodology rather than consumer-product efficacy or market-demand data. Unsupported domains must show an explicit evidence limit.
6. Keep payments disconnected until a separate test-mode integration review. Live Stripe keys are refused even when the dormant test integration is enabled.
7. Test backup recovery and deletion retention policies with the eventual hosting providers. Confirm the final HTTPS origin and Supabase callback allowlist before deploying.

For a compatible Node host, run `npm ci`, `npm run build`, then `npm start` with secure services-mode bindings. The host must support persistent server processes, outbound HTTPS to the project's Supabase host and Gemini, and request deadlines long enough for the configured generation timeout. Never run `dev:local` as a production service.
