# Integrations map

Every external service the app uses, where it is wired in, which settings it
reads, and what the owner still has to do in a dashboard. Secrets live only in
Vercel/GitHub environment settings — never in Git, chat or `NEXT_PUBLIC_` names.

```
Browser ──► www.devils-advocate.app (DNS) ──► Vercel project devils-app (Next.js 16)
                                               │
   public pages only, after opt-in:            ├─► Supabase  (auth + Postgres/RLS)
   ├─► Microsoft Clarity (masked replay)       │      └─► Google OAuth (via Supabase)
   └─► PostHog (anonymous events)              ├─► AI: Vercel AI Gateway | Gemini | OpenRouter
                                               └─► Dodo Payments (disabled; test mode)
GitHub Actions: ci.yml (checks) ─► release.yml (staging → approved production)
```

| Service | Purpose | Settings (env) | Code | Owner guide | Status |
| --- | --- | --- | --- | --- | --- |
| **Vercel** | Hosting, builds, AI Gateway OIDC | `DEVILS_APP_URL`, `DEVILS_DEPLOYMENT_ENV`; GitHub secret `VERCEL_TOKEN`, variable `VERCEL_STAGING_PROJECT_ID` | `vercel.json`, `.github/workflows/release.yml`, `scripts/verify-release-environment.mjs`, `scripts/smoke-deployment.mjs` | [testing-and-production](testing-and-production.md) | Live. Git auto-publish paused. Testing project not created. |
| **Supabase** | Accounts, sessions, private storage, RLS | `DEVILS_SUPABASE_URL`, `DEVILS_SUPABASE_ANON_KEY`, `DEVILS_SUPABASE_SERVICE_ROLE_KEY` | `src/lib/auth/supabase.ts`, `src/lib/store/supabase.ts`, `supabase/migrations/001–004` | [setup-guide](setup-guide.md), [database-setup-review](database-setup-review.md) | Production project live. Migration 004 (Dodo) pending. Separate testing project not created. |
| **Google Cloud (OAuth)** | "Continue with Google" | Configured inside Supabase → Auth → Google (client ID/secret) | `src/lib/auth/supabase.ts`, `src/app/auth/callback/route.ts` | [public-auth-setup](public-auth-setup.md) | Configured. Hosted browser flow still to verify. |
| **Google Gemini API** | AI responses (direct provider) | `DEVILS_MODEL_PROVIDER=gemini`, `DEVILS_GEMINI_API_KEY`, `DEVILS_MODEL`, `DEVILS_MODEL_*_USD_PER_MILLION` | `src/lib/model/gemini.ts` | [setup-guide](setup-guide.md) §3 | Supported; kept for rollback. |
| **Vercel AI Gateway** | AI responses (the testing setup's provider) | `DEVILS_MODEL_PROVIDER=gateway`, `DEVILS_GATEWAY_MODEL`; OIDC on Vercel | `src/lib/model/gateway.ts` | [gateway-setup](gateway-setup.md) | Verified on preview. |
| **OpenRouter** | AI responses (alternative with backups) | `DEVILS_MODEL_PROVIDER=openrouter`, `DEVILS_OPENROUTER_*` | `src/lib/model/openrouter.ts` | [openrouter-setup](openrouter-setup.md) | Supported, optional. |
| **Dodo Payments** | ₹2,000/month subscription | `DEVILS_BILLING_PROVIDER=dodo`, `DEVILS_DODO_*`, `DEVILS_PAYMENTS_ENABLED`, `DEVILS_PAID_ACCESS_START` | `src/lib/billing/dodo-*.ts`, `src/app/api/billing/**` | [payments-go-live](payments-go-live.md), [dodo-payments-setup](dodo-payments-setup.md), [dodo-verification](dodo-verification.md) | Code ready for go-live; public payments off until the owner completes the checklist. |
| Stripe (legacy) | Old adapter, reconciliation only | `DEVILS_STRIPE_*` | `src/lib/billing/service.ts` | [billing](billing.md) | Dormant. |
| **Microsoft Clarity** | Masked session replay/heatmaps, public pages, opt-in | `NEXT_PUBLIC_CLARITY_PROJECT_ID` | `src/components/analytics-consent.tsx`, `src/lib/analytics-consent.ts` | [clarity-setup](clarity-setup.md) | Code ready; needs project ID. |
| **PostHog** | Anonymous product analytics, public pages, opt-in | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | same as Clarity | [posthog-setup](posthog-setup.md) | Code ready; needs project key. |
| **Cloudflare** | DNS for `devils-advocate.app` (not referenced in code) | none | none | below | Unverified from this repository. |
| **GitHub** | Source, CI, protected release environments | Environments `staging`, `production-build`, `production` | `.github/workflows/*.yml` | [testing-and-production](testing-and-production.md) §3 | CI runs. Environments/branch protection need dashboard setup. |

## Cloudflare (DNS)

No application code talks to Cloudflare. If the `devils-advocate.app` zone is on
Cloudflare, its job is to point the domain at Vercel:

- `www` → `CNAME` to the target Vercel shows under **devils-app → Settings →
  Domains** (normally `cname.vercel-dns.com`); apex `@` → the A record Vercel shows,
  or a redirect to `www`.
- Set these records to **DNS only** (grey cloud). Vercel issues the TLS certificate
  and runs its own edge; proxying through Cloudflare (orange cloud) can break
  certificate renewal and double-cache pages. If you do proxy, use SSL mode
  **Full (strict)** and never Flexible.
- Keep the domain's Vercel verification TXT records and any email (MX/SPF/DKIM)
  records used for Supabase SMTP.
- Analytics does not need Cloudflare. Cloudflare Web Analytics, if enabled, would
  run outside this app's consent banner — leave it off, or add it to the consent
  flow first.

The `CNAME` file in the repository root is a GitHub Pages artifact. Vercel ignores
it; it is kept intentionally (see testing-and-production).

## Analytics consent (Clarity + PostHog)

Both analytics providers sit behind one opt-in (`devils-analytics-consent-v1` in
local storage). Nothing loads before consent, on private pages, or on URLs with
query/fragment. Private navigation reloads the document so no recorder follows
the visitor into sign-in, onboarding, account, billing or conversations. The
privacy notice (`src/app/privacy/page.tsx`) names both providers.

## Release checks that cover integrations

`vercel.json` build: release environment check → auth capability check
(`scripts/verify-auth.ts`) → unit tests → build. CI (`ci.yml`): typecheck, lint,
unit tests, evidence, offline evaluations, build, PostgreSQL/RLS, browser tests,
then Clarity and PostHog consent checks with synthetic IDs.
