import type { AreaBrief, AssessmentProse, CaseContext, CasePrepProposal, Counterpoint, Evidence, Mode, ModelInput, ModelOutput, ModelService } from '../contracts';
import { findArea } from '../case-prep/frameworks';
import { prepareState } from '../conversation/state';

/**
 * The simulated AI for unit tests, offline evaluations and browser tests. It follows the case-prep
 * contract with fixed rules, so a test can predict every proposal:
 * - an answer is vague when it has fewer than eight words or leans on filler such as "everyone",
 *   "I guess" or "not sure"; otherwise it is strong and the quote is its first sentence, verbatim;
 * - a follow-up echoes the person's words and turns the area's next follow-up pattern into a question;
 * - the next area's question is its catalogue opening;
 * - a correction invalidates every answered area except the first;
 * - the assessment prose is a template built from the area scores and the supplied evidence.
 * These rules judge nothing about quality; they only make the flow testable.
 */
const VAGUE_BELOW_WORDS = 8;
const FILLER = /\b(everyone|everybody|anyone|anybody|i guess|not sure|maybe)\b/i;
const ECHO_WORDS = 10;
const QUOTE_LIMIT = 400;

export class DeterministicModel implements ModelService {
  async generate(input: ModelInput, signal: AbortSignal) {
    signal.throwIfAborted();
    const state = prepareState(input);
    state.phase = input.task === 'card' ? 'card' : 'clarifying';
    const context = input.caseContext;
    const text = 'text' in input.request ? input.request.text : '';
    const mode = input.session.mode;
    if (!context) return result({ state, response: 'What idea or decision would you like to prepare?', citations: [] });
    if (context.purpose === 'assessment') {
      return result({ state, response: 'Your assessment is ready.', citations: [], assessment: assessmentProse(input, context) });
    }
    const casePrep = proposal(context, mode, text, 'action' in input.request ? input.request.action : 'message');
    const response = casePrep.followUpQuestion ?? casePrep.nextAreaQuestion ?? 'Every area is covered.';
    return result({ state, response, citations: [], casePrep });
  }
}

function result(output: ModelOutput) {
  return { output, inputTokens: 0, outputTokens: 0, costMicros: 0 };
}

function proposal(context: CaseContext, mode: Mode, text: string, action: string): CasePrepProposal {
  const current = context.currentArea;
  const next = context.nextArea;
  switch (context.purpose) {
    case 'pushback':
      return current ? { followUpQuestion: `Put another way: ${lowerFirst(openingOf(mode, current.id))}` } : {};
    case 'correction': {
      const answered = context.areas.filter(area => area.status !== 'not_asked');
      const invalidated = answered.slice(1).map(area => area.id);
      const target = invalidated[0];
      return {
        invalidatedAreaIds: invalidated,
        ...(target ? { nextAreaQuestion: `Now that your position is “${echo(text)}”, ${lowerFirst(openingOf(mode, target))}` } : {}),
        ...(current ? { followUpQuestion: `Now that your position is “${echo(text)}”, ${lowerFirst(openingOf(mode, current.id))}` } : {}),
      };
    }
    case 'question': {
      const nextAreaQuestion = next ? openingOf(mode, next.id) : undefined;
      if (action === 'skip') return nextAreaQuestion ? { nextAreaQuestion } : {};
      const answer = context.latestAnswer ?? text;
      const vague = isVague(answer);
      return {
        rating: vague ? 'vague' : 'strong',
        ...(vague ? {} : { quote: firstSentence(answer) }),
        ...(current ? { followUpQuestion: followUp(current, answer) } : {}),
        ...(nextAreaQuestion ? { nextAreaQuestion } : {}),
      };
    }
    default:
      return {};
  }
}

function isVague(answer: string): boolean {
  return words(answer).length < VAGUE_BELOW_WORDS || FILLER.test(answer);
}

function followUp(area: AreaBrief, answer: string): string {
  const pattern = area.followUps[area.followUpsUsed % area.followUps.length];
  return `You said “${echo(answer)}”. ${asQuestion(pattern)}`;
}

/** Turns a framework pattern such as "Ask what it costs them." into a question to the person. */
function asQuestion(pattern: string): string {
  const body = pattern.replace(/^Ask\s+/, '').replace(/[.?]+$/, '');
  if (body.startsWith('them to ')) return `Can you ${secondPerson(body.slice('them to '.length))}?`;
  if (body.startsWith('for ')) return `Can you tell me about ${secondPerson(body.slice('for '.length))}?`;
  return `Can you tell me ${secondPerson(body)}?`;
}

function secondPerson(text: string): string {
  return text.replace(/\bthemselves\b/g, 'yourself').replace(/\bthey\b/g, 'you').replace(/\bthem\b/g, 'you').replace(/\btheir\b/g, 'your');
}

function openingOf(mode: Mode, id: string): string {
  const area = findArea(mode, id);
  if (!area) throw new Error(`Unknown case-prep area: ${id}`);
  return area.opening;
}

function assessmentProse(input: ModelInput, context: CaseContext): AssessmentProse {
  const mode = input.session.mode;
  const rows = context.assessment?.areas ?? [];
  const position = input.session.state.position.replace(/\s+/g, ' ').trim();
  const open = rows.filter(row => row.score === 'weak' || row.score === 'untested');
  return {
    statement: position ? clip(position, 300) : 'Your idea or decision, as you described it.',
    good: rows.filter(row => row.score === 'strong').slice(0, 5).map(row => `${row.label}: you gave a specific answer in your own words.`),
    bad: open.slice(0, 5).map(row => `Still ${row.score === 'weak' ? 'thin' : 'untested'}: ${lowerFirst(row.label)}.`),
    mustBeTrue: open.slice(0, 5).map(row => findArea(mode, row.id)?.establishes).filter((text): text is string => Boolean(text)),
    loopholes: loopholes(input.evidence, position),
  };
}

function loopholes(evidence: readonly Evidence[], position: string): Counterpoint[] {
  return evidence.flatMap(source => {
    const claim = source.claims.find(c => c.paraphraseAllowed);
    if (!claim) return [];
    return [{
      id: claim.id,
      text: claim.text,
      citations: [{ evidenceId: source.id, claimId: claim.id, excerptId: claim.excerptIds[0], kind: 'paraphrase' as const }],
      interpretation: `A comparison to examine, not a prediction: does this constraint apply to ${clip(position || 'your idea', 120)}? The source's circumstances may differ.`,
    }];
  }).slice(0, 3);
}

function words(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/** The first sentence, cut back to whole words so it stays within the proposal's quote limit. */
function firstSentence(text: string): string {
  const sentence = text.trim().split(/(?<=[.!?])\s+/)[0];
  if (sentence.length <= QUOTE_LIMIT) return sentence;
  const cut = sentence.slice(0, QUOTE_LIMIT);
  return cut.slice(0, cut.lastIndexOf(' ')).trimEnd();
}

/** A short, question-mark-free echo of the person's words, so the follow-up stays a single question. */
function echo(text: string): string {
  const all = words(text.replace(/[?“”"]/g, ' '));
  const kept = all.slice(0, ECHO_WORDS).join(' ').replace(/[.,;:!]+$/, '');
  return all.length > ECHO_WORDS ? `${kept}…` : kept;
}

function lowerFirst(text: string): string {
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function clip(text: string, length: number): string {
  return text.length <= length ? text : `${text.slice(0, length - 1).trimEnd()}…`;
}
