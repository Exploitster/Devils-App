import { z } from 'zod';
import { IdSchema, type FrameworkArea, type Mode } from '../contracts';
import { AppError } from '../errors';

/**
 * One case-prep area: what a guiding question must help the person establish. `strongSignals`
 * are what a strong answer shows; questions must never hand these over as answers.
 */
export type CaseArea = FrameworkArea;

const business: CaseArea[] = [
  {
    id: 'problem',
    label: 'Problem and why now',
    establishes: 'A specific, painful problem that exists today, and why it matters now rather than five years ago.',
    strongSignals: ['names a concrete moment when the problem hurts', 'says what it costs the person who has it', 'explains what changed to make this the right time'],
    followUps: ['Ask for the last time someone actually hit this problem.', 'Ask what it costs them in time, money or stress.', 'Ask what changed recently that makes this solvable now.'],
    opening: 'What problem are you solving, and when did someone last run into it?',
  },
  {
    id: 'customer',
    label: 'Who the customer is',
    establishes: 'One narrow group of people who feel the problem most and would pay first.',
    strongSignals: ['describes one specific segment, not everyone', 'names who decides and who pays', 'could point to a real person in that group'],
    followUps: ['Ask them to picture the first customer who would pay.', 'Ask who signs off on the purchase.', 'Ask what that person does today, hour by hour, around the problem.'],
    opening: 'Who exactly feels this problem most, and would pay to make it go away first?',
  },
  {
    id: 'market',
    label: 'How big the market is',
    establishes: 'A reasoned estimate of how many such customers exist and what they could pay, built bottom-up.',
    strongSignals: ['counts customers from a real source or reasoning', 'multiplies by a believable price', 'separates the first reachable market from the total'],
    followUps: ['Ask how many of those customers exist in the first city or region.', 'Ask what each could realistically pay per year.', 'Ask where the numbers come from.'],
    opening: 'Roughly how many of those customers exist, and how did you arrive at that number?',
  },
  {
    id: 'alternatives',
    label: 'What people use today',
    establishes: 'What customers do instead today, including doing nothing, and why that falls short.',
    strongSignals: ['names actual competitors or workarounds', 'explains why customers would switch', 'admits where the alternatives are good enough'],
    followUps: ['Ask what a customer did the last time instead of using this.', 'Ask what would make them switch.', 'Ask where the current option is good enough.'],
    opening: 'What do these customers do about the problem today, even if it is a messy workaround?',
  },
  {
    id: 'mvp',
    label: 'The MVP',
    establishes: 'The smallest thing that could test whether customers want this, and what it leaves out.',
    strongSignals: ['describes a version buildable in weeks, not months', 'says what is deliberately left out', 'ties the MVP to one assumption it will test'],
    followUps: ['Ask what could be cut and still test the idea.', 'Ask which assumption the first version is meant to test.', 'Ask how long it would take to put in front of a customer.'],
    opening: 'What is the smallest version you could put in front of a real customer, and what would it leave out?',
  },
  {
    id: 'validation',
    label: 'How it was validated',
    establishes: 'Evidence from real behaviour, not opinions: what potential customers actually did.',
    strongSignals: ['cites conversations, sign-ups, pre-orders or payments', 'separates what people did from what they said', 'names a result that surprised them'],
    followUps: ['Ask how many potential customers they have spoken to.', 'Ask what anyone has done, not said, that shows they want it.', 'Ask what result would make them stop.'],
    opening: 'What has a potential customer actually done, not just said, that shows they want this?',
  },
  {
    id: 'money',
    label: 'How it makes money',
    establishes: 'Who pays, how much, how often, and whether that covers the cost of serving them.',
    strongSignals: ['names a price and who pays it', 'compares price with the cost to serve', 'explains why customers accept that price'],
    followUps: ['Ask what price they would charge and why that number.', 'Ask what it costs to serve one customer.', 'Ask how long until one customer pays back the cost of winning them.'],
    opening: 'Who pays you, how much, and how often?',
  },
  {
    id: 'distribution',
    label: 'How it reaches customers',
    establishes: 'A concrete channel for finding the first customers and what each one costs to win.',
    strongSignals: ['names a channel they can use this month', 'estimates the cost or effort per customer', 'explains why that channel reaches this segment'],
    followUps: ['Ask where these customers already gather.', 'Ask how the first ten customers will hear about it.', 'Ask what winning one customer would cost.'],
    opening: 'How will your first ten customers find out about this?',
  },
  {
    id: 'founder',
    label: 'Why you',
    establishes: 'Why this founder or team is well placed to build this, and what they still lack.',
    strongSignals: ['names an unfair advantage or insight', 'is honest about missing skills', 'says how long they are willing to commit'],
    followUps: ['Ask what they know about this problem that others do not.', 'Ask which skill the team is missing.', 'Ask how long they would keep going without traction.'],
    opening: 'What makes you the right person to build this, and what are you still missing?',
  },
];

