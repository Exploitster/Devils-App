---
title: Case Prep Conversation - Plan
type: feat
date: 2026-11-08
topic: case-prep-conversation
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-brainstorm
execution: code
---

# Case Prep Conversation - Plan

## Goal Capsule

- **Objective:** A person who brings a business idea or a personal decision does the thinking themselves. They answer guiding questions area by area, and finish with an assessment that shows which parts of their reasoning are strong, weak or untested.
- **Means:** Replace today's describe, clarify, debate and card flow with a case-prep conversation. Areas are tracked, questions adapt to the person's own words, and an assessment document closes the session.
- **Product authority:** The decisions below were made by the owner in the brainstorm. Bring-your-own-AI, the owner knowledge library and the business-case corpus are not active scope here (see How This Work Fits Together).
- **Open blockers:** None.

---

## Product Contract

### Summary

Every new conversation becomes case prep. The assistant works through a fixed set of areas, nine for a business idea and seven for a personal decision. It asks one simple guiding question at a time, built on the person's own words, and probes weak answers until they are solid or the person says they don't know yet. Once every area is covered, the person receives an assessment document. It scores each area, names the loopholes, the good and the bad, and what must be true. It leaves the decision with them.

### Problem Frame

Today a conversation asks at most three clarifying questions and then argues back with sourced counterpoints. The assistant does most of the thinking, and the person reads it. Founders and people facing a hard choice learn little from being told what is wrong. What changes their thinking is being made to answer the questions an experienced mentor or case interviewer would ask: who exactly is this for, how do you know, what did you test. The current flow skips most of those questions, so ideas leave the conversation with untested assumptions the person never had to confront.

### Key Decisions

- **Case prep first; connecting your own AI is the next plan.** Payments are still off, so everyone already uses the app for free; the guided conversation is the product's core value. (session-settled: user-directed — chosen over building bring-your-own-AI first or both together: core value before a free-usage path that matters only once payments are on.)
- **Case prep replaces the current flow.** Sourced counterpoints move into the assessment's loopholes section. Governs R1, R16. (session-settled: user-directed — chosen over a separate case-prep option beside the quick debate, and over questions followed by the debate: one clear experience.)
- **A full case, not a quick check.** A typical session runs about 10-15 questions, and follow-ups may take it further. Governs R8. (session-settled: user-directed — chosen over a short 5-7 question check and over an open-ended adaptive length.)
- **Follow-ups always win over session length.** Governs R6, R8. (session-settled: user-directed — chosen over a hard cap near 15 questions and over letting the person pick quick or deep at the start.)
- **Weak answers are probed until solid, with an escape hatch.** Governs R6, R7. (session-settled: user-directed — chosen over one nudge then move on, and over accepting the answer silently; up to 3 follow-ups plus "I don't know yet" was chosen over either limit alone.)
- **The assessment judges each area but gives no go/no-go.** "Your call. Always." stays. Governs R13, R14. (session-settled: user-directed — chosen over an explicit Go / Don't go / Test first verdict and over a labelled recommendation: keeps the product's promise and the current spec.)
- **Nine business areas and seven philosophy areas.** Governs R2, R3. (session-settled: user-directed — the business list was chosen over covering only the five areas named in the request; the philosophy list was chosen over a lighter 5-8 question variant.)
- **Tracked areas with adaptive questions.** The app tracks each area's state and enforces coverage, follow-up limits and "I don't know yet". The assistant writes each question from the conversation. Governs R4, R5, R6, R7, R8. (session-settled: user-directed — chosen over a scripted question bank and over a pre-mortem-first order.)
- **Question frameworks plus licensed forum threads, not scraped forums.** Governs R17, R18. (session-settled: user-directed — chosen over frameworks only and over scraping Reddit or Quora, whose terms forbid it.)
- **Success means people come back.** Governs R21. (session-settled: user-directed — chosen over completion rate, answers getting sharper, and conversion to paid.)
- **A correction re-judges, it does not restart.** When the person corrects their position, earlier answers stay visible. The assistant re-asks only the areas whose answers no longer fit the new position. Governs R10.

### Requirements

**The case-prep conversation**

