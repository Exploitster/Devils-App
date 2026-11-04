# Public authentication for the free MVP

Current app: https://devils-advocate-preview-exploitster1.vercel.app

Keep DEVILS_PAYMENTS_ENABLED=false. Active accounts receive free access without invites. Billing controls and prices are absent from the app; existing billing code/data are retained, disabled, for a future version. Existing API keys must not be replaced.

## Supabase

Use the existing project and database. Do not reset or re-run initial schema creation on an existing database. The server creates missing profiles only after Supabase verifies an authenticated identity; an atomic insert ignores duplicates and cannot overwrite a disabled profile. Name and onboarding status are saved in authenticated user metadata. No new SQL migration is needed for public registration.

1. Enable new-user signup in Authentication settings.
2. Enable the Email provider with email/password. Keep email confirmation enabled for public use.
3. Set the Site URL to the app URL above.
4. Keep this allowed Redirect URL:
   https://devils-advocate-preview-exploitster1.vercel.app/auth/callback
5. Password recovery uses that same callback. The official SDK’s verified recovery marker routes the user to /reset-password; no extra query-string redirect setting is needed.
6. Check email delivery configuration. Supabase's built-in email service restricts recipients and has low sending limits; configure your own SMTP service for public confirmation/recovery emails. Never paste SMTP passwords into chat or source code.

## Google

1. In Supabase Authentication → Sign In / Providers → Google, copy the displayed Supabase Callback URL.
2. Open Google Cloud Console → Google Auth Platform; select/create the project.
3. Configure Branding (app name, contact emails) and Audience (External).
4. Create an OAuth Client of type Web application.
5. Authorized JavaScript origin: https://devils-advocate-preview-exploitster1.vercel.app
6. Authorized redirect URI: the Supabase Callback URL from step 1, not the Vercel callback.
7. Copy Client ID and Client Secret into Supabase's Google provider; enable it and save. Keep the secret out of source code and chat.
8. Testing mode requires users to be listed as test users. Check Google's publishing and domain/branding requirements before advertising Google sign-in to all users. Only basic identity scopes are needed.
9. Public policy pages are /privacy and /terms on the app.

The server uses the official Supabase SDK and PKCE cookies, not a custom Google token exchange. OAuth consent, provider configuration and real email delivery require external-account verification; a passing local test cannot establish them.

## Verification and deployment

The Vercel build runs scripts/verify-auth.ts: read-only auth capability checks, a zero-row profile-table query and a random nonexistent profile RPC lookup. It sends no email, creates no hosted user and reads no existing profile. The build also runs deterministic unit tests and compiles the app. Run `npm run test:gateway -- --confirm-live` separately for live AI readiness; it has a maximum estimated $0.25/run and can fail on free-tier throttling. A successful deployment does not establish live AI availability.

Local browser tests cover real local signup/password authentication, onboarding persistence, free conversation creation, sources/cards/history, recovery error states, responsive layouts and accessibility. Hosted signup confirmation, recovery email and Google consent must also be tested with a real account after the external settings are ready.

For a public MVP, remove the Vercel team-only deployment protection only after application authentication has been verified. Authenticated APIs must continue enforcing ownership, disabled-account state, same-origin writes and fair-use/spend limits. Public registration must not grant admin privileges or expose private conversation data.
