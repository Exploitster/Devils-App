import type { CaseAreaRecord, CasePrep, CasePrepProposal, Mode, TurnAction } from '../contracts';
import { AppError } from '../errors';
import { areasFor, findArea, type CaseArea } from './frameworks';

/**
 * The app-owned case-prep state machine. Pure: no model calls and no I/O.
 *
 * One turn works in three steps:
 * 1. `assertActionAllowed` before any AI call, so a refused action costs nothing.
 * 2. The engine sends `promptContext(record)` (the current and next area, with their frameworks,
 *    plus the compact record) and the person's text to the AI.
 * 3. `applyAction` applies the action with the AI's proposal and returns the new record and the
 *    question to ask next. The app decides every transition; the AI only proposes.
 *
 * Proposal fields the reducer reads, per action:
 * - `message`: `rating` and `quote` judge the latest answer; `followUpQuestion` is used when the
 *   current area needs a follow-up, `nextAreaQuestion` when the case moves to the next area.
 * - `skip`: `nextAreaQuestion` for the next area.
 * - `pushback`: `followUpQuestion`, a rephrased question for the current area.
 * - `correction`: `invalidatedAreaIds`; with ids, `nextAreaQuestion` is the question for the
 *   earliest of them in catalogue order; without ids, `followUpQuestion` is for the current area.
 */

export interface TurnResult {
  record: CasePrep;
  /** The area the next question is about; null when the case is complete and nothing is asked. */
  areaId: string | null;
  question: string | null;
  /** 'ai' when the AI's question passed the checks, 'fallback' when the area's opening was used. */
  questionSource: 'ai' | 'fallback' | null;
}

export interface CasePromptContext {
  perspective: Mode;
  areas: Array<{ id: string; label: string; status: CaseAreaRecord['status']; followUps: number; quotes: string[] }>;
  current: CaseArea | null;
  next: CaseArea | null;
}

export interface AssessmentAreaRow {
  id: string;
  label: string;
  score: 'strong' | 'weak' | 'untested' | 'not_covered';
  reason: string;
  nextStep?: string;
}

export const MAX_FOLLOW_UPS = 3;
export const MAX_QUOTES_PER_AREA = 3;
export const MAX_QUOTE_LENGTH = 500;
export const SUBSTANCE_FLOOR_WORDS = 8;

export function startCase(perspective: Mode): CasePrep {
  const areas = areasFor(perspective);
  return {
    perspective,
    areas: areas.map(area => ({ id: area.id, status: 'not_asked', followUps: 0, quotes: [] })),
    currentAreaId: areas[0].id,
    complete: false,
    qualifiedNoticeShown: false,
  };
}

export function targets(record: CasePrep): { current: CaseArea | null; next: CaseArea | null } {
  const current = record.currentAreaId ? findArea(record.perspective, record.currentAreaId) ?? null : null;
  return { current, next: nextArea(record) };
}

export function promptContext(record: CasePrep): CasePromptContext {
  const { current, next } = targets(record);
  return {
    perspective: record.perspective,
    areas: record.areas.map(area => ({ id: area.id, label: catalogueArea(record, area.id).label, status: area.status, followUps: area.followUps, quotes: [...area.quotes] })),
    current,
    next,
  };
}

export function isComplete(record: CasePrep): boolean {
  return record.areas.every(area => area.status !== 'not_asked' && area.status !== 'probing');
}

/** On a complete case only a correction is a turn; the assessment request is not a turn. */
export function assertActionAllowed(record: CasePrep, action: TurnAction): void {
  if (action !== 'correction' && isComplete(record)) {
    throw new AppError('CASE_COMPLETE', 'This case is complete. Correct your position or open the assessment.', 409);
  }
}

