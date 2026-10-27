# Vercel AI Gateway MVP

Gateway is opt-in with DEVILS_MODEL_PROVIDER=gateway. Existing Gemini and OpenRouter keys remain unchanged. Payments remain disabled.

Vercel deployments authenticate using fresh OIDC tokens through @vercel/oidc. Local development may use a separate AI_GATEWAY_API_KEY stored securely; never expose it to the browser.

The reviewed model is google/gemini-2.5-flash through the vertex provider. Before preview deployment, run npm run test:gateway -- --confirm-live in Vercel's environment. This checks account eligibility, provider privacy flags and price caps before making synthetic conversations and decision cards. It stops on failure and reserves at most $0.25 for the run. Account credit eligibility can change; a $5 balance does not guarantee access to every model.

Requests retain the existing strict citation validator. Models choose evidence references; the server inserts reviewed quotations. Unknown references are rejected. Missing billed cost retains the full conservative reservation in the daily budget; reported cost can therefore exceed actual Vercel charges. The Gateway dashboard is authoritative for billing.

The integration does not enable auto recharge or app payments, guarantee uninterrupted service, or activate Vercel's paid ZDR policy. Provider routing is pinned to the reviewed provider. A failed live check blocks the preview build. Production should not be promoted until authentication, persistence and complete user flows are verified.

The checked-in Vercel build configuration runs live synthetic verification before building whenever Gateway is selected. These deployment checks consume some AI credit. Requests respect Retry-After on HTTP 429, with a conservative one-minute fallback and one retry bounded by cancellation and the generation deadline. This reduces transient failures; free-tier quotas and provider outages can still interrupt service.

Clarification regression: providers sometimes include valid source citations alongside a question. The adapter validates those references, and the controller removes response citations when replacing that response with the single clarification question. Retained counterpoints still pass canonical source validation. Unknown source references remain rejected.
