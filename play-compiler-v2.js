// Model 2 is isolated from the legacy authored/template compiler.
import { compilePlayTimeline } from './three-d-core.js';
import { validateModel2Rules, analyzeModel2Outcome } from './play-outcome-v2.js';
import { inspectActorMovementV2 } from './play-actors-v2.js';
import { createPlanningStateV2, trialRecipeV2, commitPlanningTrialV2 } from './play-planning-v2.js';
export { model2ContactKind } from './play-planning-v2.js';

const IDS=['player1','player2','player3','player4'];
const finding=(shotId,message,kind='rule',severity='error')=>Object.freeze({kind,severity,shotId,message});
function constructPlay(document){
  const state=createPlanningStateV2(document);
  for(const recipe of document.shots){
    // Authoring preserves an invalid built prefix and its findings. The engine
    // uses the same trial builder but may commit only a valid accepted trial.
    const trial=trialRecipeV2(state,recipe,{inspect:false,buildOnly:true});
    commitPlanningTrialV2(state,trial,{allowInvalid:true});
    if(!trial.built)break;
  }
  return {play:state.play,findings:state.findings,accepted:state.steps.length-1};
}

function compile(document,{preview=false}={}){
  const {play,findings,accepted}=constructPlay(document),timeline=compilePlayTimeline(play);
  for(const id of IDS){
    const movement=inspectActorMovementV2(timeline,id);
    if(!movement.valid)findings.push(finding(movement.stepId,`${id}: ${movement.reason}`,'feasibility'));
  }
  const analysis=preview?analyzeModel2Outcome(play,timeline):null,rules=validateModel2Rules(play,timeline);
  if(!preview)for(const item of rules.violations)findings.push(finding(item.stepId||item.shotId||null,item.message,item.category==='model'?'feasibility':'rule'));
  return Object.freeze({play:Object.freeze(play),timeline,findings:Object.freeze(findings),validShotCount:!preview&&findings.some(item=>item.severity==='error')?0:accepted,coverage:Object.freeze([]),
    ...(preview?{derivedOutcome:analysis.derivedOutcome}:{} )});
}
export function compileDocumentV2(document){return compile(document);}
// Generator/testing helper only. Public compileDocument still validates the
// complete document, including independently derived outcome evidence.
export function previewDocumentV2(document){return compile(document,{preview:true});}