export function applyAction(record: CasePrep, action: TurnAction, text: string, proposal: CasePrepProposal): TurnResult {
  assertActionAllowed(record, action);
  const next = structuredClone(record);
  switch (action) {
    case 'message': return applyAnswer(next, text, proposal);
    case 'skip': return applySkip(next, proposal);
    case 'pushback': return askCurrent(next, proposal.followUpQuestion);
    case 'correction': return applyCorrection(next, proposal);
  }
}

export function assessmentAreas(record: CasePrep): AssessmentAreaRow[] {
  return record.areas.map(area => {
    const framework = catalogueArea(record, area.id);
    const latest = area.quotes.at(-1);
    const nextStep = `Work on this next: ${framework.establishes}`;
    switch (area.status) {
      case 'strong':
        return { id: area.id, label: framework.label, score: 'strong', reason: latest ? `Your answer covers it: “${latest}”` : 'Your answer covers it.' };
      case 'weak':
        return { id: area.id, label: framework.label, score: 'weak', reason: latest ? `Still vague after ${area.followUps} follow-ups: “${latest}”` : 'Still vague after follow-ups.', nextStep };
      case 'probing':
        return { id: area.id, label: framework.label, score: 'weak', reason: 'Still being explored.', nextStep };
      case 'untested':
        return { id: area.id, label: framework.label, score: 'untested', reason: 'You said you don’t know yet.', nextStep };
      case 'not_asked':
        return { id: area.id, label: framework.label, score: 'not_covered', reason: 'This area was not covered.' };
    }
  });
}

function applyAnswer(record: CasePrep, text: string, proposal: CasePrepProposal): TurnResult {
  const area = currentRecord(record);
  area.status = 'probing';
  area.quotes = [...area.quotes, boundQuote(text)].slice(-MAX_QUOTES_PER_AREA);

  const span = proposal.rating === 'strong' && proposal.quote ? matchingSpan(text, proposal.quote) : null;
  if (span !== null && wordCount(area.quotes.join(' ')) >= SUBSTANCE_FLOOR_WORDS) {
    area.quotes[area.quotes.length - 1] = boundQuote(span);
    area.status = 'strong';
    return moveToNext(record, proposal.nextAreaQuestion);
  }

  if (area.followUps >= MAX_FOLLOW_UPS) {
    area.status = 'weak';
    return moveToNext(record, proposal.nextAreaQuestion);
  }
  area.followUps += 1;
  return askCurrent(record, proposal.followUpQuestion);
}

function applySkip(record: CasePrep, proposal: CasePrepProposal): TurnResult {
  currentRecord(record).status = 'untested';
  return moveToNext(record, proposal.nextAreaQuestion);
}

function applyCorrection(record: CasePrep, proposal: CasePrepProposal): TurnResult {
  const named = new Set(proposal.invalidatedAreaIds ?? []);
  const known = record.areas.filter(area => named.has(area.id));
  const reset = known.filter(area => area.status !== 'not_asked');

  if (reset.length === 0) {
    if (known.length === 0) return askCurrent(record, proposal.followUpQuestion);
    return askCurrent(record, undefined);
  }

  for (const area of reset) clearArea(area);
  const target = reset[0];
  const previous = record.currentAreaId ? record.areas.find(area => area.id === record.currentAreaId) : undefined;
  if (previous && previous !== target && previous.status === 'probing') clearArea(previous);

  target.status = 'probing';
  record.currentAreaId = target.id;
  record.complete = false;
  const aiTarget = known[0];
  return ask(record, target.id, aiTarget.id === target.id ? proposal.nextAreaQuestion : undefined);
}

function moveToNext(record: CasePrep, proposed: string | undefined): TurnResult {
  const following = nextArea(record);
  if (!following) {
    record.currentAreaId = null;
    record.complete = true;
    return { record, areaId: null, question: null, questionSource: null };
  }
  record.areas.find(area => area.id === following.id)!.status = 'probing';
  record.currentAreaId = following.id;
  return ask(record, following.id, proposed);
}

