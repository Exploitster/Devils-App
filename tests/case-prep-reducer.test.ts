import { describe, expect, it } from 'vitest';
import { AppError } from '../src/lib/errors';
import { CasePrepSchema, type CasePrep, type CasePrepProposal } from '../src/lib/contracts';
import { findArea } from '../src/lib/case-prep/frameworks';
import { applyAction, assertActionAllowed, assessmentAreas, isComplete, promptContext, startCase, targets } from '../src/lib/case-prep/reducer';

const longAnswer = 'Small dental and medical clinics in Portugal lose hours every week chasing patients who miss appointments, and the receptionist ends up phoning everyone by hand the day before.';

function area(record: CasePrep, id: string) {
  const found = record.areas.find(a => a.id === id);
  if (!found) throw new Error(`missing area ${id}`);
  return found;
}

function answer(record: CasePrep, text: string, proposal: CasePrepProposal) {
  return applyAction(record, 'message', text, proposal);
}

function strong(record: CasePrep, nextAreaQuestion = 'What comes next for you here?') {
  return answer(record, longAnswer, { rating: 'strong', quote: 'lose hours every week chasing patients', followUpQuestion: 'Can you say more about that?', nextAreaQuestion }).record;
}

function vague(record: CasePrep, text = 'Not sure, maybe.') {
  return answer(record, text, { rating: 'vague', followUpQuestion: 'Can you narrow that down to one example?', nextAreaQuestion: 'What comes next for you here?' }).record;
}

function strongThrough(record: CasePrep, untilAreaId: string) {
  let next = record;
  while (next.currentAreaId && next.currentAreaId !== untilAreaId) next = strong(next);
  return next;
}

function completeCase() {
  let record = startCase('business');
  while (record.currentAreaId) record = strong(record);
  return record;
}

describe('starting a case', () => {
  it('builds every catalogue area as not asked and points at the first area', () => {
    const record = startCase('business');
    expect(record.areas.map(a => a.id)).toEqual(['problem', 'customer', 'market', 'alternatives', 'mvp', 'validation', 'money', 'distribution', 'founder']);
    expect(record.areas.every(a => a.status === 'not_asked' && a.followUps === 0 && a.quotes.length === 0)).toBe(true);
    expect(record.currentAreaId).toBe('problem');
    expect(record.complete).toBe(false);
    expect(CasePrepSchema.parse(record)).toEqual(record);
    expect(startCase('philosophy').currentAreaId).toBe('decision');
  });

  it('sends the current area and the next not-asked area to the AI', () => {
    const record = startCase('business');
    expect(targets(record).current?.id).toBe('problem');
    expect(targets(record).next?.id).toBe('customer');
    const context = promptContext(record);
    expect(context.current?.establishes).toBe(findArea('business', 'problem')?.establishes);
    expect(context.next?.id).toBe('customer');
    expect(context.areas[0]).toEqual({ id: 'problem', label: 'Problem and why now', status: 'not_asked', followUps: 0, quotes: [] });
  });

  it('treats the first message as the opening answer to the first area, rated like any answer', () => {
    const result = answer(startCase('business'), longAnswer, { rating: 'strong', quote: 'lose hours every week chasing patients', followUpQuestion: 'Which clinic lost the most hours?', nextAreaQuestion: 'Which clinics feel this most?' });
    expect(area(result.record, 'problem')).toMatchObject({ status: 'strong', quotes: ['lose hours every week chasing patients'] });
    expect(result.record.currentAreaId).toBe('customer');
    expect(area(result.record, 'customer').status).toBe('probing');
    expect(result).toMatchObject({ areaId: 'customer', question: 'Which clinics feel this most?', questionSource: 'ai' });
  });

  it('a case started on a safety or privacy first turn has no answers and scores nothing yet', () => {
    const rows = assessmentAreas(startCase('philosophy'));
    expect(rows).toHaveLength(7);
    expect(rows.every(row => row.score === 'not_covered' && row.nextStep === undefined)).toBe(true);
  });
});

