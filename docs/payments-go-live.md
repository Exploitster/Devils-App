# Payments go-live checklist

Use this to switch the ₹200/month plan from "coming soon" to live on www.devils-advocate.app.
Do the steps in order. Payments stay off for everyone until step 9, so you can stop at any point and the site keeps working as it does today.

Accounts created before the moment you switch payments on stay free indefinitely. New accounts get a 24-hour trial and then need a subscription. History always stays readable.

Never paste a key, secret or password into chat or GitHub.

## Before you start: launch confirmations

Confirm each of these once. They are owner decisions, not settings.

| Confirm | Where | How you know it is done |
| --- | --- | --- |
| Daily AI spend limit fits paying users | Vercel → devils-app → Environment Variables → `DEVILS_DAILY_SPEND_LIMIT_MICROS` (microdollars per day; today 250000 = $0.25) | You have raised it to a budget you accept, and AI Gateway credit or the provider account covers it |
| Google and email sign-in work on the live site | www.devils-advocate.app/signup and /login | A fresh email account receives its confirmation email and signs in; Google sign-in completes |
| Support and refund contact is published | www.devils-advocate.app/contact and /refunds | Both pages show a contact you monitor |
| Purchase terms are correct | /terms and /subscription-and-cancellation | They describe the ₹200 monthly plan, renewal and cancellation as you intend |

## Steps

| # | Step | Where | Confirm it worked |
| --- | --- | --- | --- |
| 1 | Create the **Live Mode** monthly product: INR ₹200, every 1 month, no Dodo trial, no discounts | Dodo dashboard → switch to Live Mode → Products | The product shows ₹200 monthly; copy its product ID (`pdt_…`) |
| 2 | Create a **live API key** | Dodo → Live Mode → Developer → API keys | The key is saved privately (password manager) |
| 3 | Add the **live webhook** for `https://www.devils-advocate.app/api/billing/dodo/webhook` with all subscription, payment, refund and dispute events | Dodo → Live Mode → Developer → Webhooks | The endpoint is listed; its signing secret is saved privately |
| 4 | Apply database **migration 004** by running the complete setup file | Supabase → SQL Editor → paste all of `docs/Devils-Advocate-Supabase-Setup.sql` (or regenerate it with `npm run db:setup:bundle`) → Run with nothing selected | The run ends with `Devils Advocate database setup complete` |
| 5 | Copy your own **User UID** | Supabase → Authentication → Users → your account | You have the UUID (an identifier, not a password) |
| 6 | Set the live values with **payments still off** | Vercel → devils-app → Settings → Environment Variables → Production: `DEVILS_BILLING_PROVIDER=dodo`, `DEVILS_DODO_ENVIRONMENT=live_mode`, `DEVILS_DODO_API_KEY=<live key>` (Sensitive), `DEVILS_DODO_WEBHOOK_SECRET=<live signing secret>` (Sensitive), `DEVILS_DODO_MONTHLY_PRODUCT_ID=<live pdt_…>`, `DEVILS_DODO_TEST_USER_IDS=<your UID>`, `DEVILS_PAYMENTS_ENABLED=false` | All values saved; nothing else changed |
| 7 | **Redeploy** production | Vercel → devils-app → Deployments → Redeploy the current production deployment | Build log shows `Deployment isolation: production … payments disabled` and the site loads. If Vercel cancels the build because of the Ignored Build Step, clear Settings → Git → Ignored Build Step, redeploy, then set it back to `exit 0` |
| 8 | Make **your own real payment** | Sign in as yourself → Billing → Subscribe → pay with a real card | Dodo (Live Mode) shows the payment; the webhook delivery returns **200**; Billing → Refresh payment status shows an active subscription. Everyone else, including you, still has free access |
| 9 | **Switch payments on** | Vercel → Production: `DEVILS_PAID_ACCESS_START=<current UTC time, e.g. 2026-12-01T09:30:00Z>` then `DEVILS_PAYMENTS_ENABLED=true` | Both saved in the same sitting. The start must end in `Z` and must not be in the future, or the build refuses to start |
| 10 | **Redeploy** production | Same as step 7 | Build log shows `live payments enabled for new accounts` |
| 11 | **Check the live site** | www.devils-advocate.app | An account you created earlier can still chat (Billing says your access stays free as an existing member); a brand-new test account sees the 24-hour trial; /api/health returns `configured: true` |
| 12 | Optionally remove your UID from `DEVILS_DODO_TEST_USER_IDS` | Vercel → Production | Not required; it only matters while payments are off |

## If something fails after step 9

Set `DEVILS_PAYMENTS_ENABLED=false` in Vercel → Production and redeploy. Everyone returns to free access straight away; recorded subscriptions are kept, and they keep renewing until canceled. Subscribers still see **Cancel renewal** on the Billing page; to stop all renewals yourself, cancel them in Dodo → Subscriptions.
Fix the failing step, then repeat steps 9–11.

## Why the order matters

- Step 8 happens while payments are off because the app lets only allowlisted accounts check out in that state. That proves the live key, product and webhook before any customer can be charged.
- The build checks that payments can only be on in production, in Dodo live mode, with a valid past `DEVILS_PAID_ACCESS_START`.
- Accounts are counted as "existing" from their first signed-in visit. Someone who registered earlier but first signs in after step 9 is treated as a new account.

More background on the Dodo integration: [Dodo payments setup](dodo-payments-setup.md).