const philosophy: CaseArea[] = [
  {
    id: 'decision',
    label: 'What is really being decided',
    establishes: 'The actual choice in one sentence, separated from the surrounding worries.',
    strongSignals: ['states the choice as a clear either/or or set of options', 'separates the decision from its triggers', 'says by when it has to be made'],
    followUps: ['Ask them to state the choice in one sentence.', 'Ask what would happen if they decided nothing for a month.', 'Ask whether this is one decision or several bundled together.'],
    opening: 'If you had to put the decision in one sentence, what exactly are you choosing between?',
  },
  {
    id: 'values',
    label: 'What matters most',
    establishes: 'The values or commitments at stake, ranked, so tradeoffs become visible.',
    strongSignals: ['names specific values, not just feelings', 'ranks them when they conflict', 'connects each to the options'],
    followUps: ['Ask which value they would protect if they could keep only one.', 'Ask where that value came from.', 'Ask which option serves it best.'],
    opening: 'What matters most to you in this choice, if you could protect only one thing?',
  },
  {
    id: 'options',
    label: 'Options not yet considered',
    establishes: 'Whether the choice has been framed too narrowly, and what other paths exist.',
    strongSignals: ['names at least one option beyond the obvious two', 'considers a smaller or reversible step', 'explains why each option stays or goes'],
    followUps: ['Ask what a third option might look like.', 'Ask whether a smaller, reversible step exists.', 'Ask what someone they admire would do instead.'],
    opening: 'Apart from the options you have named, what else could you do?',
  },
  {
    id: 'assumptions',
    label: 'Assumptions',
    establishes: 'What the person is taking for granted, and how confident they are in each belief.',
    strongSignals: ['names specific beliefs behind the choice', 'says which are tested and which are guesses', 'considers what would change their mind'],
    followUps: ['Ask what has to be true for the preferred option to work.', 'Ask how they know that.', 'Ask what would change their mind.'],
    opening: 'What are you assuming will happen if you choose the option you are leaning towards?',
  },
  {
    id: 'others',
    label: 'Who else is affected',
    establishes: 'The people affected by the choice and what the person owes them.',
    strongSignals: ['names the people affected', 'considers their view, not only their reaction', 'separates obligation from approval'],
    followUps: ['Ask who would feel the decision most besides them.', 'Ask what that person would say if asked.', 'Ask what they owe that person, if anything.'],
    opening: 'Who else will feel the effects of this decision, and how?',
  },
  {
    id: 'regret',
    label: 'What you would regret',
    establishes: 'How each option looks from the future, including the regret of not trying.',
    strongSignals: ['imagines both outcomes from years ahead', 'distinguishes regret of action from inaction', 'is honest about fear versus preference'],
    followUps: ['Ask how they would feel in five years having chosen each option.', 'Ask which regret would be harder to live with.', 'Ask whether fear or preference is driving the choice.'],
    opening: 'Looking back in five years, which choice would you be more likely to regret, and why?',
  },
  {
    id: 'reversibility',
    label: 'How reversible it is',
    establishes: 'What can be undone, what cannot, and what a reversible first step would be.',
    strongSignals: ['separates reversible from permanent parts', 'names the cost of reversing', 'proposes a small step that keeps options open'],
    followUps: ['Ask which part of the choice could be undone later.', 'Ask what reversing it would cost.', 'Ask for a step this month that keeps options open.'],
    opening: 'If this turns out to be the wrong choice, what could you undo and what could you not?',
  },
];

