# Microsoft Clarity setup

The application integration is optional and consent-based. No project ID has
been invented and this change does not create a Microsoft account or project.
Until the owner adds the project ID, Clarity does not load and no consent banner
is shown. The existing product works normally.

## Owner dashboard steps

1. Open https://clarity.microsoft.com/ and sign in with your Microsoft account.
2. Add a project named **Devils Advocate**, with website
   `https://www.devils-advocate.app`.
3. Open **Settings → Overview** and copy the **Project ID**. This is a public
   identifier, not a password or API secret. Do not copy a Microsoft login token.
4. In the project's masking settings, choose **Strict** masking. Keep inputs and
   all text masked. Do not add unmask selectors or user identification rules.
5. Require cookie consent in the Clarity project. This integration grants only
   analytics storage after explicit opt-in; advertising storage remains denied.
6. In Vercel → **devils-app → Settings → Environment Variables**, add
   `NEXT_PUBLIC_CLARITY_PROJECT_ID` with that ID for **Production**. A redeployment
   is required because this is a public build-time setting. Keep existing keys.
7. After the reviewed deployment, open the homepage in a fresh browser profile.
   Before choosing **Allow website analytics**, verify the Network panel contains
   no request to `clarity.ms`. Choosing **No thanks** must leave it that way.
8. In a consenting browser, allow analytics and check the request to
   `https://www.clarity.ms/tag/<your-project-id>`. Open sign-in and a conversation:
   they must load a fresh document with no Clarity script. Those pages must not
   appear in Clarity recordings. Masked public clicks/scrolling can take time to
   appear in the dashboard.
9. Use **Analytics privacy choices → Turn analytics off**. The page reloads and
   Clarity must not load afterward. Verify again after refreshing.

## Application integration contract

Mount once in the root layout:

```tsx
<AnalyticsConsent projectId={process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID} />
```

The component supplies `.analytics-consent`, `.analytics-actions` and
`.analytics-settings` hooks for the existing theme. Add the public-site analytics
handling to the privacy notice before enabling the project.

The code records only explicitly allowlisted public marketing documents and
rejects initial URLs with parameters/fragments, which might carry personal data
or OAuth tokens. A document first opened on a private route remains ineligible
for its entire lifetime, even after client-side navigation to a public page.

While the recorder is loaded, capture-phase links and History API navigation
into a private route trigger full document navigation. This is intentional:
removing a script tag does not unload a running recorder. No user email, account
ID, conversation text or custom identity is sent via Clarity's Identify API.
The entire body is marked `data-clarity-mask` before loading the external script.
Strict dashboard masking is an additional required control.

The stored local choice is `devils-analytics-consent-v1` (`accepted` or
`declined`). Refusing analytics does not restrict sign-in or product features.
Local-storage failures prevent opt-in. Withdrawal (including another tab clearing or declining the stored choice)
revokes consent and reloads the document. BFCache restoration rechecks the stored
choice before continuing the public document. Withdrawal does not promise
deletion of recordings already held by
Microsoft. Refer to Microsoft's retention settings for existing recordings.

The API command and consent option casing were checked against the official
`@microsoft/clarity` package README (`npm view @microsoft/clarity readme`,
27 October 2026):

```js
clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' });
```

No new dependency is required. Final dashboard delivery cannot be verified until
the owner's actual project ID is configured and an opted-in public visit occurs.
