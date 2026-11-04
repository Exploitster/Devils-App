# Verification record — October 15, 2026

The implemented app uses Gemini rather than OpenAI. Payments are deferred by user direction: `DEVILS_PAYMENTS_ENABLED=false` is the default, Stripe configuration is optional while disabled, and all payment entry points reject requests. The existing marketing website is https://exploitster.github.io/devilsadvocate/; the app links to it. Its repository and waitlist are outside this checkout.

## Observed checks

| Check | Result |
| --- | --- |
| `npm ci --cache /workspace/.npm-cache` | Passed earlier; 399 packages installed from the lockfile. No dependency versions changed in this MVP update |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed without warnings |
| `npm test` | 114 passed; one separate hosted integration test skipped because its two pre-issued user tokens/opt-in flag are absent. The new hosted check below ran independently |
| `npm run evidence:verify` | Nine reviewed records and twelve exact excerpts verified against source/license snapshots |
| `npm run eval` | Thirteen offline fixture contracts passed; no external model calls |
| `npm run test:db` | All three migrations and SQL/RLS checks passed, plus exact generated-bundle setup, repeat run, saved-data preservation, future additive migration, checksum/downgrade rejection and failed-migration rollback |
| `npm run build` | Production Next.js webpack build passed |
| `npm run test:e2e` | Nine real Chromium/HTTP tests passed against a fresh local database |
| `npm run test:supabase -- --sandbox` | Five groups of actual hosted checks passed with two temporary users; cleanup succeeded and no email was sent |
| `npm run eval:live -- --confirm-live` | Blocked: first synthetic scenario failed after two Google `503 UNAVAILABLE` responses; no live quality pass |
| Services configuration parsing | Passed with secure existing Supabase/Gemini bindings and ignored non-secret model/rate settings; payments and beta activation remain false |

Browser checks include both conversation modes, a dedicated pricing flow with editable fictional examples and no automatic send, inspectable source dialogs and focus return, hand-back cards, history/resume, expired access, stale revision and offline draft preservation, deferred payments with a direct rejected checkout request, earlier response persistence after pushback/reload, and account deletion confirmation/cancel. Axe and viewport checks cover public and authenticated mobile screens in light/dark mode. Desktop and mobile screenshots were visually inspected and remain ignored artifacts under `.local/screenshots/`.

## Acceptance evidence and limits

| Brief acceptance criteria | Evidence |
| --- | --- |
| 1: authentication and either mode | Signed local identity and real browser flows pass; two-user hosted password authentication passed. Browser magic-link delivery, refresh and final callback remain unverified |
| 2–5: clarifications, skips/corrections, question, strengths first | Conversation domain tests and both-mode browser flows; live Gemini relevance/quality remains unverified |
| 6–8: grounded sources, exact quotes, no fabricated support | Corpus integrity, claim/citation validation and unsupported-domain tests pass; applicability still needs qualitative review |
| 9–10: pushback and exhaustion | Domain regressions for progression beyond bounded context, exhaustion and stale-evidence removal on correction; real model quality remains unverified |
| 11–12: required cards, persisted/resumed sessions | Domain and browser checks; sequential versions beyond two cards regression passes |
| 13–14: owner isolation and deletion | Local two-user tests, actual PostgreSQL RLS with stub auth, deletion/late-write/HTTP tests and actual hosted two-user isolation, disabled-account reads and synthetic deletion passed. Backups and final hosted auth flow remain unverified |
| 15–16: entitlements and webhook handling | Server access checks and offline signed/idempotent/fenced test integration pass. Payments intentionally disconnected; no Stripe connection or real charge was made |
| 17–18: failures, retries, cancellation, rate/duplicate behavior | Actual engine/store tests and mocked Gemini transport failures, invalid responses, accounting and concurrent submission tests pass |
| 19: safety | Local boundary and Gemini protocol/safety-envelope tests pass; live paraphrase/adversarial evaluation remains required |
| 20–21: browser, mobile, keyboard/dialog accessibility | Nine browser flows and scoped Axe/focus checks pass; this is not a complete manual assistive-technology audit |
| 22: marketing/waitlist preservation | No marketing files were edited. Website HTTP inspection was blocked by the environment proxy; waitlist behavior is unverified |

## Proof-first repairs

The conversation worker reproduced card versions `[1,2,2,2]`, stale database evidence after a food-delivery correction, and questions freezing after the context window. Regression tests passed after the fixes. The Gemini worker observed missing adapter failures before implementing its transport and exercised the real engine with mocked provider responses. Deferred-payment tests failed on the missing server gate before it was added. A PostgreSQL regression showed a disabled account could still read its sessions before migration 003's policy update; it passed after that change. The SQL harness also now waits for the permanent TCP listener, avoiding the image's temporary initialization server.

The MVP update first reproduced generic pricing questions, failure to advance through distinct clarifications, acceptance of empty debate output and duplicate answered questions under new IDs. Further regressions reproduced AI evaluation evidence incorrectly excluded by consumer-food context, a subscription business misrouted into pricing, an obsolete model default and prompt-cost reservation drift. Focused tests passed after each repair. The first browser run caught two test synchronization errors: inspecting a conversation before its fetch finished and clicking a skip control while the prior answer was still saving. Tests now wait for the actual corresponding successful HTTP response/UI completion; all nine passed on rerun.

## Remaining gates

Secure Supabase and Gemini bindings are now available. Actual hosted checks passed on the dedicated development project using only synthetic identities, which were cleaned up. Existing users were untouched. Model fixtures save qualitative review questions and generated examples in `.local/evaluations/latest.json`; mechanical success does not certify model quality.

Actual generation with `gemini-2.5-flash` returned `404 NOT_FOUND`, explaining unavailability to new users and recommending `gemini-3.8-flash`. The default is now 3.8 with compatible low thinking. Repeated real 3.8 requests returned high-demand `503 UNAVAILABLE`; a minimal alternative-model probe also returned 503 and an Interactions API probe timed out. The bounded real-engine evaluation failed after two 503 responses, recorded in ignored `.local/evaluations/live-latest.json`. No successful live response, live card or qualitative pass is claimed. The application does not hide provider failures behind simulated responses.

Ignored `.env.local` now supplies non-secret model and published standard paid-rate estimates (0.75 input / 3.75 output USD per million tokens through December 31, 2026), preserving existing settings and keeping payments disconnected. Secure credentials were not copied into that file. Rates need review for the account and the January 2027 tariff change. Beta activation remains false until invited access is deliberately enabled. No final HTTPS hosting origin has been chosen. No deployment, PR merge, real charge, fine-tuning or production-data mutation occurred.

[Compound Engineering](plugin://compound-engineering@openai-curated-remote) planning and implementation owners were read earlier in this session and its bounded implementation workers produced the conversation, UI and evidence updates. Native code inspection and applied QA fixes are not a completed `ce-code-review` receipt. The finishing `ce-simplify-code` package and `ce-work/references/shipping-workflow.md` reads returned `skill package is not available`; the latest cloud and executor skill catalogs both returned empty. The previously loaded `ce-work/SKILL.md` says: “If the harness does not expose that directory or a required file cannot be read, stop before the action governed by it and report the missing reference instead of approximating the protocol or continuing natively.” Formal simplification, final code review and publishing remain pending. This is a missing skill/reference blocker, not a request to re-enter credentials or reset the environment. Do not mark the autonomous shipping pipeline complete.

The frozen initial plan and original brief remain historical design inputs. The user's October 15 service choices above override their OpenAI and active-billing assumptions. See [setup-guide.md](setup-guide.md) for the next connection steps and [operations.md](operations.md) for release checks.
