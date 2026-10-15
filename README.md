# Devils Advocate

A private application for challenging business ideas and personal decisions. This checkout contains the application. Your marketing website is https://exploitster.github.io/devilsadvocate/ and remains separately managed; the app links back to it. Its waitlist has not been changed or independently verified.

Use Node **24.19.0** and npm **11.9.0**. Dependencies are pinned and the lockfile is committed. TypeScript 6.0.3 matches the supported ESLint parser range. Next.js uses App Router and Node server handlers; local persistence uses Node's built-in SQLite module.

```sh
cd /workspace/Devils-App
npm ci --cache /workspace/.npm-cache
npm run setup:local
DEVILS_BETA_ACTIVE=true npm run dev:local
```

`setup:local` generates a random server signing secret into ignored `.env.local` only when no signing binding exists. It preserves existing configuration and prints no secret. Run `dev:local` to select the explicitly labeled deterministic development adapters and durable `.local/devils.sqlite` storage. External credentials are unnecessary for this mode. Development identities are signed server accounts, not production authentication. Production rejects local mode. The application does not silently fall back when service bindings fail.

Service mode is the default. See `.env.example` for exact names and supply Supabase and Gemini bindings securely. Payments are deferred: keep `DEVILS_PAYMENTS_ENABLED=false` and leave Stripe fields blank. The billing page is ready with disabled payment controls. See [the step-by-step connection guide](docs/setup-guide.md). `DEVILS_APP_URL` must be HTTPS in production. Never expose the Supabase service role, model key, Stripe secrets, or development signing secret using `NEXT_PUBLIC_` variables. Public configuration is limited to runtime mode, beta availability, and launch date. Beta activation is explicit and separate from the configurable December 1, 2026 launch date; individual invites carry their own expiry.

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

`eval` checks seven offline deterministic fixture contracts and saves responses for qualitative review; it makes no Gemini calls and does not certify live model quality. `test:db` uses an isolated checksum-pinned PostgreSQL container with stub auth functions to verify SQL/RLS; hosted Supabase remains a separate check. See [operations](docs/operations.md), [privacy](docs/privacy.md), [evidence provenance](docs/evidence.md), and [deferred billing](docs/billing.md).
