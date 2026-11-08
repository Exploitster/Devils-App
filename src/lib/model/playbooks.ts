import type { ModelInput } from '../contracts';
export type DecisionFocus = 'pricing' | 'business' | 'personal';
export function decisionFocus(input:ModelInput):DecisionFocus {
 if(input.session.mode==='philosophy')return 'personal';
 const corrected='action'in input.request&&input.request.action==='correction';
 const position=corrected&&'text'in input.request?input.request.text:input.session.state.position||('text'in input.request?input.request.text:'');
 return /\b(pric(?:e|es|ing)|charge|charging|raise.*\$|\$.*\bto\b.*\$)/i.test(position)||(!corrected&&/pricing/i.test(input.session.title))?'pricing':'business';
}
export const playbooks:Record<DecisionFocus,string>={
 pricing:'Pricing decision: use current/proposed price and billing period, customer segment, objective, cost/capacity, retention and evidence of willingness to pay. Never default to startup discovery. Ask the highest-value missing question; calculate only from supplied numbers, label assumptions, do not invent elasticity or customer reactions. Suggest a reversible small-cohort test with consent, measurement, stop conditions and fairness to existing customers.',
 business:'Business idea: distinguish user, payer, concrete problem, current alternative, traction, distribution and constraints. Tailor questions to the idea and facts supplied; do not re-ask a known payer. Distinguish user claims from verified evidence. Offer an affordable reversible experiment with an observation that could change the position.',
 personal:'Personal or philosophical decision: distinguish values, available options, obligations, affected people, uncertainty and reversibility. Explore tensions without diagnosing or making the choice. Respect uncertainty and offer an optional small step and a condition for revisiting it.',
};
