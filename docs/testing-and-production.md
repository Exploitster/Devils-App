# Testing and production

Think of testing as a rehearsal room and production as the public stage. A
rehearsal should never change the website or accounts your customers use.

## Current status

- **Live:** https://www.devils-advocate.app, Vercel project `devils-app`.
- **Testing:** reserved project name `devils-advocate-testing`; **not created yet**.
  The connected Vercel account returned HTTP 403 when creating a project. The
  local CLI has no saved login. No testing URL or isolated database is live yet.
- Production automatic domain assignment is paused. Its ignored Git build
  command is `exit 0`, new preview deployments are disabled, and its framework
  is explicitly Next.js. These settings leave the restored release serving.
- Future builds require an isolation preflight before authentication checks,
  unit tests and the app build. The production environment label was added;
  existing API keys were preserved.
- GitHub workflow and isolation tests are in this change. GitHub returned
  HTTP 403 for branch-protection access and environment creation, so reviewers,
  branch restrictions and deployment credentials still need dashboard setup.
- Payments stay disabled. The older preview URL uses legacy configuration;
  **do not use it as the isolated testing website**.

The workflow must not be treated as activated until the dashboard setup below
is finished and an entire testing deployment succeeds. Never add deployment
tokens to repository-wide secrets as a shortcut around environment protection.

## How releases will work

1. Work goes into a feature branch and is reviewed through a pull request into
   `staging`. Both branches contain the complete application.
2. A push to `staging` runs type checking, lint, unit tests, evidence verification,
   offline model evaluations, a build, PostgreSQL checks and browser tests.
3. If these pass, **Tested release** deploys only to the separate testing project.
   Its build checks the test database and authentication setup. HTTP checks
   verify the homepage, sign-in, configuration and private API boundary.
4. On testing, verify Google login, email signup/confirmation/password reset,
   a business conversation, a philosophical conversation, citations, saving and
   reopening a conversation, account deletion and mobile use. Use test accounts
   only. Local model tests do not prove that live AI credits or providers work.
5. Merge the tested source into `main`, preserving history. Run **Tested release**
   from `main`, entering the full commit ID of the successful testing run.
   The workflow requires that commit to be an ancestor with an identical tree
   and have a successful testing run. Changed source must go through testing again.
6. It builds a production candidate using production settings **without changing
   the live domain**, then checks the candidate. Production and testing need
   different builds because their database and site settings differ.
7. The production environment waits for your approval. After approval, it
   publishes that candidate and checks the public website. If that check fails,
   it requests rollback to the deployment that served the domain beforehand.
   A partial promotion error or failure to freeze automatic domain assignment
   also triggers that rollback path; a rollback failure is reported explicitly.
   It refuses an outdated approval if `main` advanced while it was waiting.

## One-time dashboard setup — complete list

### 1. Create the test database

Open https://supabase.com/dashboard and choose **New project**. Name it
`Devils Advocate Testing`. Keep your existing production project. Choose the
free plan if offered. Save the database password privately.

In the **new testing project only**, open SQL Editor and run the complete
`Devils-Advocate-Testing-Setup.sql` file supplied with this setup. Open the file,
copy all its text, paste it into SQL Editor, then click **Run** with no text
selected. It contains schema only, not credentials or customer records.

For developers, regenerate that file from this repository with:

```sh
npm run db:setup:bundle
```

The generated file is `.local/supabase/Devils-Advocate-Supabase-Setup.sql`.
Run the entire file; it applies the versioned schema in one transaction.
Do not copy production customer rows into testing.

In testing Authentication, enable email/password signup and email confirmation.
Configure Google there too. If using the same Google OAuth client, **add** the
new test callback URL in Google Cloud while retaining the existing production
callback. Supabase shows the exact callback, of the form
`https://YOUR_TEST_PROJECT_REF.supabase.co/auth/v1/callback`.

### 2. Create the testing website

Open https://vercel.com/new under the **exploitster1** team. Import
`Exploitster/Devils-App`, name the project `devils-advocate-testing`, select
the `staging` branch and Next.js. Use Node 24. If the import screen does not
offer branch selection, set Production Branch to `staging` after import.
An initial build may fail while database settings are missing; that affects
only testing.

Use this build command:

```sh
node scripts/verify-release-environment.mjs && npm exec -- tsx scripts/verify-auth.ts && npm test && npm run build
```

In the testing project's Git settings set **Ignored Build Step → Custom →
`exit 0`**. The GitHub workflow will deploy after checks; native Git deployment
must not race it. Keep the same ignored-build command on production. Keep
Vercel Authentication protection enabled on testing.

Under testing **Settings → Environment Variables**, add these to its
**Production** environment. Here “Production” means the stable website of the
*testing project*, not the real customer project.

