# Free public MVP verification — 2026-10-17

App URL: https://devils-advocate-preview-exploitster1.vercel.app
Current UI/auth release candidate: dpl_GwhMc7bKbQedVJ654uWDtRENRxS3, https://devils-fj0jgz2jo-exploitster1.vercel.app (READY; stable alias assigned).

Implemented: Apple-inspired responsive visual system; public landing; Google and email/password signup/signin; email confirmation resend; password recovery/reset; persisted three-step onboarding; free access without invitation or subscription; home starter paths; conversations, source inspection, cards and Markdown export; searchable/filterable history; editable name; dark/light appearance; account deletion; privacy/terms; error/not-found pages and app icon. Billing UI is removed and /billing redirects Home. Payment endpoints remain disabled.

## Verification

- 158 core tests passed; one existing external integration test skipped. Typecheck, production build and lint passed (one pre-existing unused-variable warning in .local/diagnostics/gemini-schema-bounds.ts).
- Browser checks cover public signup, onboarding persistence, password signin, free conversations, sources/cards/downloads, history search, offline/stale drafts, account-dialog focus, mobile layouts, light/dark accessibility and delayed onboarding responses after leaving the page. Final full 12-test run passed.
- Hosted read-only auth preflight observed Google=true, Email=true, Public signup=true, Email confirmation=true. Profile table and app_store RPC verified without reading existing records or creating hosted users.
- Workspace reachability: vercel.com HTTP 200, api.vercel.com HTTP 308, mcp.vercel.com HTTP 401 (reachable; authentication required). Vercel connector authentication works. CLI whoami reports Logged out; deployment uses the authenticated connector without changing credentials.
- Compound Engineering simplification completed with three review lenses. Repeated UI demo-account checks and a duplicate profile lookup were simplified.
- Completed CE code-review receipt: status complete, run_id recovery-20261017, artifact_path /workspace/work/ce-review/current/review.json. Five independent reviewers; performance, maintainability, adversarial and frontend-race lenses completed in the review orchestrator after the native thread limit was reached. No different-provider CLI was available for a cross-model pass. A completed focused deployment-gate delta receipt is stored at /workspace/work/ce-review/current/deployment-gate-delta/review.json; no additional findings. Sole validated finding is fixed; no remaining actionable findings.

## Citation and reliability fixes

A skipped clarification could replace the provider response but leave citations attached to removed text. Reproduced before fixing; response citations now clear on both complete-response replacements. Counterpoint sources remain canonically validated. A regression exercises the real evidence service, decoder, controller and canonical validator.

Invalid generated output can retry once within the existing two-attempt limit, shared timeout, cancellation and separate per-attempt budget reservations. Known costs reconcile even for rejected output; unknown costs retain the full reservation. Invalid output never commits. Tests cover invalid schema, empty reflection fields, invalid citations, exhausted retries, cancellation and budget rejection.

The earlier hosted philosophy failure reported INVALID_MODEL_OUTPUT despite valid JSON. Its precise cause was not established from the earlier schema-only logs. New diagnostics report missing field names and reference-validity flags, never generated or user text. The confirmed citation defect above is independent evidence and should not be presented as proof of that earlier failure's exact cause.

A second auth defect was reproduced and fixed: code exchange could set cookies before profile loading failed, and immutable error redirects then broke cookie attachment. All callback redirects now have mutable headers, private/no-store and Vary:Cookie; the regression preserves the error redirect and session cookies. Onboarding ignores stale async responses after navigation. Browser screenshot paths use Playwright output directories, not workspace-specific absolute paths.

## External verification still required

- Real Google consent/callback with a maintainer-owned Google account. Provider enabled=true alone does not establish correct Google credentials, consent publishing or redirect settings.
- New email signup confirmation and password reset delivery. Custom SMTP cannot be inferred from public auth settings; Supabase default email delivery has recipient/rate restrictions. Confirmation remains enabled.
- Authenticated hosted conversation persistence in a real browser session. Local browser coverage and hosted read-only database checks do not substitute for it.

The workspace network proxy blocks direct access to the app hostname (CONNECT 403); protected connector fetch works. No TLS checks were disabled and no network policy was bypassed. Temporary deployment-access URLs are not published or committed.

## Preservation and release scope

Existing files and API keys were preserved. Commit 0410267 and current HEAD 6410618 are present; f54b0f9 was not found. No reset, history rewrite, remote push, PR or production promotion occurred. The existing production/starter deployment is separate from the stable MVP URL above. Vercel team-only deployment protection was removed after code review, all hosted unit tests, production build and hosted smoke checks passed. The app still enforces its own account authentication and ownership checks.

## Post-deploy monitoring and validation

Owner: app maintainer. During the first 24 hours after opening access, verify Google callback, new-account confirmation, password reset, saved conversation after reload and account deletion with maintainer-owned test accounts. Check Vercel runtime errors for /api/auth/account, /auth/callback and session generation against Supabase Auth logs; inspect Gateway 429s, availability and credit usage. No custom alerting integration is configured.

Expected: unauthenticated private API requests return 401; users see only their own records; free users see no checkout; verified replies/cards remain saved. Preview generation uses a conservative global $0.25/day reservation limit and can stop before billed spend reaches that amount when cost is unknown. The separate manual live Gateway check has a maximum estimated $0.25/run. No automatic credit purchase was enabled.

If owner isolation or unintended data exposure fails, restore Vercel protection and stop release. For repeated provider failure, preserve conversations, pause generation through configuration and investigate availability; do not weaken citation validation or switch to an unreviewed provider. Distinguish 429/budget exhaustion from authentication errors.

## Release gate adjustment

The 2026-10-17 candidate passed live business and philosophy checks, including recovery from a truncated response, but limited-evidence generation hit 429 on both bounded provider attempts (Retry-After 60). This is a known live availability limitation, not a passing AI readiness check.

Deployment now runs read-only authentication preflight, deterministic unit tests and production compilation. The explicit live Gateway command remains available separately with the same budget, strict source validation and failure exit status. This allows reviewed UI/auth fixes to deploy while preserving an honest record that the free AI provider is rate-limited. Do not call the entire app production-ready based on a green build. No provider switch, paid upgrade or automatic purchase was made.

Final hosted verification: stable alias assigned to dpl_GwhMc7bKbQedVJ654uWDtRENRxS3 (READY); / and /signup returned 200 with new UI; /api/health returned 200/configured services; /api/sessions returned 401 without an app session; missing-code /auth/callback returned 303. Vercel project reports ssoProtection.enabled=false. All 158 deterministic tests also passed inside the Vercel build (one external integration skipped). Direct anonymous browser verification remains blocked by workspace proxy policy, so protection removal is confirmed by project configuration, not a bypassed fetch.
