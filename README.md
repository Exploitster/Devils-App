# Devils Advocate

A private application for challenging business ideas and personal decisions. This checkout contains the application; the brief's existing marketing site and waitlist were not supplied, so their preservation cannot be verified.

Use Node **24.19.0** and npm **11.9.0**. Dependencies are pinned and the lockfile is committed. TypeScript 6.0.3 matches the supported ESLint parser range. Next.js uses App Router and Node server handlers; local persistence uses Node's built-in SQLite module.

```sh
cd /workspace/Devils-App
npm ci --cache /workspace/.npm-cache
npm run setup:local
DEVILS_BETA_ACTIVE=true npm run dev:local
```

`setup:local` generates a random server signing secret into ignored `.env.local` only when no signing binding exists. It preserves existing configuration and prints no secret. Run `dev:local` to select the explicitly labeled deterministic development adapters and durable `.local/devils.sqlite` storage. External credentials are unnecessary for this mode. Development identities are signed server accounts, not production authentication. Production rejects local mode. The application does not silently fall back when service bindings fail.

Service mode is the default. See `.env.example` for exact names and supply all Supabase, model, and Stripe test bindings securely. `DEVILS_APP_URL` must be HTTPS in production. Never expose the Supabase service role, model key, Stripe secrets, or development signing secret using `NEXT_PUBLIC_` variables. Public configuration is limited to runtime mode, beta availability, and launch date. Beta activation is explicit and separate from the configurable December 1, 2026 launch date; individual invites carry their own expiry.

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm run evidence:verify
npm run eval
```

`typecheck` runs TypeScript without emitting files; `lint` runs the Next.js ESLint rules; `test` runs Node-based Vitest domain tests; `build` runs the production Next.js webpack build. `test:e2e` starts the actual local server with isolated `.local/e2e.sqlite` storage and runs Playwright using installed `/usr/bin/chromium` (override with `CHROMIUM_PATH`). No browser download is needed. `evidence:verify` verifies the reviewed corpus; `eval` runs the separately labeled model evaluation fixtures. Build success does not verify sandbox services or production readiness.

The cloud workflow uses the existing checkout at `/workspace/Devils-App`. Each cloud task already runs in an isolated environment; create a Git worktree only when explicitly requested. Dependency cache belongs outside the checkout at `/workspace/.npm-cache`. Signing configuration, SQLite files, build outputs, and browser artifacts remain ignored. Production persistence is Supabase; writable local files are a development dependency only.