function askCurrent(record: CasePrep, proposed: string | undefined): TurnResult {
  if (!record.currentAreaId) return { record, areaId: null, question: null, questionSource: null };
  return ask(record, record.currentAreaId, proposed);
}

function ask(record: CasePrep, areaId: string, proposed: string | undefined): TurnResult {
  const framework = catalogueArea(record, areaId);
  if (proposed !== undefined && acceptableQuestion(proposed, framework)) {
    return { record, areaId, question: proposed.trim(), questionSource: 'ai' };
  }
  return { record, areaId, question: framework.opening, questionSource: 'fallback' };
}

/** One question, ending in "?", that does not hand over a strong-answer signal as the answer. */
function acceptableQuestion(question: string, area: CaseArea): boolean {
  const trimmed = question.trim();
  if (!trimmed.endsWith('?') || trimmed.split('?').length - 1 !== 1 || normalize(trimmed) === '') return false;
  const asked = ` ${normalize(trimmed)} `;
  return !area.strongSignals.some(signal => {
    // Signals start with a verb describing the person ("names", "describes"); the rest is the answer itself.
    const phrase = normalize(signal).split(' ').slice(1).join(' ');
    return phrase !== '' && asked.includes(` ${phrase} `);
  });
}

function nextArea(record: CasePrep): CaseArea | null {
  const found = record.areas.find(area => area.status === 'not_asked' && area.id !== record.currentAreaId);
  return found ? catalogueArea(record, found.id) : null;
}

function currentRecord(record: CasePrep): CaseAreaRecord {
  const area = record.areas.find(candidate => candidate.id === record.currentAreaId);
  if (!area) throw new AppError('CASE_COMPLETE', 'This case is complete. Correct your position or open the assessment.', 409);
  return area;
}

function catalogueArea(record: CasePrep, id: string): CaseArea {
  const area = findArea(record.perspective, id);
  if (!area) throw new Error(`Unknown case-prep area: ${id}`);
  return area;
}

function clearArea(area: CaseAreaRecord): void {
  area.status = 'not_asked';
  area.followUps = 0;
  area.quotes = [];
}

function boundQuote(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_QUOTE_LENGTH) return trimmed;
  const cut = trimmed.slice(0, MAX_QUOTE_LENGTH - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > MAX_QUOTE_LENGTH / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

function wordCount(text: string): number {
  return normalize(text).split(' ').filter(Boolean).length;
}

const APOSTROPHES = /['’‘`ʼ]/u;
const WORD_CHAR = /[\p{L}\p{N}]/u;

function normalize(text: string): string {
  return normalizeWithMap(text).normalized;
}

/** Normalises `text` and records, for each normalised character, where it came from in the original. */
function normalizeWithMap(text: string): { normalized: string; starts: number[]; ends: number[] } {
  let normalized = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let index = 0;
  for (const char of text) {
    const end = index + char.length;
    if (WORD_CHAR.test(char)) {
      for (const lower of char.toLowerCase()) {
        normalized += lower;
        for (let unit = 0; unit < lower.length; unit++) { starts.push(index); ends.push(end); }
      }
    } else if (!APOSTROPHES.test(char) && normalized !== '' && !normalized.endsWith(' ')) {
      normalized += ' '; starts.push(index); ends.push(end);
    }
    index = end;
  }
  if (normalized.endsWith(' ')) { normalized = normalized.slice(0, -1); starts.pop(); ends.pop(); }
  return { normalized, starts, ends };
}

/** The span of the person's original text that the quote matches on whole words, or null. */
function matchingSpan(text: string, quote: string): string | null {
  const needle = normalize(quote);
  if (needle === '') return null;
  const { normalized, starts, ends } = normalizeWithMap(text);
  const at = ` ${normalized} `.indexOf(` ${needle} `);
  if (at === -1) return null;
  return text.slice(starts[at], ends[at + needle.length - 1]);
}
