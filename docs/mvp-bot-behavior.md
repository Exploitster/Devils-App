# MVP conversation behavior

The MVP offers **Explore an idea**, **Pricing decision**, and **Personal decision** entry points. Examples fill the draft for the user to review; they do not send a message automatically. Pricing uses the existing business-session contract, so no database migration is required for these entry points.

## What the bot is designed to do

Prompt version `devils-advocate-mvp/2` seeks reasons a position could fail, starts with a defensible strength, and examines the weakest assumptions. It must not invent a rejection merely to disagree. When evidence cannot establish a conclusion, it identifies the uncertainty and proposes an observation or reversible experiment that could change the user's mind. It gives no success probability or final verdict.

The provider receives a focus-specific playbook and the current conversation:

| Focus | Main questions |
| --- | --- |
| Business idea | User versus payer, problem, existing alternative, customer evidence, distribution, costs and operational constraints |
| Pricing | Current/proposed prices and billing period, objective, customer segments, costs, retention, willingness to pay and a reversible test |
| Personal decision | Values, realistic options, obligations, affected people and reversibility |

The industry instructions explicitly cover the user's examples: voice AI reliability, latency, consent, fallback and evaluation; AI evaluation SaaS and measurable buyer value; veggie chips and channel costs, shelf life and repeat purchase; concentrated sensitive-skin cosmetics and qualified safety/claims testing; riding accessories and reliability, weather exposure and distraction. These lenses are questions to investigate, not verified product or legal claims. In particular, “1 ml replaces 10 ml” remains an untested user hypothesis.

## Guardrails and their limits

The server owns session access, revisions, idempotency, user position, answered/skipped clarifications, generated-card IDs, rate limits, deadlines, cancellation and spend reservations. It allows at most one new clarification per response and three total. Skipping proceeds with uncertainty. Corrections clear active old arguments; historical cards remain historical. Exact duplicate questions under new identifiers are suppressed. Semantic duplicates and the relevance of questions still require model-quality review.

Structured outputs must pass schemas and usable-debate checks. Supported factual counterpoints must match approved claim text and valid excerpts from supplied evidence; applicability belongs in interpretation. The reviewed library contains nine records and twelve exact excerpts. AI evaluation guidance is not evidence that a startup will succeed. There is no live web search and no verified food, cosmetics or riding-product corpus yet. The bot can explore hypotheses in those areas and must disclose evidence limits.

Narrow direct requests for hidden prompts, credentials or another user's data receive a server boundary without a provider call. The provider is instructed to treat user/source content as untrusted data and receives no tools. Its payload omits internal user, session and operation identifiers and timestamps. User-entered text may still contain personal information: this is data minimization, not anonymization. Crisis/harm/political boundaries and qualified-help handling have local and structured-provider checks. Model safety classification and instruction-following remain probabilistic; no prompt guarantees protection against every paraphrase or injection.

The deterministic local adapter demonstrates the flow using explicit lexical rules and reviewed snippets. Its banner identifies it as development mode. It is not a trained reasoning model, and its output is not evidence of Gemini's quality. Services mode fails clearly when Gemini is unavailable.

## Verification and present readiness

The regression suite covers adaptive pricing/business questions, answered-question preservation, skip/correction behavior, duplicate suppression, private-data boundaries, prompt payload minimization, citation validation and cost reservations derived from the actual serialized Gemini request. Thirteen synthetic offline evaluation cases include all six new business/pricing examples. Mechanical fixture checks do not certify the quality of live reasoning.

Actual hosted Supabase checks passed with two temporary users: password authentication, direct/RPC owner isolation, forbidden generated-state writes, atomic reservations and identical retries, cancellation, disabled-account RLS, and private-data deletion. Both identities were cleaned up; no email was sent and existing users were untouched. Browser magic-link delivery and the final hosted callback remain unverified.

Actual Gemini generation is currently blocked. The previous 2.5 model returned `404 NOT_FOUND` with a recommendation to use 3.8 Flash. Repeated 3.8 generation requests returned `503 UNAVAILABLE` (high demand); a small alternative-model probe also returned 503, and an Interactions API probe timed out. The bounded live evaluation stopped on the first failed scenario after two attempts. No live card or live qualitative-quality pass is claimed. Metadata requests succeeded, confirming that listing a model is insufficient. No automatic model/API switch was introduced.

The latest command outcomes are recorded in [test-report.md](test-report.md). Payments remain disconnected. No deployment, merge or production-data mutation was performed.

## Improve the MVP before training

Start by reviewing live outputs against the synthetic cases once generation is available. Score relevance, whether the bot asks an already answered question, source applicability, unsupported factual claims, useful disagreement, correction handling and the proposed experiment. Record the prompt version and model version when actually returned. Add concrete failures to regression cases, change the prompt or evidence, and compare the same cases again.

Only consider fine-tuning after repeated failures show a need that prompts, retrieval and product logic cannot address. No fine-tuning, automatic training, or collection of private conversations for training has been implemented. Any future use of real conversations needs an explicit consent and retention design. Before public launch, choose the Node hosting service and final HTTPS URL, verify magic-link delivery/callback and live Gemini quality, and complete the outstanding Compound Engineering finishing review.