- R1. Every new conversation, in both perspectives, runs as case prep: each assistant turn asks one guiding question rather than giving analysis or answers.
- R2. A business case covers nine areas, in this order: the problem and why now; who the customer is; market size; what people use today (alternatives and competitors); the MVP; how it was validated (evidence, not opinions); how it makes money; how it reaches customers; and why this founder.
- R3. A personal-decision case covers seven areas: what is really being decided; what matters most (values); options not yet considered; assumptions; who else is affected; what they would regret; and how reversible the choice is.
- R4. Each question is short, in plain language, about one thing, and built on the person's own earlier words. It points the person's thinking somewhere without containing the answer.
- R5. Each area has one of five states, which the assistant decides after every answer: not asked, probing, strong, weak, or untested.
- R6. A vague or weak answer gets a follow-up that narrows it, up to three follow-ups per area. An area still weak after three follow-ups is recorded as weak and the case moves on.
- R7. Every question offers an "I don't know yet" reply. It marks the area untested at once and moves to the next area.
- R8. Every area gets at least one question before the case counts as complete, and follow-ups are never cut short because the session has passed 15 questions.
- R9. The person can always see which areas are done and which remain, and the state of each finished area.
- R10. Push back and correct my position stay available during questioning, and a correction re-asks only the areas whose earlier answers no longer fit.
- R11. The person can ask for the assessment at any time. Areas never asked then show as "not covered".

**The assessment document**

- R12. When every area is covered, the assistant produces the assessment document without being asked and tells the person it is ready.
- R13. The assessment contains:
  - a one-line statement of the idea or decision;
  - each area's score (strong, weak, untested or not covered) with a one-sentence reason that quotes the person's answer;
  - loopholes, including up to three source-backed counterpoints under today's evidence rules;
  - what is good and what is bad;
  - what must be true for it to work;
  - one suggested next step for each weak or untested area;
  - the closing "Your call. Always.".
- R14. The assessment never gives an overall verdict, a go/no-go, a score out of 10, or a probability of success.
- R15. The assessment is saved with the conversation, opens from history, and downloads as Markdown, like today's hand-back card.
- R16. New conversations produce the assessment in place of the hand-back card, and conversations saved before this change stay readable as they are.

**Knowledge behind the questions**

- R17. Each area has a written question framework for both perspectives, drawn from established methods (customer discovery, case-interview structure, classic philosophical questions). It states what the area must establish, what a strong answer shows, and typical follow-ups.
- R18. The source library gains a first reviewed set of Stack Exchange threads from the Startups and Philosophy sites. They are used under CC BY-SA with attribution and go through the same review and licence process as today's sources.
- R19. Questions may draw on the frameworks and the reviewed library. Any claim cited in the assessment comes only from reviewed sources, as today.
- R20. The product spec and bot-behaviour docs describe case prep in place of the three-clarifying-questions-then-debate flow.

**Measuring success**

- R21. The owner can see what share of people who complete a case start another one within 30 days. This is worked out from saved conversations, with no new tracking inside the app.

### Key Flows

- F1. Business case-prep session
  - **Trigger:** A person starts a conversation with a business idea.
  - **Steps:**
    - The assistant asks about the problem first, then works through the remaining areas in order.
    - Each answer updates its area's state. Weak answers get narrowing follow-ups, and "I don't know yet" skips ahead.
    - Progress stays visible throughout.
    - When the last area is covered, the assessment arrives in the thread.
  - **Outcome:** An assessment scoring all nine areas, saved with the conversation.
  - **Covered by:** R1, R2, R4, R5, R6, R7, R8, R9, R12, R13.
- F2. Early assessment
  - **Trigger:** The person asks for the assessment before every area is covered.
  - **Steps:**
    - The assistant produces the assessment from the answers so far.
    - Areas never asked are marked "not covered".
    - The person can carry on answering afterwards and request an updated assessment.
  - **Covered by:** R11, R13.

### Acceptance Examples

- AE1. **Covers R6.**
  - **Given:** the customer area.
  - **When:** the founder answers "everyone who has a clinic, I guess".
  - **Then:** the next question narrows it, for example "Picture the first clinic that would pay: how many doctors, and where?", and the area stays in probing.
