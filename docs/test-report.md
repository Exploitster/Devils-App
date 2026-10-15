# Verification record — October 15, 2026

The implemented app uses Gemini rather than OpenAI. Payments are deferred by user direction: `DEVILS_PAYMENTS_ENABLED=false` is the default, Stripe configuration is optional while disabled, and all payment entry points reject requests. The existing marketing website is https://exploitster.github.io/devilsadvocate/; the app links to it. Its repository and waitlist are outside this checkout.

## Observed checks

| Check | Result |
| --- | --- |
| `npm ci --cache /workspace/.npm-cache` | Passed; 399 packages installed from the lockfile |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed without warnings |
| `npm test` | 98 passed; one hosted Supabase integration test skipped because bindings are absent |
| `npm run evidence:verify` | Six reviewed records and seven exact excerpts verified against source/license snapshots |
| `npm run eval` | Seven offline fixture contracts passed; no external model calls |
| `npm run test:db` | All three migrations applied to isolated pinned PostgreSQL; ownership, privileges, RLS, duplicate/revision handling, cancellation, cascades and disabled-account reads passed |
| `npm run build` | Production Next.js webpack build passed |
| `npm run test:e2e` | Eight real Chromium/HTTP tests passed against a fresh local database |

Browser checks include both conversation modes, inspectable source dialogs and focus return, hand-back cards, history/resume, expired access, stale revision and offline draft preservation, deferred payments with a direct rejected checkout request, earlier response persistence after pushback/reload, and account deletion confirmation/cancel. Axe and viewport checks cover public and authenticated mobile screens in light/dark mode. Screenshots are ignored artifacts under `.local/screenshots/`.

## Acceptance evidence and limits

| Brief acceptance criteria | Evidence |
| --- | --- |
| 1: authentication and either mode | Signed local identity and real browser flows pass; hosted Supabase sign-in remains unverified |
| 2–5: clarifications, skips/corrections, question, strengths first | Conversation domain tests and both-mode browser flows; live Gemini relevance/quality remains unverified |
| 6–8: grounded sources, exact quotes, no fabricated support | Corpus integrity, claim/citation validation and unsupported-domain tests pass; applicability still needs qualitative review |
| 9–10: pushback and exhaustion | Domain regressions for progression beyond bounded context, exhaustion and stale-evidence removal on correction; real model quality remains unverified |
| 11–12: required cards, persisted/resumed sessions | Domain and browser checks; sequential versions beyond two cards regression passes |
| 13–14: owner isolation and deletion | Local two-user tests, actual PostgreSQL RLS with stub auth, deletion/late-write and HTTP tests; hosted authentication and backups remain unverified |
| 15–16: entitlements and webhook handling | Server access checks and offline signed/idempotent/fenced test integration pass. Payments intentionally disconnected; no Stripe connection or real charge was made |
| 17–18: failures, retries, cancellation, rate/duplicate behavior | Actual engine/store tests and mocked Gemini transport failures, invalid responses, accounting and concurrent submission tests pass |
| 19: safety | Local boundary and Gemini protocol/safety-envelope tests pass; live paraphrase/adversarial evaluation remains required |
| 20–21: browser, mobile, keyboard/dialog accessibility | Eight browser flows and scoped Axe/focus checks pass; this is not a complete manual assistive-technology audit |
| 22: marketing/waitlist preservation | No marketing files were edited. Website HTTP inspection was blocked by the environment proxy; waitlist behavior is unverified |

## Proof-first repairs

The conversation worker reproduced card versions `[1,2,2,2]`, stale database evidence after a food-delivery correction, and questions freezing after the context window. Regression tests passed after the fixes. The Gemini worker observed missing adapter failures before implementing its transport and exercised the real engine with mocked provider responses. Deferred-payment tests failed on the missing server gate before it was added. A PostgreSQL regression showed a disabled account could still read its sessions before migration 003's policy update; it passed after that change. The SQL harness also now waits for the permanent TCP listener, avoiding the image's temporary initialization server.

## Remaining gates

No real Supabase/Gemini credentials were supplied; no live model call or hosted user-data test was performed. Model fixtures save qualitative review questions and generated examples in `.local/evaluations/latest.json`; mechanical success does not certify model quality. No deployment, PR merge, real charge, or production-data mutation occurred.

Compound Engineering planning and implementation owners were read earlier in this session. Native read-only QA supplied applied fixes; it is not a completed `ce-code-review` receipt. The finishing `ce-simplify-code` package read returned `skill package is not available`. The loaded `ce-work/SKILL.md` says: “If the harness does not expose that directory or a required file cannot be read, stop before the action governed by it and report the missing reference instead of approximating the protocol or continuing natively.” Formal simplification, final code review and publishing remain pending. GitHub API access was also blocked by the environment proxy earlier in the session. Do not mark the autonomous shipping pipeline complete.

The frozen initial plan and original brief remain historical design inputs. The user's October 15 service choices above override their OpenAI and active-billing assumptions. See [setup-guide.md](setup-guide.md) for the next connection steps and [operations.md](operations.md) for release checks.
