> Historical Gateway deployment record. For the newer free public UI/auth implementation and current launch status, see [ui-auth-verification.md](ui-auth-verification.md). The earlier invited-user requirement below is superseded by public signup.

# Gateway preview verification — 2026-10-16

Preview: https://devils-advocate-preview-exploitster1.vercel.app
Deployment: dpl_8TKCivxHeKw1m1M6YdGCSk6yN3Hk (READY)
Immutable URL: https://devils-1keu3qsmf-exploitster1.vercel.app
Project: devils-app / prj_RtFOuKfu3erBBiaiU7uIuvGPndEt
Team: exploitster1 / team_B9l2Lu20MEEzgSApa7BsJJAW

Verified on Vercel: fresh OIDC authentication to AI Gateway; account HTTP availability; model eligibility; Gemini 2.5 Flash via Vertex endpoint privacy/price/schema capabilities; complete synthetic business, philosophy and limited-evidence conversations and decision cards through the real engine, canonical citation validation and in-memory storage. A real 429 with Retry-After: 26 recovered automatically. Hosted preview health and unauthenticated auth endpoints returned 200; login page rendered.

Local validation: 142 tests passed, one skipped; typecheck and production build passed; lint had no errors and one pre-existing warning in .local/diagnostics/gemini-schema-bounds.ts.

Preview settings: Gateway provider, global daily budget 250000 microdollars ($0.25), stable preview app URL. Payments remain false. Existing API keys were not replaced. Original 0410267 and 6410618 commits remain; f54b0f9 was not found. Local CLI still has no saved login; the authenticated connector and deployment OIDC work without it.

The deployed source contains an explicit preview-only vercel.json with Gateway, payments=false, daily budget and app URL overrides plus the live preflight build command. The local checked-in configuration instead runs that preflight conditionally when Gateway is selected; project Preview variables now supply the settings. Source was uploaded, not pushed to GitHub. Local Gateway changes remain uncommitted. Production remains the earlier starter deployment, and remote main remains the starter commit.

Outstanding: add https://devils-advocate-preview-exploitster1.vercel.app/auth/callback to Supabase Authentication URL Configuration redirect URLs. Then verify a real invited-user sign-in, hosted persistence and browser conversation flow. Vercel deployment protection remains enabled. Synthetic checks used no hosted users or hosted conversation records. Do not declare the entire app production-ready until the outstanding checks pass. Do not promote the starter Git source.

Earlier candidates: GPT-5.4-mini was plan restricted; native Google Gemini route did not advertise endpoint ZDR; Mistral and Qwen checks exposed validation/quality failures. Do not resume those candidate tests without reason. The cited-clarification failure is fixed by validating selected references and clearing response citations only when the controller replaces the entire response with the clarification question. Retained counterpoints remain canonically validated; unknown source references are still rejected. Raw model-authored quotations are never used as citation authority.
