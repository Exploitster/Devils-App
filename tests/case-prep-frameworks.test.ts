import { describe, expect, it } from 'vitest';
import { areasFor } from '../src/lib/case-prep/frameworks';
import { SessionStateSchema } from '../src/lib/contracts';

const legacyState = { phase: 'debate', position: 'Open a cafe', underlyingQuestion: 'Will locals pay?', clarifications: [], strengths: ['Clear goal'], counterpoints: [], openQuestions: ['Who?'], nextStep: 'Talk to five locals.', usedArgumentIds: [], usedEvidenceIds: [], summary: '' };

describe('case-prep area catalogue', () => {
  it('lists the nine business areas in order', () => {
    expect(areasFor('business').map(area => area.id)).toEqual(['problem', 'customer', 'market', 'alternatives', 'mvp', 'validation', 'money', 'distribution', 'founder']);
  });

  it('lists the seven philosophy areas', () => {
    expect(areasFor('philosophy').map(area => area.id)).toEqual(['decision', 'values', 'options', 'assumptions', 'others', 'regret', 'reversibility']);
  });

  it('gives every area a single fallback question', () => {
    for (const area of [...areasFor('business'), ...areasFor('philosophy')]) {
      expect(area.opening.trim().endsWith('?')).toBe(true);
      expect(area.opening.split('?').length - 1).toBe(1);
    }
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
