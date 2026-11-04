# PostHog setup

PostHog adds anonymous product analytics (page views, page leave, masked clicks)
for the **public marketing pages only**. It shares the existing analytics
consent with Microsoft Clarity: one "Allow website analytics" choice covers both,
and "No thanks" / "Turn analytics off" stops both. Until the owner adds a project
key, PostHog never loads and nothing changes for visitors.

Session recording stays with Clarity. PostHog recordings, surveys, feature flags,
heatmaps, exception capture and remote scripts are all switched off in code.

## Owner dashboard steps

1. Open https://us.posthog.com/signup (US cloud) or https://eu.posthog.com/signup
   (EU cloud). Pick one region and keep it; data cannot move between regions.
   EU cloud is the simpler choice if many visitors are in the EU/UK.
2. Create a project named **Devils Advocate**.
3. Open **Project settings → General** and copy the **Project API key**. It starts
   with `phc_`. It is a public, write-only identifier, not a secret. **Never** copy
   a *personal* API key (`phx_…`); the app rejects those.
4. In **Project settings**:
   - **Discard client IP data**: turn on.
   - **Autocapture**: leave on (the app masks all text and element attributes).
   - **Session replay**, **Surveys**, **Heatmaps**, **Web vitals**: leave off. The
     app disables them anyway; leaving them off avoids dashboard confusion.
   - **Authorized URLs / Toolbar**: add `https://www.devils-advocate.app`.
5. In Vercel → **devils-app → Settings → Environment Variables**, add for
   **Production** (and for the testing project if you want analytics there):

   | Name | Value |
   | --- | --- |
   | `NEXT_PUBLIC_POSTHOG_KEY` | the `phc_…` project API key |
   | `NEXT_PUBLIC_POSTHOG_HOST` | `us` or `eu` (matching step 1) |

   These are build-time public settings, so a redeployment is required. Do not
   replace or remove any existing keys.
6. After the reviewed deployment, open the homepage in a fresh browser profile.
   The consent text now names PostHog. Before choosing **Allow website analytics**
   the Network panel must show no request to `*.i.posthog.com`; **No thanks**
   must keep it that way.
7. In a consenting browser, allow analytics. Requests to
   `https://us.i.posthog.com/` (or `eu.`) appear, and **Activity → Live events**
   shows a `$pageview` within a minute. Event URLs contain only the public page
   path; referrers are reduced to a site origin.
8. Open sign-in or a conversation: the page reloads as a fresh document without
   PostHog, and no events from those pages appear in PostHog.
9. Choose **Analytics privacy choices → Turn analytics off**. The page reloads,
   `ph_*` cookies and local-storage entries are removed, and no further events
   are sent.

Note: PostHog ignores automated browsers (headless Chrome, `navigator.webdriver`),
so monitoring tools and bots will not show up as visitors.

## Application integration contract

`src/app/layout.tsx` passes the public settings to the shared consent component:

```tsx
<AnalyticsConsent
  projectId={process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID}
  posthogKey={process.env.NEXT_PUBLIC_POSTHOG_KEY}
  posthogHost={process.env.NEXT_PUBLIC_POSTHOG_HOST}
/>
```

Either provider can be configured on its own; the consent text names only the
configured ones. Validation lives in `src/lib/analytics-consent.ts`:

- `validPostHogKey` accepts only `phc_` project keys.
- `resolvePostHogHost` accepts only `us`/`eu` or the exact PostHog Cloud ingestion
  origins; anything else disables PostHog instead of sending data elsewhere.
- `sanitizeAnalyticsEvent` is PostHog's `before_send` hook. It drops any event
  whose page is not an allowlisted public page without query or fragment, drops
  identify/alias/group events, reduces `*current_url` values to origin + path and
  all `*referrer` values to an origin. A private page that linked to a public one
  therefore never appears in PostHog.

The library (`posthog-js`, pinned exactly in `package.json`) is fetched as a
separate chunk only after opt-in, on a public document that was opened as a
public page. It runs with `person_profiles: 'never'`; the app never calls
`identify`, so no email, account ID or conversation text is linked. Private-route
navigation forces a full document load, exactly as for Clarity. Withdrawal opts
PostHog out, disables its persistence, removes `ph_*` storage and reloads.

## Tests

- `tests/posthog-analytics.test.ts` — key/host validation and the event sanitizer.
- `tests/e2e/posthog.spec.ts` — no requests before consent, events after opt-in,
  no carry-over into private pages, and identifier removal on withdrawal. It
  runs when `NEXT_PUBLIC_POSTHOG_KEY` is set to a synthetic key; CI does this in
  its analytics step with intercepted network traffic (nothing reaches PostHog).