- AE2. **Covers R6.**
  - **Given:** three follow-ups on the market area still produce no figure or reasoning.
  - **When:** the third follow-up is answered vaguely.
  - **Then:** the market area is recorded as weak and the next question moves to alternatives and competitors.
- AE3. **Covers R7.**
  - **When:** the founder taps "I don't know yet" on the validation question.
  - **Then:** validation is marked untested at once.
  - **And:** the assessment later suggests one way to find out, such as five customer interviews.
- AE4. **Covers R11.**
  - **Given:** five of nine areas are covered.
  - **When:** the person asks for the assessment.
  - **Then:** the assessment scores those five and marks the other four "not covered".
- AE5. **Covers R10.**
  - **Given:** the customer and market areas are answered.
  - **When:** the founder corrects their position from clinics to dental practices.
  - **Then:** the customer and market areas are asked again, and the problem area keeps its earlier answer.
- AE6. **Covers R14.**
  - **Given:** every area is weak.
  - **When:** the assessment is written.
  - **Then:** it lists the weaknesses and next steps but does not say "don't do this".
- AE7. **Covers R16.**
  - **When:** someone opens a conversation saved last month.
  - **Then:** they see the old thread and hand-back card as before.

### Success Criteria

- Within a month of launch, the share of people who start a second case within 30 days of completing one is visible to the owner and is the headline measure (R21).
- Questions read as a mentor would ask them: one idea each, built on the person's words, and never containing the answer. Offline evaluation cases check this for both perspectives.

### Scope Boundaries

**Deferred for later**

- Connecting your own ChatGPT, Claude or Gemini (the next plan).
- The owner knowledge library (uploading books and notes) and a curated business-case corpus.
- A pre-mortem opening question ("it's a year later and this failed; why?").
- A per-person limit on AI usage; the existing daily spend limit is the only cost guard.
- Scores that compare a person against other founders.

**Outside this product's identity**

- A go/no-go verdict, win probability or overall score.
- Content scraped from forums whose terms forbid reuse, such as Reddit and Quora.

<!-- ce-section: work-relationships -->
### How This Work Fits Together

This plan covers the case-prep conversation. The areas below are the current understanding, not a committed roadmap.

- Bring your own AI: people connect their ChatGPT, Claude or Gemini and use the app without paying.
  - Can proceed independently of this plan.
  - Shares the conversation engine this plan reshapes.
  - Still to decide: what "one click" can honestly mean per provider, since consumer chat subscriptions cannot be used by other apps. API keys, or a sign-in through a router service, are the realistic routes.
- Owner knowledge library: uploaded books and notes that the question frameworks and assessments can draw on.
  - Enables richer frameworks for this plan's areas later.
  - Still to decide: which sources can be used under their terms.

### Dependencies / Assumptions

- A live AI provider is configured in production. Each question is one AI call, so a full case costs several times a chat turn today, and the existing daily spend limit is the cost guard.
- Stack Exchange content is available under CC BY-SA with attribution to the author and a link to the source.
- Existing conversations keep their stored state. Nothing is migrated.

### Outstanding Questions

**Deferred to Planning**

- How many Stack Exchange threads make up the first reviewed set, and how they are picked.
- Whether an assessment regenerates automatically when the person changes an earlier answer, or only on request.
- Expected AI cost of a full case, and whether that changes the daily spend limit default.
- Where the return-rate figure is shown to the owner (an admin view, a script, or a report).

### Sources / Research

- Current conversation phases and question cap: `src/lib/contracts.ts` (phase enum, clarifications max 3) and `src/lib/conversation/state.ts` (one new clarification per response, three total).
- Model rules forbidding verdicts and capping clarifications: `src/lib/model/provider.ts`.
- Product rule against verdicts: `docs/specs/devils-advocate-brief.txt` (lines 20, 139, 305).
- Hand-back card shape: `src/lib/contracts.ts` (`HandBackCardSchema`).
- Evidence review and licence process: `docs/evidence.md`, `data/evidence/seed.json`, `scripts/evidence-import.ts`.
- Analytics run only on public pages after consent: `src/lib/analytics-consent.ts` (why R21 uses saved conversations).
- Prior plan that named bring-your-own-AI as future work: `docs/plans/2026-11-07-1259-feat-ui-simplification-and-payments-go-live-plan.md`.
