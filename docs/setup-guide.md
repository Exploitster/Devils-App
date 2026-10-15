# Connect the app, one service at a time

The current choices are Supabase for accounts and private storage, Gemini for AI, and payments deferred. The marketing website is https://exploitster.github.io/devilsadvocate/. This app links to it; its files and waitlist are managed separately.

## 1. Try the app without external accounts

Use Node 24 and run these commands from the repository:

```sh
npm ci
npm run setup:local
DEVILS_BETA_ACTIVE=true npm run dev:local
```

Open the development server address printed by Next.js. On the sign-in screen use `alex@example.test` or `sam@example.test`. Responses in this mode are deterministic examples. They do not call Gemini, send email, or process payments. The expired demo account lets you check the access-expiry screen.

## 2. Choose a Supabase project

1. Open https://supabase.com/dashboard and select a project dedicated to this app. Create a development project if you do not have one.
2. Click **Connect** and find the **Project URL**, such as `https://your-project.supabase.co`. This public URL is safe to share in chat.
3. Keep API keys out of chat. In project settings, find the project API keys. The server needs the public anonymous key and a privileged service-role key compatible with Supabase JS. Store them in secure environment variables as `DEVILS_SUPABASE_ANON_KEY` and `DEVILS_SUPABASE_SERVICE_ROLE_KEY`. Store the URL as `DEVILS_SUPABASE_URL`.
4. For a new dedicated project, run `npm run db:setup:bundle` and open `.local/supabase/Devils-Advocate-Supabase-Setup.sql`. In Supabase **SQL Editor → New query**, paste the **entire file**, from its `START` comment through its `END` comment. Click inside the editor to clear any selection, then click **Run**. Running a selected fragment beginning with `if p_args...` causes a syntax error because it is part of a function, not a standalone SQL statement. A successful full run returns `Devils Advocate database setup complete`. Migration 002 creates dormant billing storage; it does not contact Stripe or charge anyone.
5. Set `DEVILS_APP_URL` to the app's actual origin. In Supabase Authentication URL Configuration, set the site URL and allow the exact `${DEVILS_APP_URL}/auth/callback` redirect. Production service cookies require HTTPS.
6. Create/invite each user through Supabase Authentication. Public self-registration is not supported by the app. Create matching application profile and expiring invite records through the service-only store interface described below. Set `DEVILS_BETA_ACTIVE=true` for invited beta access; this does not grant access without an unexpired invite.

The privileged key stays on the server. Never put it in a `NEXT_PUBLIC_` variable or commit it to Git.

## 3. Connect Gemini

1. Open https://aistudio.google.com/ and create a Gemini API key for the appropriate Google project.
2. Put that key in the environment's secure credential settings as **`DEVILS_GEMINI_API_KEY`**, with HTTPS access to **`generativelanguage.googleapis.com`**. Do not paste it into chat.
3. Set `DEVILS_MODEL=gemini-3.8-flash`. The Gemini 3 adapter requests low thinking within the output-token cap. A real generation attempt on October 15, 2026 returned `404 NOT_FOUND` for the previous `gemini-2.5-flash`, explaining that it was unavailable to new users and recommending 3.8. Model-list success alone does not prove generation availability.
4. Check the current Gemini price for your account and set `DEVILS_MODEL_INPUT_USD_PER_MILLION` and `DEVILS_MODEL_OUTPUT_USD_PER_MILLION` to the USD prices per million tokens. Google's [published standard text rates](https://ai.google.dev/gemini-api/docs/pricing) checked October 15, 2026 list **0.75 input / 3.75 output** for 3.8 Flash through December 31, 2026, and **1.50 / 7.50** starting January 1, 2027. These can serve as conservative paid-rate estimates; your free/paid tier and invoice may differ. Review and update the configured rates when the tariff changes. Set zero only if the applicable tier is actually free.
5. Set `DEVILS_RUNTIME_MODE=services`. Keep `DEVILS_PAYMENTS_ENABLED=false`; leave all Stripe fields blank. Restart the app after configuration changes.
6. Run `npm run eval:live -- --confirm-live` for three synthetic scenarios using the real engine and a maximum $0.25 estimated run budget. Read `.local/evaluations/live-latest.json`; schema checks and human quality review are separate. The October 15 run stopped on Google's repeated `503 UNAVAILABLE` responses. Live model quality remains unverified. Once Google accepts generation, sign in with an invited account, send a synthetic conversation, inspect the returned source, and create a card. Confirm that provider usage appears in the server store.

In the Codex environment, draft changes must be reviewed, saved, and published before they apply to a new environment. The old `DEVILS_MODEL_API_KEY` OpenAI requirement and Stripe requirements may still appear in saved settings; they are unused with the configuration above and can be removed there. The app reads only the Gemini key.

## 4. Leave payments disconnected

No Stripe account or keys are needed now. The billing page retains the monthly and yearly plans and explains that payments are not connected. Checkout, portal, webhook, and simulated confirmation endpoints reject requests while disabled. Invited beta access has a separate expiry and never turns into an automatic charge. When you are ready, a separate integration task can connect and verify Stripe test mode before any production billing work.

## 5. Link the existing website

The app footer links to your marketing website. Adding an “Open app” link on that website will need its repository and the final hosted app URL. This work has not modified the website or its waitlist.

## Operator-only invite records

After creating the authentication user, use its exact UUID with the service-only `public.app_store` RPC. `putProfile` accepts `{profile:{id,email,disabled:false,deletionState:"none",createdAt}}`; `putInvite` accepts `{invite:{userId,enabled:true,expiresAt}}`. Timestamps must be ISO strings, and the invite expiry must be in the future. Make these calls only from a trusted server/admin environment, never from a browser. Owner RLS does not allow users to grant themselves invites or subscriptions.

`/api/health` reports configuration readiness only. It does not prove that Supabase or Gemini is reachable. `npm run test:supabase -- --sandbox` verifies two-user password authentication, owner isolation, operation reservation/cancellation, disabled-account RLS and deletion using temporary synthetic identities in a dedicated development project. It cleans up only identities it creates and sends no email. These hosted checks passed on October 15; browser magic-link delivery, refresh and the final HTTPS callback still need verification before release.

## Database updates and safe retries

The generated file applies all pending migrations in one transaction, records their versions and SHA-256 checksums, and serializes setup runs with a database lock. Running the complete file again skips matching completed migrations and preserves saved data. A failed migration rolls back that run. It refuses changed applied files, missing/out-of-order history and attempts to use an older bundle against a newer database.

For future schema changes, add the next numbered SQL migration; do not edit previously applied migrations. Generate a new bundle, run `npm run test:db`, review the new migration for data and permission changes, and apply it to a development project before production. Do not mix this handoff workflow with untracked manual schema changes. Databases already initialized by another migration tool need a reviewed baseline; the bundle stops rather than adopting existing app tables without receipts. Do not delete tables to bypass that warning.

The database regression suite checks the exact generated bundle: first run, repeat run with a saved session, a future additive migration, checksum/downgrade rejection and rollback of a failed migration. These are forward-migration checks, not a guarantee that arbitrary future schema changes or provider upgrades will be compatible. Back up real data before future migrations.