describe('answers and follow-ups', () => {
  it('keeps a vague customer answer probing and asks the narrowing follow-up', () => {
    const atCustomer = strongThrough(startCase('business'), 'customer');
    const result = answer(atCustomer, 'everyone who has a clinic, I guess', { rating: 'vague', followUpQuestion: 'Picture the first clinic that would pay: how many doctors, and where?', nextAreaQuestion: 'How many such clinics exist?' });
    expect(area(result.record, 'customer')).toMatchObject({ status: 'probing', followUps: 1, quotes: ['everyone who has a clinic, I guess'] });
    expect(targets(result.record).current?.id).toBe('customer');
    expect(result).toMatchObject({ areaId: 'customer', question: 'Picture the first clinic that would pay: how many doctors, and where?', questionSource: 'ai' });
  });

  it('treats a weak rating like a vague one', () => {
    const result = answer(startCase('business'), 'Scheduling is annoying for clinics.', { rating: 'weak', followUpQuestion: 'When did a clinic last lose time to this?' });
    expect(area(result.record, 'problem')).toMatchObject({ status: 'probing', followUps: 1 });
    expect(result.question).toBe('When did a clinic last lose time to this?');
  });

  it('marks market weak after its third vague follow-up and moves to alternatives', () => {
    let record = strongThrough(startCase('business'), 'market');
    record = vague(record, 'It is big.');
    record = vague(record, 'Lots of clinics.');
    record = vague(record, 'Probably millions.');
    expect(area(record, 'market')).toMatchObject({ status: 'probing', followUps: 3 });
    const result = answer(record, 'I really cannot say.', { rating: 'vague', followUpQuestion: 'Where would a number come from?', nextAreaQuestion: 'What do clinics use today to remind patients?' });
    expect(area(result.record, 'market')).toMatchObject({ status: 'weak', followUps: 3 });
    expect(result.record.currentAreaId).toBe('alternatives');
    expect(area(result.record, 'alternatives').status).toBe('probing');
    expect(result).toMatchObject({ areaId: 'alternatives', question: 'What do clinics use today to remind patients?', questionSource: 'ai' });
  });

  it('still allows follow-ups after fifteen questions', () => {
    let record = startCase('business');
    let questions = 0;
    for (const id of ['problem', 'customer', 'market', 'alternatives']) {
      expect(record.currentAreaId).toBe(id);
      for (let i = 0; i < 4; i += 1) { record = vague(record); questions += 1; }
    }
    expect(questions).toBe(16);
    const result = answer(record, 'Just an app.', { rating: 'vague', followUpQuestion: 'What could you cut and still test the idea?' });
    expect(area(result.record, 'mvp')).toMatchObject({ status: 'probing', followUps: 1 });
    expect(result.question).toBe('What could you cut and still test the idea?');
  });
});

