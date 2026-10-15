import type { ModelInput, SessionState } from '../contracts';
export type DecisionFocus = 'pricing' | 'business' | 'personal';
export function decisionFocus(input:ModelInput):DecisionFocus {
 if(input.session.mode==='philosophy')return 'personal';
 const corrected='action'in input.request&&input.request.action==='correction';
 const position=corrected&&'text'in input.request?input.request.text:input.session.state.position||('text'in input.request?input.request.text:'');
 return /\b(pric(?:e|es|ing)|charge|charging|raise.*\$|\$.*\bto\b.*\$)/i.test(position)||(!corrected&&/pricing/i.test(input.session.title))?'pricing':'business';
}
/** Local fixtures use explicit signals, not invented facts. Live Gemini uses the
 * same focus and asks about unknowns rather than relying on this lexical helper. */
export function nextClarification(input:ModelInput,state:SessionState):{id:string;question:string;skipped:boolean}|undefined {
 if(input.task!=='turn'||state.clarifications.length>=3||state.clarifications.some(q=>q.skipped)||('action'in input.request&&['pushback','correction','skip'].includes(input.request.action)))return;
 if(state.clarifications.some(q=>q.answer===undefined&&!q.skipped))return;
 const focus=decisionFocus(input);
 const facts=[state.position,...state.clarifications.flatMap(q=>q.answer?[q.answer]:[])].join(' ');
 const industryQuestion=/voice|call assistant|telephony|phone agent/i.test(facts)?'Which call task would you test first, and how would you measure latency, mistakes, consent and human fallback?':/shampoo|body\s?wash|cosmetic|skin/i.test(facts)?'How would qualified testing validate safety, the proposed dose and product claims before asking customers to rely on them?':/chips|snack|food|vegetable/i.test(facts)?'What have you tested about repeat purchase, shelf life and contribution margin after channel costs?':/riding|helmet|motorcycle|bike accessory/i.test(facts)?'How would you test reliability, weather exposure and rider distraction before a small pilot?':'What have you observed from intended customers so far, and what is still an assumption?';
 const plans=focus==='pricing'?[
  ['prices',/\$\s*\d.*\$\s*\d|current.*proposed|from\s+\d.*to\s+\d/i,'What are the current and proposed prices, including the billing period?'],
  ['objective',/goal|objective|margin|profit|revenue|affordab|conversion/i,'What do you want this pricing change to achieve, and which outcome would make you reverse it?'],
  ['retention',/churn|retention|renew|cancel|not measured/i,'What have these customers told you about value, and what do you know about retention or cancellation risk?'],
  ['costs',/cost|serving|expense/i,'Which serving costs or capacity limits should the pricing test account for?']
 ] as const:focus==='business'?[
  ['payer',/customer|payer|pay|buyer/i,'Who specifically has this problem, and who would pay to solve it?'],
  ['problem',/problem|because|saves?|pain|struggl/i,'What problem do they face today, and what do they use instead?'],
  ['proof',/interview|traction|pilot|signed|tested|users|revenue/i,industryQuestion]
 ] as const:[
  ['values',/value|matters|important|care|priority/i,'Which value matters most in this choice, and what are you afraid of giving up?'],
  ['options',/option|alternative|either|stay|leave/i,'Which realistic options are available to you, including waiting?'],
  ['obligations',/obligation|commitment|family|depend|promise/i,'Who else is affected, and which commitments would you need to preserve?']
 ] as const;
 // Preserve the existing explicit-context path for already concrete business cases.
 if(focus==='business'&&state.clarifications.length===0&&(/because|cost|reversib/i.test(state.position)||state.position.length>160))return;
 const next=plans.find(([id,known])=>!known.test(facts)&&!state.clarifications.some(q=>q.id===`${focus}-${id}`));
 return next?{id:`${focus}-${next[0]}`,question:next[2],skipped:false}:undefined;
}
export const playbooks:Record<DecisionFocus,string>={
 pricing:'Pricing decision: use current/proposed price and billing period, customer segment, objective, cost/capacity, retention and evidence of willingness to pay. Never default to startup discovery. Ask the highest-value missing question; calculate only from supplied numbers, label assumptions, do not invent elasticity or customer reactions. Suggest a reversible small-cohort test with consent, measurement, stop conditions and fairness to existing customers.',
 business:'Business idea: distinguish user, payer, concrete problem, current alternative, traction, distribution and constraints. Tailor questions to the idea and facts supplied; do not re-ask a known payer. Distinguish user claims from verified evidence. Offer an affordable reversible experiment with an observation that could change the position.',
 personal:'Personal or philosophical decision: distinguish values, available options, obligations, affected people, uncertainty and reversibility. Explore tensions without diagnosing or making the choice. Respect uncertainty and offer an optional small step and a condition for revisiting it.',
};
