import { describe, expect, it } from 'vitest';
import { areasFor, parseQuestionSet } from '../src/lib/case-prep/frameworks';
import { SessionStateSchema } from '../src/lib/contracts';

const legacyState = { phase: 'debate', position: 'Open a cafe', underlyingQuestion: 'Will locals pay?', clarifications: [], strengths: ['Clear goal'], counterpoints: [], openQuestions: ['Who?'], nextStep: 'Talk to five locals.', usedArgumentIds: [], usedEvidenceIds: [], summary: '' };

describe('case-prep area catalogue', () => {
  it('lists the nine business areas in order', () => {
    expect(areasFor('business').map(area => area.id)).toEqual(['problem', 'customer', 'market', 'alternatives', 'mvp', 'validation', 'money', 'distribution', 'founder']);
  });

  it('lists the seven philosophy areas', () => {
    expect(areasFor('philosophy').map(area => area.id)).toEqual(['decision', 'values', 'options', 'assumptions', 'others', 'regret', 'reversibility']);
  });

  it('passes the question-set rules for both built-in sets, keeping every id', () => {
    for (const mode of ['business', 'philosophy'] as const) expect(parseQuestionSet(areasFor(mode))).toEqual(areasFor(mode));
  });
});

const area = (label: string, change: Partial<Record<'id' | 'establishes' | 'opening', string> & Record<'followUps' | 'strongSignals', string[]>> = {}) => ({
  label, establishes: `What ${label} must establish.`, opening: `What about ${label.toLowerCase()}?`, followUps: ['Ask for an example.'], strongSignals: ['names a real example'], ...change,
});
function rejection(input: unknown): string {
  try { parseQuestionSet(input); } catch (error) { expect(error).toMatchObject({ code: 'INVALID_QUESTION_SET', status: 400 }); return (error as Error).message; }
  throw new Error('accepted');
}

describe('question-set rules', () => {
  it('needs between 1 and 12 areas', () => {
    expect(rejection([])).toBe('A question set needs between 1 and 12 areas; this one has 0.');
    expect(rejection(Array.from({ length: 13 }, (_, index) => area(`Area ${index + 1}`)))).toBe('A question set needs between 1 and 12 areas; this one has 13.');
    expect(parseQuestionSet(Array.from({ length: 12 }, (_, index) => area(`Area ${index + 1}`)))).toHaveLength(12);
  });

  it('needs each opening to be one question ending in a question mark', () => {
    expect(rejection([area('Pricing', { opening: 'Tell me about your price.' })])).toBe('“Pricing”: the opening must be one question ending in “?”.');
    expect(rejection([area('Pricing', { opening: 'What do you charge? And why?' })])).toBe('“Pricing”: the opening must be one question ending in “?”.');
  });

  it('needs at least one follow-up and one sign of a strong answer, ignoring blank lines', () => {
    expect(rejection([area('Pricing', { followUps: [] })])).toBe('“Pricing”: add at least one follow-up.');
    expect(rejection([area('Pricing', { followUps: ['  '] })])).toBe('“Pricing”: add at least one follow-up.');
    expect(rejection([area('Pricing', { strongSignals: [] })])).toBe('“Pricing”: add at least one sign of a strong answer.');
  });

  it('needs unique area names, ignoring letter case and spacing', () => {
    expect(rejection([area('Pricing'), area(' pricing ')])).toBe('“pricing”: another area already has this name.');
  });

  it('names a missing field by its area', () => {
    expect(rejection([area('Pricing', { establishes: '' })])).toBe('“Pricing”: fill in what the area must establish.');
    expect(rejection([{ ...area('x'), label: '' }])).toBe('Area 1: give the area a name.');
  });

  it('gives a new area a unique id from its name and keeps the id of a kept area when it is renamed', () => {
    const parsed = parseQuestionSet([area('The real problem', { id: 'problem' }), area('Unit économics!'), area('Problem')]);
    expect(parsed.map(item => item.id)).toEqual(['problem', 'unit-economics', 'problem-2']);
    expect(parsed[0].label).toBe('The real problem');
  });
});

describe('session state with a case record', () => {
  it('still accepts a conversation saved before case prep', () => {
    expect(SessionStateSchema.safeParse(legacyState).success).toBe(true);
  });

  it('accepts a full case record with an assessment', () => {
    const state = {
      ...legacyState,
      phase: 'clarifying',
      casePrep: {
        perspective: 'business',
        areas: [{ id: 'problem', status: 'strong', followUps: 1, quotes: ['Clinics lose two hours a day to phone bookings.'] }],
        currentAreaId: null,
        complete: true,
        qualifiedNoticeShown: false,
        completedAt: '2026-11-08T10:00:00.000Z',
        assessment: { id: 'a1', createdAt: '2026-11-08T10:00:00.000Z', complete: true, statement: 'An AI booking assistant for clinics.', areas: [{ id: 'problem', label: 'Problem and why now', score: 'strong', reason: 'Clinics lose two hours a day.' }], good: [], bad: [], mustBeTrue: [], loopholes: [], closing: 'Your call. Always.' },
      },
    };
    expect(SessionStateSchema.safeParse(state).success).toBe(true);
  });

  it('rejects an unknown area status', () => {
    const state = { ...legacyState, casePrep: { perspective: 'business', areas: [{ id: 'problem', status: 'maybe', followUps: 0, quotes: [] }], currentAreaId: 'problem', complete: false, qualifiedNoticeShown: false } };
    expect(SessionStateSchema.safeParse(state).success).toBe(false);
  });
});