describe('strong-rating checks', () => {
  it('downgrades a strong rating whose quote is not in the answer and uses the follow-up question', () => {
    const result = answer(startCase('business'), longAnswer, { rating: 'strong', quote: 'clinics pay us twenty euros a month', followUpQuestion: 'Which clinic lost the most hours last week?', nextAreaQuestion: 'Which clinics feel this most?' });
    expect(area(result.record, 'problem')).toMatchObject({ status: 'probing', followUps: 1 });
    expect(result).toMatchObject({ areaId: 'problem', question: 'Which clinic lost the most hours last week?' });
  });

  it('downgrades a strong rating with no quote', () => {
    const result = answer(startCase('business'), longAnswer, { rating: 'strong', followUpQuestion: 'Which clinic lost the most hours?' });
    expect(area(result.record, 'problem').status).toBe('probing');
  });

  it('accepts a quote differing only by curly apostrophes, case or spacing and stores the original text', () => {
    const text = 'We’ve spoken to   Twelve clinic owners in Porto, and nine of them said “yes, today”.';
    const result = answer(startCase('business'), text, { rating: 'strong', quote: "we've spoken to twelve CLINIC owners in porto and nine of them said \"yes today\"", nextAreaQuestion: 'Which of those owners would pay first?' });
    expect(area(result.record, 'problem')).toMatchObject({ status: 'strong', quotes: ['We’ve spoken to   Twelve clinic owners in Porto, and nine of them said “yes, today'] });
    expect(result.question).toBe('Which of those owners would pay first?');
  });

  it('does not match a quote that only appears inside longer words', () => {
    const result = answer(startCase('business'), 'We sell within Portofino and nearby towns to every single clinic owner.', { rating: 'strong', quote: 'in porto' });
    expect(area(result.record, 'problem').status).toBe('probing');
  });

  it('downgrades a strong rating on a three-word answer with no earlier answer in the area', () => {
    const result = answer(startCase('business'), 'Three doctors, Porto.', { rating: 'strong', quote: 'Three doctors, Porto', followUpQuestion: 'What does that clinic struggle with?' });
    expect(area(result.record, 'problem')).toMatchObject({ status: 'probing', followUps: 1 });
    expect(result.question).toBe('What does that clinic struggle with?');
  });

  it('rates a short follow-up answer strong when the area already holds a long answer', () => {
    let record = strongThrough(startCase('business'), 'customer');
    record = vague(record, longAnswer);
    const result = answer(record, 'Three doctors, in Porto.', { rating: 'strong', quote: 'three doctors in porto', nextAreaQuestion: 'How many clinics like that are there in Porto?' });
    expect(area(result.record, 'customer').status).toBe('strong');
    expect(area(result.record, 'customer').quotes.at(-1)).toBe('Three doctors, in Porto');
    expect(result).toMatchObject({ areaId: 'market', question: 'How many clinics like that are there in Porto?' });
  });
});

describe('question checks', () => {
  it('replaces a follow-up with two question marks by the current area fallback', () => {
    const result = answer(startCase('business'), 'Not sure.', { rating: 'vague', followUpQuestion: 'Who has it? And when?' });
    expect(result).toMatchObject({ areaId: 'problem', question: findArea('business', 'problem')?.opening, questionSource: 'fallback' });
  });

  it('replaces a next-area question with no question mark by the next area fallback', () => {
    const result = answer(startCase('business'), longAnswer, { rating: 'strong', quote: 'lose hours every week chasing patients', nextAreaQuestion: 'Tell me about your customer.' });
    expect(result).toMatchObject({ areaId: 'customer', question: findArea('business', 'customer')?.opening, questionSource: 'fallback' });
  });

  it('uses the fallback when the AI gives no question', () => {
    const result = answer(startCase('business'), longAnswer, { rating: 'strong', quote: 'lose hours every week chasing patients' });
    expect(result).toMatchObject({ areaId: 'customer', question: findArea('business', 'customer')?.opening, questionSource: 'fallback' });
  });

  it('replaces a question that hands over a strong-answer signal', () => {
    const atCustomer = strongThrough(startCase('business'), 'customer');
    const result = answer(atCustomer, 'Clinics.', { rating: 'vague', followUpQuestion: 'So is it one specific segment, not everyone?' });
    expect(result).toMatchObject({ areaId: 'customer', question: findArea('business', 'customer')?.opening, questionSource: 'fallback' });
  });
});