/** The built-in question sets: version 0 of each mode, which is never stored. */
export const caseAreas: Record<Mode, CaseArea[]> = { business, philosophy };

/** The built-in question set for a mode. */
export function areasFor(mode: Mode): CaseArea[] {
  return caseAreas[mode];
}


export const MAX_AREAS = 12;
const lines = (max: number, length: number) => z.array(z.string().trim().max(length)).max(max).transform(list => list.filter(Boolean));
/**
 * One area as the owner edits it. A kept area sends back its id; a new area has none and is
 * given one from its name, so a case record's area ids stay readable against later versions.
 */
export const CaseAreaSchema = z.object({
  id: IdSchema.optional(),
  label: z.string().trim().max(200),
  establishes: z.string().trim().max(2000),
  opening: z.string().trim().max(1000),
  followUps: lines(10, 1000),
  strongSignals: lines(10, 500),
}).strict();
// Generous enough that an over-long set reaches the area-count rule with its own message.
const QuestionSetInputSchema = z.array(z.unknown()).max(100);

const fieldNames: Record<string, string> = {
  label: 'give the area a name', establishes: 'fill in what the area must establish', opening: 'write an opening question',
  followUps: 'keep the follow-ups to at most 10, each under 1,000 characters', strongSignals: 'keep the signs of a strong answer to at most 10, each under 500 characters', id: 'keep the area id it was given',
};
const fieldLimits: Record<string, string> = { label: 'keep the name under 200 characters', establishes: 'keep what the area must establish under 2,000 characters', opening: 'keep the opening question under 1,000 characters' };

/**
 * Checks an owner-edited question set and returns it ready to publish. A set has 1 to 12 areas
 * with unique names; each opening is one question ending in "?", and each area has at least one
 * follow-up and one sign of a strong answer. Each rejection names the area and the rule it broke.
 */
export function parseQuestionSet(input: unknown): CaseArea[] {
  const list = QuestionSetInputSchema.safeParse(input);
  const count = Array.isArray(input) ? input.length : 0;
  if (!list.success || count < 1 || count > MAX_AREAS) throw invalid(`A question set needs between 1 and ${MAX_AREAS} areas; this one has ${count}.`);
  const areas = list.data.map((raw, index) => {
    const label = (raw as { label?: unknown } | null)?.label;
    const name = typeof label === 'string' && label.trim() ? `“${label.trim()}”` : `Area ${index + 1}`;
    const parsed = CaseAreaSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]; const field = String(issue.path[0] ?? '');
      throw invalid(`${name}: ${issue.code === 'too_big' ? fieldLimits[field] ?? fieldNames[field] ?? 'check its fields' : fieldNames[field] ?? 'check its fields'}.`);
    }
    const area = parsed.data;
    if (!area.label) throw invalid(`${name}: give the area a name.`);
    if (!area.establishes) throw invalid(`${name}: fill in what the area must establish.`);
    if (!area.opening.endsWith('?') || area.opening.split('?').length !== 2) throw invalid(`${name}: the opening must be one question ending in “?”.`);
    if (area.followUps.length === 0) throw invalid(`${name}: add at least one follow-up.`);
    if (area.strongSignals.length === 0) throw invalid(`${name}: add at least one sign of a strong answer.`);
    return { area, name };
  });
  const names = new Set<string>(); const ids = new Set<string>();
  for (const { area, name } of areas) {
    const key = area.label.toLowerCase().replace(/\s+/g, ' ');
    if (names.has(key)) throw invalid(`${name}: another area already has this name.`);
    names.add(key);
    if (area.id !== undefined) { if (ids.has(area.id)) throw invalid(`${name}: another area already has this id.`); ids.add(area.id); }
  }
  return areas.map(({ area }) => {
    let id = area.id;
    if (id === undefined) { const base = slug(area.label); id = base; for (let n = 2; ids.has(id); n++) id = `${base}-${n}`; ids.add(id); }
    return { id, label: area.label, establishes: area.establishes, strongSignals: area.strongSignals, followUps: area.followUps, opening: area.opening };
  });
}

function slug(label: string): string {
  return label.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 48).replace(/^-+|-+$/g, '') || 'area';
}

function invalid(message: string): AppError { return new AppError('INVALID_QUESTION_SET', message, 400); }
