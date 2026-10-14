import { randomUUID } from 'node:crypto';
import type { ModelInput, ModelOutput, SessionState, TurnRequest, HandBackCard } from '../contracts';
export function prepareState(input:ModelInput):SessionState {
 const state=structuredClone(input.session.state);const request=input.request as TurnRequest;
 if(input.task==='turn'){
  if(!state.position || request.action==='correction')state.position=request.text;
  const pending=state.clarifications.find(q=>q.answer===undefined&&!q.skipped);
  if(pending&&request.action!=='correction'){if(request.action==='skip')pending.skipped=true;else pending.answer=request.text;}
 }
 return state;
}
export function makeCard(state:SessionState,input:ModelInput):HandBackCard {return {id:randomUUID(),version:input.session.cards.length+1,sessionRevision:input.session.revision+1,position:state.position.replace(/\s+/g,' ').slice(0,300)||'Position still being clarified.',strengths:state.strengths,counterpoints:state.counterpoints.slice(0,3),openQuestions:state.openQuestions,nextStep:state.nextStep||'This month, write down one assumption and test it with a small, reversible step.',closing:'Your call. Always.',createdAt:input.now};}
/** Only the controller may change the user's position, answered questions and
 * authority-bearing IDs. Model suggestions cannot silently rewrite history. */
export function controlOutput(input:ModelInput,output:ModelOutput):ModelOutput {
 const prepared=prepareState(input); const state=output.state;
 state.position=prepared.position;
 const known=new Set(prepared.clarifications.map(q=>q.id));
 const additions=state.clarifications.filter(q=>!known.has(q.id)).slice(0,Math.max(0,3-prepared.clarifications.length)).slice(0,1).map(q=>({id:q.id,question:q.question,skipped:false}));
 state.clarifications=[...prepared.clarifications,...additions];
 state.usedArgumentIds=[...new Set([...input.session.state.usedArgumentIds,...state.counterpoints.map(p=>p.id)])].slice(-200);
 state.usedEvidenceIds=[...new Set([...input.session.state.usedEvidenceIds,...output.citations.map(c=>c.evidenceId),...state.counterpoints.flatMap(p=>p.citations.map(c=>c.evidenceId))])].slice(-200);
 if(input.task==='card'||('action' in input.request&&input.request.action==='correction'&&input.session.cards.length>0)){state.phase='card';output.card=makeCard(state,input);}else delete output.card;
 return output;
}
