# OpenRouter setup and verification

The app supports OpenRouter alongside the existing direct Gemini adapter. Switching providers does not delete or replace the Gemini key. Payments remain disabled. Local mode still uses the explicitly labeled deterministic adapter.

## Browser setup

1. Sign in at https://openrouter.ai/.
2. Check https://openrouter.ai/settings/credits. Paid models require sufficient credits. Buying AI credits does not enable customer payments inside this app.
3. At https://openrouter.ai/settings/keys create a key named **Devils Advocate Preview**, with an account spending limit you are comfortable with. Keep the value private.
4. Open Vercel → Exploitster → devils-app → Settings → Environment Variables. Add `DEVILS_OPENROUTER_API_KEY`, paste the key, select **Preview** only, and mark it Sensitive.
5. After the new application code is deployed, set `DEVILS_MODEL_PROVIDER=openrouter` for Preview. Retain all existing Supabase, Gemini, app URL and payment settings. Do not create `NEXT_PUBLIC_` versions of any private keys.
6. Keep `DEVILS_PAYMENTS_ENABLED=false`. No Stripe setup is required.
7. Redeploy the new code as Preview. Vercel's Redeploy button rebuilds that deployment's source; redeploying an old Gemini-only deployment does not upload these code changes.
8. Keep `DEVILS_APP_URL` and Supabase's allowed `/auth/callback` URL aligned with the actual preview origin. A new deployment gets a new URL; a tested stable preview alias avoids repeating callback changes. Do not promote an unverified build.

Only two new settings are required: `DEVILS_OPENROUTER_API_KEY` and `DEVILS_MODEL_PROVIDER=openrouter`. The other OpenRouter values have defaults:

| Setting | Default | Purpose |
| --- | --- | --- |
| `DEVILS_OPENROUTER_MODEL` | `openai/gpt-5.4-mini` | Primary model |
| `DEVILS_OPENROUTER_FALLBACK_MODELS` | `anthropic/claude-haiku-4.5` | Approved backup; blank disables model fallback |
| `DEVILS_OPENROUTER_MAX_INPUT_USD_PER_MILLION` | `1` | Enforced input-token price ceiling |
| `DEVILS_OPENROUTER_MAX_OUTPUT_USD_PER_MILLION` | `5` | Enforced output-token price ceiling |

Gemini's `DEVILS_MODEL` and `DEVILS_MODEL_*_USD_PER_MILLION` values are ignored while OpenRouter is selected. This avoids using stale Gemini rates for another model. The default ceilings cover the reviewed standard GPT-5.4 Mini and Haiku 4.5 rates checked October 16, 2026, but availability, pricing and account terms can change. Price changes above the caps fail closed; the app never raises caps or selects new models automatically.

## Automatic handling

- OpenRouter can route the explicit model list across compatible providers. The request requires structured JSON support, disallows data-collecting providers and requests zero-data-retention endpoints. These routing restrictions can reduce availability; they are not a guarantee about every service's terms.
- The engine permits at most two HTTP attempts, with a short randomized delay after transient network, rate-limit or server errors, under one cancellation signal and deadline. Authentication, credits, configuration and invalid-answer failures do not trigger a quota-burning retry sweep.
- Each HTTP attempt is reserved before invocation. The serialized OpenRouter request and price ceilings bound the reservation. Known billed USD cost is reconciled even if the answer is rejected. Unknown charges retain their reservation. OpenRouter's reported completion-token count already includes reasoning tokens.
- Source references are resolved by the server. The model cannot supply quotation text, supported counterpoint text, authority IDs or final cards. The engine validates the resulting answer against the canonical corpus before saving it. Source applicability and uncited prose still require quality evaluation.
- Malformed answers, unknown sources, refusals and truncation fail without changing the conversation. A provider outage cannot be repaired by declaring a fixture successful.
- Existing CI runs the provider contract and engine integration tests automatically when this code is pushed. No recurring paid live monitor or automatic production promotion has been activated.

These measures reduce common failures; they cannot guarantee uninterrupted service or perfectly accurate reasoning.

## Live verification

The development environment needs outbound HTTPS permission for `openrouter.ai` and a secure `DEVILS_OPENROUTER_API_KEY` binding restricted to that host. Do not reuse the Gemini binding or paste a platform proxy placeholder into Vercel. Saving a key in Vercel does not make it available in the development workspace.

After those bindings exist:

```sh
npm run test:openrouter -- --confirm-live
```

The check verifies model/catalog availability, structured-output support and price caps, then exercises synthetic business, philosophy and limited-evidence conversations through the real adapter, engine, canonical evidence validation and an in-memory store. It stops on the first failure, has an estimated $0.25 run budget, writes a unique sanitized report under ignored `.local/evaluations/`, and never touches hosted user records or sends sign-in emails. This does not certify magic-link delivery or qualitative answer quality. `/api/health` checks configuration only and never spends model credits.

Before release, run typecheck, lint, tests and a production build; verify real sign-in/callbacks and review the live model's source applicability, corrections, safety and cards. Observe sanitized generation failures and known costs in Vercel logs during preview testing. Leave production on its tested build until preview acceptance passes. To roll back provider selection, set `DEVILS_MODEL_PROVIDER=gemini` and redeploy the tested Gemini build with its retained configuration; Gemini's prior availability problems may still apply.

References: [structured outputs](https://openrouter.ai/docs/guides/features/structured-outputs), [model fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks), [provider routing](https://openrouter.ai/docs/guides/routing/provider-selection), [GPT-5.4 Mini](https://openrouter.ai/openai/gpt-5.4-mini), [Haiku 4.5](https://openrouter.ai/anthropic/claude-haiku-4.5/).
