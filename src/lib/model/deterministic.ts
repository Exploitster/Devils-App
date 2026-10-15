import type { ModelService, ModelInput, ModelOutput, Counterpoint } from '../contracts';
import { prepareState, makeCard } from '../conversation/state';
export class DeterministicModel implements ModelService {
 async generate(input:ModelInput,signal:AbortSignal){signal.throwIfAborted();const state=prepareState(input);const text='text' in input.request?input.request.text:state.position;
 state.underlyingQuestion=input.session.mode==='business'?'Which assumption would make this idea worth testing?':'Which values and obligations matter most in this decision?';
 state.strengths=[`You have made a concrete position available for examination: ${state.position.slice(0,220)}`];
 const detailed=state.position.length>160||/customer|payer|pay|cost|because|value|risk|reversib/i.test(state.position);
 const pending=state.clarifications.find(q=>q.answer===undefined&&!q.skipped);
 if(input.task==='turn'&&!pending&&state.clarifications.length===0&&!detailed){const question=input.session.mode==='business'?'Who would use this, who would pay, and which assumption is least certain?':'What matters most to you here, and what would make the choice reversible?';state.clarifications.push({id:'context-1',question,skipped:false});state.phase='clarifying';return this.result({state,response:question,citations:[]});}
 const points:Counterpoint[]=input.evidence.filter(e=>!state.usedEvidenceIds.includes(e.id)).slice(0,1).map((e):Counterpoint|null=>{const c=e.claims.find(c=>c.paraphraseAllowed)!;return c?{id:c.id,text:c.text,citations:[{evidenceId:e.id,claimId:c.id,excerptId:c.excerptIds[0],kind:'paraphrase' as const}],interpretation:`A comparison to examine, not a prediction: does this constraint apply to your position about ${state.position.slice(0,120)}? The source's circumstances may differ.`}:null;}).filter((p):p is Counterpoint=>p!==null);
 if(points.length)state.counterpoints=[...points,...state.counterpoints.filter(p=>!points.some(n=>n.id===p.id))].slice(0,3);
 state.coverageNote=points.length?'This comparison has limited scope; it does not establish the outcome of your decision.':'I am out of new relevant reviewed sources for this position. We can examine assumptions and design a test without adding factual claims.';
 const round=input.session.revision;
 const questions=input.session.mode==='business'?['What observation would show that the intended payer will actually pay?','If demand doubles, which serving cost could grow faster than revenue?','How would you reach your next ten customers without relying on friends?','Which seasonal or competitive change would break your main assumption?']:['Which obligation would remain important if the outcome disappoints you?','Which part of the decision can you reverse without breaking a commitment?','What would someone affected by this choice want you to consider?','What observation would cause you to revise your view?'];
 state.openQuestions=[questions[round%questions.length]];
 state.nextStep=input.session.mode==='business'?'This month, interview three intended customers and ask for a small, reversible commitment before spending on a build.':'This month, try a small reversible version of the choice and write down which value it serves and what would make you stop.';
 state.summary=`Position: ${state.position.slice(0,1000)}. Latest reflection: ${text.slice(0,500)}`;state.phase=input.task==='card'?'card':'debate';
 const response=`Underlying question: ${state.underlyingQuestion}\n\nStrengths: ${state.strengths.join(' ')}\n\n${points.map(p=>`${p.text}\nInterpretation: ${p.interpretation}`).join('\n')}\n\n${state.coverageNote}\n\n${state.openQuestions[0]}\n${state.nextStep}`;
 return this.result({state,response,citations:points.flatMap(p=>p.citations),...(input.task==='card'?{card:makeCard(state,input)}:{})});
 }
 private result(output:ModelOutput){return {output,inputTokens:0,outputTokens:0,costMicros:0};}
}