| Name | Value |
| --- | --- |
| `DEVILS_DEPLOYMENT_ENV` | `staging` |
| `DEVILS_RUNTIME_MODE` | `services` |
| `DEVILS_APP_URL` | The testing project's stable HTTPS URL, without a trailing slash |
| `DEVILS_SUPABASE_URL` | New testing Supabase Project URL |
| `DEVILS_SUPABASE_ANON_KEY` | New testing Supabase legacy anon key |
| `DEVILS_SUPABASE_SERVICE_ROLE_KEY` | New testing Supabase legacy service_role key; store privately |
| `DEVILS_MODEL_PROVIDER` | `gateway` |
| `DEVILS_BETA_ACTIVE` | `true` |
| `DEVILS_PAYMENTS_ENABLED` | `false` |
| `DEVILS_DAILY_SPEND_LIMIT_MICROS` | `25000` (a $0.025 daily application limit for testing) |

Enable OIDC for the testing project for AI Gateway. Gateway credits and Vercel
hosting quotas are still shared at team level; separate projects do not create
a separate free-credit balance. Never copy production secrets into testing.

Back in **testing Supabase → Authentication → URL Configuration**, set Site URL
to that stable testing URL and add `<testing URL>/auth/callback` under Redirect
URLs. Production Supabase remains configured for the public domain.

### 3. Protect GitHub and connect deployment permission

Open https://github.com/Exploitster/Devils-App/settings/environments.
Create or open these exact environments (a workflow run may already have
created the name; it still needs the protection settings):

| Environment | Allowed branch | Required reviewer |
| --- | --- | --- |
| `staging` | `staging` only | Optional after branch protection is configured |
| `production-build` | `main` only | Optional; prepares a candidate without publishing |
| `production` | `main` only | Your GitHub user `Exploitster` |

For `production`, enable required reviewers before adding credentials. Since
you are the sole owner, leave “Prevent self-review” off so you can approve your
own release. Limit deployment branches using **Selected branches and tags**.

In GitHub **Settings → Rules → Rulesets** or **Branches**, protect both `main`
and `staging`: require pull requests and the successful `application` check,
require the branch to be up to date, and block force pushes and deletion.
The first run may be needed before GitHub offers the check in its selector.

Open https://vercel.com/account/tokens and create a deployment token scoped to
the existing team with the shortest practical expiry. Add it privately as an
**environment secret** named `VERCEL_TOKEN` in all three GitHub environments.
Use project-scoped tokens if your Vercel account offers them. Team-scoped tokens
still have team-wide authority; environment rules and pinned destinations are
additional safeguards, not a replacement for credential scoping.

Under GitHub **Settings → Secrets and variables → Actions → Variables**, add
`VERCEL_STAGING_PROJECT_ID` using the testing project's ID from Vercel General
Settings. It must differ from `prj_RtFOuKfu3erBBiaiU7uIuvGPndEt`.

For protected testing deployments, configure Vercel **Protection Bypass for
Automation**, then save that value as the `staging` environment secret
`VERCEL_AUTOMATION_BYPASS_SECRET`. Do not paste any token or key into chat.

### 4. Finish the first rehearsal and release setup

Rerun **Tested release** for `staging` after the settings are saved (a subsequent
push to staging also triggers it). Confirm its tests, deploy and HTTP checks all
pass. Complete the real login and conversation checks in the release list above.

Merge the complete application pull request into `main` using a normal merge
that preserves history. Keep the existing `CNAME` file. The source on `main`
must match the successful staging run, including workflow files. This also makes
the manual workflow appear in GitHub's Actions tab.

Open **Actions → Tested release → Run workflow**, select `main`, and enter the
full 40-character commit ID from the successful staging run. When the workflow
reaches **Review deployments → production**, check the candidate, then approve.
If a check fails, leave the existing website serving and fix the testing branch.
Do not re-enable production Git publishing or publish by pushing to `main`.

## Recovery and monitoring

The known restored release is `dpl_HTUed9Rp2rnA8Qo89cqXWvWpSYvT` (source
`4edcd52ec9340950108d338bfbe2b7d5a078f39a`). In a release incident, use Vercel's
Rollback action on the last verified production deployment; never reset Git or
replace database keys. Rollback restores application code, not database changes.

The release operator owns the candidate checks, approval and the first 15
minutes of observation: public `/` and `/login` must return 200,
`/api/health` must report configured hosted services, and anonymous
`/api/sessions` must return 401. Inspect production runtime errors after the
release and check real login and one conversation with a test account.
Unexpected 404/500 responses, broken login or an unusable conversation require
investigation and, when caused by the release, rollback. AI quota exhaustion
requires checking Gateway credit and rate limits separately.

The initial activation and full real-auth/model rehearsal are still pending;
this document does not claim those checks have passed. Database migrations must
remain backward compatible and be reviewed separately; the workflow never
automatically migrates the production database.
