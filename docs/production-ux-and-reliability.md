# Production UX and reliability follow-up — 26 October 2026

## This change

Reference: https://exploitster.github.io/devilsadvocate/ (retrieved 26 October).
Existing theme, sections, sign-in, billing and app features are retained.
Added business/philosophy discovery switch, six scripted sample debates with
three clarifying questions, strengths/counterpoints, selectable pushback and
answer-dependent hand-back cards; a seven-step walkthrough; product FAQs;
and homepage navigation to the samples and FAQ.

The reference's waitlist, December opening message, $59 monthly / $150 yearly
plans and unlimited-evidence promises are superseded by the existing working
sign-up and agreed INR 2,000 monthly membership. Hypothetical sample companies
are not imported into the reviewed evidence corpus. Samples are demonstrations,
not live model evaluations. They require no login and store no visitor answers.

Homepage and Billing show optional local-currency estimates. Vercel's country
header suggests currency; browser region is a fallback when no country is
available. Visitors can override it. Public INR rates come from Currency API
via jsDelivr, fetched server-side with a four-second timeout and one-hour cache.
Snapshots older than seven days are rejected. Failure retains the authoritative
INR price. This is an indicative estimate, not Dodo's exchange-rate guarantee.
Dodo checkout already allows currency selection. It determines supported payment
currencies, taxes, methods and the final converted total. No price, trial,
discount, purchasing-power rule or entitlement is changed by this display.

## Production payment boundaries

Owner reports Live dashboard configuration complete. Vercel metadata confirms
Production Dodo API-key, product-ID, environment and webhook-secret records;
secret values have not been retrieved. Actual merchant approval, product settings,
credential authorization and webhook deliveries still need live verification.
Owner explicitly deferred restoring missing Preview payment variables.
Keep public payments disabled. Do not activate a paid plan from display estimates.

Before accepting subscribers:
1. Read back Live Dodo product through an authorized server-side check: INR 200000
   minor units, every one month, lifetime 20 years/240 months, no provider trial,
   no discounts/PPP/fixed localized price overrides.
2. Add a reviewed owner-only live-checkout verification path while public billing
   remains disabled; current code has only a Test Mode allowlist exception.
3. Complete an owner-authorized real payment, signed webhook delivery, invoice,
   entitlement, cancellation and duplicate-delivery checks. A checkout redirect
   alone is not proof of payment. Do not automatically buy a subscription.
4. Agree the launch treatment of existing accounts: a trial measured from original
   account creation would already be expired for older users.
5. Review release guard and paid-access switch together only after verification.

## Chatbot reliability work, in order

1. Build a representative evaluation set: at least 50 business and 50 philosophy
   cases, plus multi-turn corrections, pushback, missing facts, crisis, attempted
   prompt injection and provider failures. Include Indian SMB pricing, local
   demand, work proposals, career decisions and obligations. Record expected
   reasoning qualities rather than a single 'correct' personal decision.
2. Expand reviewed evidence. Current collection has 9 records / 12 exact excerpts;
   business coverage is concentrated in developer/software infrastructure and
   AI evaluation. Add primary-source failure accounts and counterexamples for
   actual target industries. For philosophy, record work, edition, passage,
   permitted quote, contextual interpretation and limitations. Check rights and
   source claims before ingestion. Never substitute the illustrative demo data.
3. Improve retrieval coverage and relevance with reviewed domain/topic tags and
   explicit coverage reporting. Evaluate retrieval before adding semantic search;
   preserve narrow relevance gates, canonical source validation and exclusions
   of already-used evidence. Unsupported topics should say what is unknown.
4. Run the exact production Gateway model and approved fallback through those
   cases with a bounded budget. Existing offline tests use deterministic responses;
   the current `eval:live` runner is Gemini-specific and is not a production
   Gateway quality benchmark. Adapt the harness to the configured provider.
5. Score usefulness: preserves user facts, asks only missing high-value questions
   (maximum three), strengths first, relevant counterarguments, accurate source
   support, corrections honored, no repetitive pushback, actionable reversible
   test with success/stop criteria, no final verdict. Human-review samples from
   both verticals. Proposed release gates: zero fabricated citations or altered
   user facts in the release set; at least 90% pass on the remaining rubric.
6. Keep citation validation strict. The current check enforces canonical IDs,
   exact permitted quotes, supported claim text and retrieved evidence membership.
   A provider change does not justify weakening it. Record categorized validation
   failures without logging private conversations, then repair the model's output
   contract or evidence mapping and rerun regression cases.
7. Monitor real operation: response latency, provider errors, exhausted budget,
   citation rejection, empty retrieval and user-rated helpfulness. Add retries
   only where idempotent and bounded; preserve input when a request fails.
8. Review unit economics before launch. The configured global $0.25/day AI cap is
   an MVP safeguard, not capacity for paying customers. Measure actual cost per
   conversation and set explicit daily/per-user budgets and alerts with the owner.

Verification completed locally: 13 offline contract cases and all 9 evidence
records verified. These do not certify current live model quality or availability.
