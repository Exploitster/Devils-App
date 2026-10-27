# Devils Advocate

The live app is https://www.devils-advocate.app. For testing environments,
release gates, rollback and the remaining dashboard setup, follow
[testing and production](docs/testing-and-production.md). Production Git
publishing is paused; a push to `main` must not publish directly.

A private application for challenging business ideas and personal decisions. This checkout contains the application. Your marketing website is https://exploitster.github.io/devilsadvocate/ and remains separately managed; the app links back to it. Its waitlist has not been changed or independently verified.

Use Node **24.19.0** and npm **11.9.0**. Dependencies are pinned and the lockfile is committed. TypeScript 6.0.3 matches the supported ESLint parser range. Next.js uses App Router and Node server handlers; local persistence uses Node's built-in SQLite module.

```sh
cd /workspace/Devils-App
npm ci --cache /workspace/.npm-cache
npm run setup:local
DEVILS_BETA_ACTIVE=true npm run dev:local
```

`setup:local` generates a random server signing secret into ignored `.env.local` only when no signing binding exists. It preserves existing configuration and prints no secret. Run `dev:local` to select the explicitly labeled deterministic development adapters and durable `.local/devils.sqlite` storage. External credentials are unnecessary for this mode. Development identities are signed server accounts, not production authentication. Production rejects local mode. The application does not silently fall back when service bindings fail.

Service mode is the default. See `.env.example` for exact names and supply Supabase and Gemini bindings securely. Payments are deferred: keep `DEVILS_PAYMENTS_ENABLED=false` and leave Stripe fields blank. The current MVP has public Google and email/password signup, guided onboarding and free access. Billing UI is removed; legacy billing routes cannot charge while payments are disabled. See [the step-by-step connection guide](docs/setup-guide.md). `DEVILS_APP_URL` must be HTTPS in production. Never expose the Supabase service role, model key, Stripe secrets, or development signing secret using `NEXT_PUBLIC_` variables. Public configuration is limited to runtime mode, beta availability, and launch date. With payments disabled, active accounts receive free access without invitations or expiry. Existing invite/subscription records are preserved for a later paid version. See [public authentication setup](docs/public-auth-setup.md).

OpenRouter is also supported with explicit primary/backup models, provider privacy restrictions, price ceilings, bounded retries and server-resolved source quotations. See [OpenRouter setup and live verification](docs/openrouter-setup.md). Select it with `DEVILS_MODEL_PROVIDER=openrouter` and supply `DEVILS_OPENROUTER_API_KEY`; existing Gemini settings remain available for an explicit rollback. A passing offline test suite is not proof of live provider readiness.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm run evidence:verify
npm run eval
npm run test:db
```

`typecheck` runs TypeScript without emitting files; `lint` runs the Next.js ESLint rules; `test` runs Node-based Vitest domain tests; `build` runs the production Next.js webpack build. `test:e2e` starts the actual local server with a fresh isolated `.local/e2e-<id>.sqlite` database and runs Playwright using installed `/usr/bin/chromium` (override with `CHROMIUM_PATH`). When no system Chromium exists, install the Playwright browser with `npx playwright install --with-deps chromium`. `evidence:verify` verifies the reviewed corpus; `eval` runs the separately labeled model evaluation fixtures. Build success does not verify sandbox services or production readiness.

The cloud workflow uses the existing checkout at `/workspace/Devils-App`. Each cloud task already runs in an isolated environment; create a Git worktree only when explicitly requested. Dependency cache belongs outside the checkout at `/workspace/.npm-cache`. Signing configuration, SQLite files, build outputs, and browser artifacts remain ignored. Production persistence is Supabase; writable local files are a development dependency only.

`eval` checks thirteen offline deterministic fixture contracts and saves responses for qualitative review; it makes no Gemini calls and does not certify live model quality. `test:db` uses an isolated checksum-pinned PostgreSQL container with stub auth functions to verify SQL/RLS. Optional `npm run test:supabase -- --sandbox` creates and cleans up two synthetic users in a dedicated development project, without sending email. Optional `npm run eval:live -- --confirm-live` calls Gemini using synthetic examples with a $0.25 estimated run budget. Both require secure service bindings; live model evaluation also needs reviewed token prices. See [MVP behavior and readiness](docs/mvp-bot-behavior.md), [operations](docs/operations.md), [privacy](docs/privacy.md), [evidence provenance](docs/evidence.md), and [deferred billing](docs/billing.md).

Vercel AI Gateway setup and the bounded live verification command are documented in [docs/gateway-setup.md](docs/gateway-setup.md). A visible free-credit balance alone does not establish model eligibility or app readiness.