describe('skip, pushback and correction', () => {
  it('marks an unanswered area untested at once and moves on', () => {
    const atValidation = strongThrough(startCase('business'), 'validation');
    const result = applyAction(atValidation, 'skip', "I don't know yet", { nextAreaQuestion: 'Who would pay you, and how much?' });
    expect(area(result.record, 'validation')).toMatchObject({ status: 'untested', quotes: [] });
    expect(result.record.currentAreaId).toBe('money');
    expect(result).toMatchObject({ areaId: 'money', question: 'Who would pay you, and how much?' });
    const row = assessmentAreas(result.record).find(r => r.id === 'validation');
    expect(row?.score).toBe('untested');
    expect(row?.nextStep).toContain(findArea('business', 'validation')?.establishes);
  });

  it('marks an area untested on skip even when it already holds an answer', () => {
    const answered = vague(startCase('business'), 'Clinics waste time.');
    const result = applyAction(answered, 'skip', "I don't know yet", {});
    expect(area(result.record, 'problem')).toMatchObject({ status: 'untested', quotes: ['Clinics waste time.'] });
    expect(result.record.currentAreaId).toBe('customer');
  });

  it('keeps the area state and follow-up count on pushback and rephrases the current question', () => {
    const answered = vague(startCase('business'), 'Clinics waste time.');
    const result = applyAction(answered, 'pushback', 'That is a strange question.', { followUpQuestion: 'When did a clinic last lose an afternoon to this?' });
    expect(result.record.areas).toEqual(answered.areas);
    expect(result.record.currentAreaId).toBe('problem');
    expect(result).toMatchObject({ areaId: 'problem', question: 'When did a clinic last lose an afternoon to this?' });
  });

  it('resets the areas a correction invalidates, keeps the rest, and asks the AI question for the earliest one', () => {
    const atAlternatives = vague(strongThrough(startCase('business'), 'alternatives'), 'Spreadsheets.');
    const problemBefore = area(atAlternatives, 'problem');
    const result = applyAction(atAlternatives, 'correction', 'Actually it is for dental practices, not clinics.', { invalidatedAreaIds: ['market', 'customer'], nextAreaQuestion: 'Which dental practices feel this most?' });
    expect(area(result.record, 'problem')).toEqual(problemBefore);
    expect(area(result.record, 'customer')).toEqual({ id: 'customer', status: 'probing', followUps: 0, quotes: [] });
    expect(area(result.record, 'market')).toEqual({ id: 'market', status: 'not_asked', followUps: 0, quotes: [] });
    expect(area(result.record, 'alternatives').status).toBe('not_asked');
    expect(result.record.currentAreaId).toBe('customer');
    expect(targets(result.record).next?.id).toBe('market');
    expect(result).toMatchObject({ areaId: 'customer', question: 'Which dental practices feel this most?', questionSource: 'ai' });
  });

  it('keeps the current area when a correction invalidates nothing', () => {
    const answered = vague(startCase('business'), 'Clinics waste time.');
    const result = applyAction(answered, 'correction', 'I mean dental practices.', { invalidatedAreaIds: [], followUpQuestion: 'When did a dental practice last lose time to this?' });
    expect(result.record.areas).toEqual(answered.areas);
    expect(result).toMatchObject({ areaId: 'problem', question: 'When did a dental practice last lose time to this?' });
  });

  it('uses the fallback when the AI question is for a different area than the one the app resets', () => {
    const answered = vague(startCase('business'), 'Clinics waste time.');
    const result = applyAction(answered, 'correction', 'I mean dental practices.', { invalidatedAreaIds: ['customer'], nextAreaQuestion: 'Which dental practices feel this most?' });
    expect(result.record.areas).toEqual(answered.areas);
    expect(result).toMatchObject({ areaId: 'problem', question: findArea('business', 'problem')?.opening, questionSource: 'fallback' });
  });

  it('refuses a message, skip or pushback on a complete case and leaves the record unchanged', () => {
    const record = completeCase();
    const before = structuredClone(record);
    for (const action of ['message', 'skip', 'pushback'] as const) {
      expect(() => assertActionAllowed(record, action)).toThrow(AppError);
      try { applyAction(record, action, 'More thoughts.', { rating: 'strong', quote: 'More thoughts' }); throw new Error('not refused'); }
      catch (error) { expect(error).toMatchObject({ code: 'CASE_COMPLETE', status: 409 }); }
    }
    expect(record).toEqual(before);
  });

  it('accepts a correction on a complete case and reopens the invalidated area', () => {
    const record = completeCase();
    expect(() => assertActionAllowed(record, 'correction')).not.toThrow();
    const result = applyAction(record, 'correction', 'I would charge per practice instead.', { invalidatedAreaIds: ['money'], nextAreaQuestion: 'What would a practice pay you each month?' });
    expect(result.record.complete).toBe(false);
    expect(result.record.currentAreaId).toBe('money');
    expect(area(result.record, 'money').status).toBe('probing');
    expect(area(result.record, 'distribution').status).toBe('strong');
    expect(result.question).toBe('What would a practice pay you each month?');
  });

  it('asks nothing when a correction on a complete case invalidates nothing', () => {
    const record = completeCase();
    const result = applyAction(record, 'correction', 'Same idea, different words.', { invalidatedAreaIds: [] });
    expect(result.record).toEqual(record);
    expect(result).toMatchObject({ areaId: null, question: null, questionSource: null });
  });
});

