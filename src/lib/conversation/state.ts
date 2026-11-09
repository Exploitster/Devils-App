import type { AreaBrief, AssessmentProse, CaseContext, CasePrep, ModelInput, SessionState, TurnAction, TurnRequest } from '../contracts';
import type { CaseArea } from '../case-prep/frameworks';
import { assessmentAreas, isComplete, promptContext } from '../case-prep/reducer';
export function prepareState(input:ModelInput):SessionState {
 const state=structuredClone(input.session.state);const request=input.request as TurnRequest;
 if(input.task==='turn'&&(!state.position||request.action==='correction'))state.position=request.text;
 return state;
}
const purposes:Record<TurnAction,CaseContext['purpose']>={message:'question',skip:'question',pushback:'pushback',correction:'correction'};
/** The compact case record the AI sees: the current and next area with their frameworks, and bounded quotes per area. */
export function caseContext(record:CasePrep,areas:readonly CaseArea[],action:TurnAction|'assessment',latestAnswer?:string):CaseContext {
 const view=promptContext(record,areas);
 const brief=(area:CaseArea|null):AreaBrief|null=>{if(!area)return null;const saved=view.areas.find(a=>a.id===area.id)!;return {id:area.id,label:area.label,establishes:area.establishes,opening:area.opening,strongSignals:[...area.strongSignals],followUps:[...area.followUps],status:saved.status,followUpsUsed:saved.followUps,quotes:saved.quotes};};
 const purpose=action==='assessment'?'assessment':purposes[action];
 return {purpose,currentArea:brief(view.current),nextArea:brief(view.next),areas:view.areas.map(({id,label,status,quotes})=>({id,label,status,quotes})),...(latestAnswer===undefined?{}:{latestAnswer}),...(purpose==='assessment'?{assessment:{areas:assessmentAreas(record,areas).map(({id,label,score,reason})=>({id,label,score,reason}))}}:{})};
}
/** Replaces the saved assessment; completedAt records the first assessment of a complete case and never moves. */
export function withAssessment(record:CasePrep,areas:readonly CaseArea[],prose:AssessmentProse,id:string,now:string):CasePrep {
 const next=structuredClone(record);const complete=isComplete(next);
 next.assessment={id,createdAt:now,complete,statement:prose.statement,areas:assessmentAreas(next,areas),good:prose.good,bad:prose.bad,mustBeTrue:prose.mustBeTrue,loopholes:prose.loopholes,closing:'Your call. Always.'};
 if(complete&&!next.completedAt)next.completedAt=now;
 return next;
}
