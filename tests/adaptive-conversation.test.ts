import { describe, expect, it } from 'vitest';
import { ModelOutputSchema, type CasePrep, type ModelInput, type ModelOutput, type TurnAction } from '../src/lib/contracts';
import { DeterministicModel } from '../src/lib/model/deterministic';
import { decisionFocus } from '../src/lib/model/playbooks';
import { caseContext } from '../src/lib/conversation/state';
import { applyAction, startCase } from '../src/lib/case-prep/reducer';
import { createEvidenceService } from '../src/lib/evidence/service';

function input(record: CasePrep, action: TurnAction | 'assessment', text = '', position = ''): ModelInput {
  const turn = action !== 'assessment';
  return {
    session: { id: 's', ownerId: 'o', mode: record.perspective, topic: record.perspective === 'business' ? 'startup' : 'life', title: 'Case', revision: 0, state: { phase: 'clarifying', position, underlyingQuestion: '', clarifications: [], strengths: [], counterpoints: [], openQuestions: [], nextStep: '', usedArgumentIds: [], usedEvidenceIds: [], summary: '', casePrep: record }, messages: [], cards: [], createdAt: '2026-10-15T00:00:00Z', updatedAt: '2026-10-15T00:00:00Z' },
    request: turn ? { operationId: 'op', expectedRevision: 0, text, action } : { operationId: 'op', expectedRevision: 0 },
    task: turn ? 'turn' : 'card',
    evidence: [],
    now: '2026-10-15T00:00:00Z',
    caseContext: caseContext(record, action, turn && ['message', 'correction'].includes(action) ? text : undefined),
  };
}
async function generate(value: ModelInput) {
  const result = await new DeterministicModel().generate(value, new AbortController().signal);
  expect(result.costMicros).toBe(0);
  return ModelOutputSchema.parse(result.output) as ModelOutput;
}
const strong = 'Dental clinics in Porto lose about six hours a week phoning patients. It hurts most on Mondays.';
function answered(ids: number) {
  let record = startCase('business');
  for (let i = 0; i < ids; i++) record = applyAction(record, 'message', strong, { rating: 'strong', quote: 'lose about six hours a week', nextAreaQuestion: 'Next?' }).record;
  return record;
}

describe('simulated AI for case prep', () => {
  it.each([
    ['a short answer', 'Clinics, mostly.'],
    ['a long answer leaning on filler', 'Honestly everyone who runs any kind of clinic would want this one.'],
    ['an unsure answer', 'I am not sure who would pay for this in the end.'],
  ])('rates %s as vague and proposes an echoing follow-up from the area patterns', async (_kind, text) => {
    const output = await generate(input(answered(1), 'message', text));
    expect(output.casePrep).toMatchObject({ rating: 'vague', nextAreaQuestion: 'Roughly how many of those customers exist, and how did you arrive at that number?' });
    expect(output.casePrep!.quote).toBeUndefined();
    expect(output.casePrep!.followUpQuestion).toMatch(/^You said “.+”\. Can you picture the first customer who would pay\?$/);
    expect(output.casePrep!.followUpQuestion!.split('?')).toHaveLength(2);
  });

  it('uses the next follow-up pattern as the area collects follow-ups', async () => {
    let record = answered(1);
    record = applyAction(record, 'message', 'Clinics, mostly.', { rating: 'vague' }).record;
    const output = await generate(input(record, 'message', 'Busy ones.'));
    expect(output.casePrep!.followUpQuestion).toBe('You said “Busy ones”. Can you tell me who signs off on the purchase?');
  });

  it('rates a specific answer strong and quotes its first sentence verbatim', async () => {
    const output = await generate(input(startCase('business'), 'message', strong));
    expect(output.casePrep).toMatchObject({ rating: 'strong', quote: 'Dental clinics in Porto lose about six hours a week phoning patients.', nextAreaQuestion: 'Who exactly feels this problem most, and would pay to make it go away first?' });
  });

  it('proposes the next area opening for "I don\'t know yet" and a rephrased question for pushback', async () => {
    expect((await generate(input(answered(1), 'skip', 'I don’t know yet'))).casePrep).toEqual({ nextAreaQuestion: 'Roughly how many of those customers exist, and how did you arrive at that number?' });
    expect((await generate(input(answered(1), 'pushback', 'Why?'))).casePrep).toEqual({ followUpQuestion: 'Put another way: who exactly feels this problem most, and would pay to make it go away first?' });
  });

  it('invalidates every answered area except the first on a correction', async () => {
    const output = await generate(input(answered(3), 'correction', 'It is for vets, not dentists.'));
    expect(output.casePrep!.invalidatedAreaIds).toEqual(['customer', 'market', 'alternatives']);
    expect(output.casePrep!.nextAreaQuestion).toBe('Now that your position is “It is for vets, not dentists”, who exactly feels this problem most, and would pay to make it go away first?');
  });

  it('asks philosophy areas from their own catalogue', async () => {
    const output = await generate(input(startCase('philosophy'), 'message', 'Maybe I should move.'));
    expect(output.casePrep).toMatchObject({ rating: 'vague', nextAreaQuestion: 'What matters most to you in this choice, if you could protect only one thing?' });
    expect(output.casePrep!.followUpQuestion).toBe('You said “Maybe I should move”. Can you state the choice in one sentence?');
  });

  it('writes template assessment prose from the scores and the supplied evidence', async () => {
    let record = answered(2);
    record = applyAction(record, 'skip', 'I don’t know yet', {}).record;
    const value = input(record, 'assessment', '', 'Clinics pay for a reminder service');
    const prose = (await generate(value)).assessment!;
    expect(prose.statement).toBe('Clinics pay for a reminder service');
    expect(prose.good).toEqual(['Problem and why now: you gave a specific answer in your own words.', 'Who the customer is: you gave a specific answer in your own words.']);
    expect(prose.bad).toEqual(['Still untested: how big the market is.', 'Still thin: what people use today.']);
    expect(prose.mustBeTrue[0]).toMatch(/estimate of how many such customers exist/);
    expect(prose.loopholes).toEqual([]);

    const evidence = await createEvidenceService().retrieve({ mode: 'business', query: 'database developer tools customers pay because costs fall', excludeIds: [], limit: 3 });
    const sourced = (await generate({ ...value, evidence })).assessment!;
    expect(sourced.loopholes.length).toBeGreaterThan(0);
    for (const loophole of sourced.loopholes) {
      const claim = evidence.flatMap(e => e.claims).find(c => c.id === loophole.citations[0].claimId)!;
      expect(loophole.text).toBe(claim.text);
    }
  });
});

it('keeps a subscription business idea in discovery unless pricing is the decision for the general prompt', () => {
  const value = (title: string): ModelInput => { const base = input(startCase('business'), 'message', 'A subscription voice AI assistant for dentists'); return { ...base, session: { ...base.session, title } }; };
  expect(decisionFocus(value('Business idea'))).toBe('business');
  expect(decisionFocus(value('Pricing decision'))).toBe('pricing');
});
