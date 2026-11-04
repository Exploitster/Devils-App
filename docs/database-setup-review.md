# Database setup diagnosis and validation

## Reported failure

Supabase returned `42601`, `syntax error at or near "if"`, with `if p_args->'card' ...` on submitted line 1. That line belongs inside `public.app_store` in `supabase/migrations/001_application.sql:91`; it is not a top-level SQL statement.

An isolated PostgreSQL reproduction submitted only that fragment and obtained the same line-1 syntax error. The complete original 227-line handoff passed, including schema/owner/RLS assertions. This establishes that the fragment requires its surrounding function. The exact editor selection/copy action in the hosted UI is not observable; incomplete or selected input is the supported explanation, not a proven UI action.

The original complete handoff also failed on a second run with `relation "profiles" already exists`. Existing tests applied individual migrations once, so they did not exercise repeat clicks or the generated handoff file.

## Fix

`npm run db:setup:bundle` generates a complete SQL Editor file from the canonical migrations. It uses a single transaction, an advisory lock, private migration receipts and SHA-256 checksums. Matching applied migrations are skipped. New migrations run in filename order; missing history, changed applied SQL and attempts to run an older bundle are refused. Existing app tables without receipts cause a clear stop rather than an automatic destructive reset.

Do not edit applied migrations. Add a new numbered migration, regenerate the bundle, and validate it in a development project before applying it to a database with real data. The test suite derives synthetic future migration numbers and receipt counts from the current migration list, so adding a real fourth migration does not break the upgrade scenario merely because of hardcoded fixture versions.

The SQL Editor instructions now require the whole file with no selected fragment and an explicit success result. No change was made to `app_store` business logic merely to suppress a syntax error caused by running an incomplete function body.

## Observed verification

- Original complete handoff: passes on clean PostgreSQL; fragment reproduces the reported error.
- Regression before the fix: repeat handoff failed on the existing `profiles` table.
- Updated PostgreSQL suite: direct canonical migrations and generated bundle both pass owner/RLS assertions. First run, repeat run preserving a saved session, future additive migration, checksum/downgrade rejection, refusal of untracked existing tables, and full rollback of a failed migration pass.
- App unit suite: 98 passed, one hosted Supabase integration test skipped because two issued test-user tokens are absent.
- TypeScript and ESLint: passed.
- Real Chromium/HTTP browser suite: eight passed, including mobile accessibility, saved conversations, deferred payment gates and deletion confirmation.
- Production Next.js build: passed.
- Corpus verification: six records and seven exact excerpts passed.
- Offline model fixture contracts: seven passed. These make no Gemini calls and do not certify live model quality.
- `npm audit --omit=dev`: zero reported production dependency advisories.
- Full `npm audit`: ten development dependency entries flagged (five high, five low), propagated from `braces` pattern stack exhaustion and an `esbuild` Windows development-server file-read advisory. These remain unresolved; the audit does not offer an automatic fix for most affected entries. No forced dependency overrides or major upgrades were applied as part of this SQL repair.

## Post-fix quality and limits

Scope is the database bundle generator, build command, PostgreSQL harness and setup documentation, relative to pre-fix HEAD `8fe03e339fce34667c7b5f0afc76d0069c1d8a25`. Compound Engineering's three simplification lenses completed: no reuse or efficiency changes were needed; one quality finding about future fixture numbering was applied. Consolidating different filename filters was skipped because it would change which raw SQL migrations the existing direct-migration regression executes. Targeted manual correctness review covered the fix files; this is not a completed formal branch-wide code-review receipt.

Read-only hosted checks returned HTTP 404 for the four sampled app tables. No hosted DDL or private-data reads were performed. Authentication connectivity responded previously; hosted schema installation, real two-user authorization and live Gemini behavior still require their separate verification. The SQL file is tested against real PostgreSQL with stub Supabase auth functions, not against every future Supabase release. No scan can promise that future code changes, migrations, or providers introduce no errors.