describe('completion and the record', () => {
  it('is complete only when every area is strong, weak or untested', () => {
    let record = startCase('philosophy');
    record = strong(record);
    record = applyAction(record, 'skip', "I don't know yet", {}).record;
    for (let i = 0; i < 4; i += 1) record = vague(record);
    while (record.currentAreaId !== 'reversibility') { expect(isComplete(record)).toBe(false); record = strong(record); }
    expect(isComplete(record)).toBe(false);
    record = strong(record);
    expect(record.areas.map(a => a.status)).toEqual(['strong', 'untested', 'weak', 'strong', 'strong', 'strong', 'strong']);
    expect(isComplete(record)).toBe(true);
    expect(record).toMatchObject({ complete: true, currentAreaId: null });
    expect(CasePrepSchema.parse(record)).toEqual(record);
  });

  it('keeps at most three quotes per area and trims long answers to about 500 characters', () => {
    let record = startCase('business');
    const long = `${'word '.repeat(150)}end`;
    record = vague(record, long);
    record = vague(record, 'Second answer.');
    record = vague(record, 'Third answer.');
    record = vague(record, 'Fourth answer.');
    const quotes = area(record, 'problem').quotes;
    expect(quotes).toEqual(['Second answer.', 'Third answer.', 'Fourth answer.']);
    const first = vague(startCase('business'), long);
    const trimmed = area(first, 'problem').quotes[0];
    expect(trimmed.length).toBeLessThanOrEqual(500);
    expect(trimmed.length).toBeGreaterThan(450);
    expect(trimmed.endsWith('…')).toBe(true);
    expect(CasePrepSchema.parse(record)).toEqual(record);
  });

  it('does not change the record it is given', () => {
    const record = startCase('business');
    const before = structuredClone(record);
    strong(record);
    applyAction(record, 'skip', "I don't know yet", {});
    expect(record).toEqual(before);
  });
});

describe('assessment rows', () => {
  it('scores each area from the record with quoted reasons and next steps', () => {
    let record = startCase('business');
    record = strong(record);
    record = applyAction(record, 'skip', "I don't know yet", {}).record;
    for (let i = 0; i < 4; i += 1) record = vague(record, `Vague market answer ${i + 1}.`);
    record = vague(record, 'People use spreadsheets.');
    const rows = assessmentAreas(record);
    expect(rows.map(r => [r.id, r.score])).toEqual([['problem', 'strong'], ['customer', 'untested'], ['market', 'weak'], ['alternatives', 'weak'], ['mvp', 'not_covered'], ['validation', 'not_covered'], ['money', 'not_covered'], ['distribution', 'not_covered'], ['founder', 'not_covered']]);
    const byId = Object.fromEntries(rows.map(r => [r.id, r]));
    expect(byId.problem.label).toBe('Problem and why now');
    expect(byId.problem.nextStep).toBeUndefined();
    expect(byId.problem.reason).toContain('“lose hours every week chasing patients”');
    expect(byId.market.reason).toContain('“Vague market answer 4.”');
    expect(byId.market.nextStep).toContain(findArea('business', 'market')?.establishes);
    expect(byId.alternatives.reason).toBe('Still being explored.');
    expect(byId.alternatives.nextStep).toContain(findArea('business', 'alternatives')?.establishes);
    expect(byId.customer.nextStep).toContain(findArea('business', 'customer')?.establishes);
    expect(byId.mvp.nextStep).toBeUndefined();
  });
});
