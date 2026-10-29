import test from 'node:test';
import assert from 'node:assert/strict';
import { contactOpportunityPreferenceV1, compareContactOpportunityPreferencesV1, rankContactOpportunitiesV1 } from '../rally-contact-selection.js';
import { solveFlightV2, interceptFlightV2 } from '../play-physics-v2.js';
import { inspectBodyPathV2 } from '../play-outcome-v2.js';
import { inspectGeneratedMovementV1, inspectGeneratedSpacingV1 } from '../rally-movement.js';
import { sampleActorBoardPositionV2 } from '../play-actors-v2.js';
import { isInNonVolleyZone } from '../court-geometry.js';
const ids=['player1','player2','player3','player4'];
const feetAt=stance=>[{x:stance.x-.42,y:stance.y},{x:stance.x+.42,y:stance.y}];
const preference=(stance,origin={x:10,y:14.25},extra={})=>contactOpportunityPreferenceV1({contact:{x:10,y:16,heightFeet:2},stance,contactFeet:feetAt(stance),origin,team:'green',feasibleReplyIds:['reset'],attackingReplyAvailable:false,availableSeconds:1,...extra});

test('ready-line improvement rewards approaching or recovering to the grounded line, never overshooting it',()=>{
  assert.equal(preference({x:10,y:14.25},{x:10,y:8}).readyLineImprovementFeet,6.25);
  assert.equal(preference({x:10,y:16}).readyLineImprovementFeet,-1.75);
  assert.equal(preference({x:10,y:14.25},{x:10,y:16}).readyLineImprovementFeet,1.75);
  const outside=preference({x:10,y:14.25}),inside=preference({x:10,y:16});
  assert.equal(outside.nvzResetCostFeet,0);assert.equal(inside.nvzResetCostFeet,1.75);
  assert.ok(compareContactOpportunityPreferencesV1({opportunityId:'outside',preference:outside},{opportunityId:'inside',preference:inside})<0);
  assert.throws(()=>preference({x:10,y:14},{x:10,y:12},{contactFeet:undefined}),/actual contactFeet/);
  assert.throws(()=>preference({x:10,y:14},{x:10,y:12},{contactFeet:feetAt({x:10,y:15})}),/center/);
  const straddled=preference({x:10,y:14.9},{x:10,y:14},{contactFeet:[{x:9.58,y:14.7},{x:10.42,y:15.1}],outsideNVZ:true});
  assert.ok(straddled.nvzResetCostFeet>0,'actual feet override an invented outside flag or an outside center');
  const sideline=preference({x:-.5,y:16});assert.equal(sideline.nvzResetCostFeet,0,'actual feet can establish outside at the sideline');
});

for(const mirrored of [false,true])for(const hand of ['right','left'])test(`physically feasible paired stances prefer ready feet and retain a necessary kitchen entry (${mirrored?'orange':'green'}/${hand})`,()=>{
  const at=p=>mirrored?{...p,x:20-p.x,y:44-p.y}:{...p};
  const receiver=mirrored?'player3':'player1',partner=mirrored?'player4':'player2',incomingHitter=mirrored?'player1':'player3';
  const team=mirrored?'orange':'green';
  const players=Object.fromEntries(ids.map((id,i)=>[id,{team:i<2?'green':'orange',handedness:hand}]));
  const incoming=solveFlightV2({from:at({x:10,y:30,heightFeet:3}),target:at({x:10,y:18}),family:'drop'});
  const intercepted=interceptFlightV2(incoming,{kind:'groundstroke',stance:at({x:10,y:14.25}),afterBounceSeconds:.3});
  const contact=intercepted.point,localContact=mirrored?at(contact):contact;
  const side=hand==='right'?1:-1;
  const origin=at({x:10+side*.8,y:14.25});
  const previous=Object.fromEntries(ids.map((id,i)=>[id,at({x:i%2?17:4,y:i<2?14.25:30})]));
  previous[receiver]=origin;previous[partner]=at({x:17,y:14.25});
  // Put the incoming hitter safely lateral to its paddle-contact ball.
  previous[incomingHitter]=at({x:8,y:30});
  const outsideStance=at({x:10+side*.8,y:14.25}),insideStance=at({x:10+side*.8,y:localContact.y+.5});
  const outgoing=solveFlightV2({from:contact,target:at({x:10,y:34}),family:'reset',pace:'soft',arc:'high'});
  assert.equal(incoming.obstruction,null);assert.equal(outgoing.obstruction,null);
  const rows=[outsideStance,insideStance].map((stance,sourceIndex)=>{
    const feet=feetAt(stance),positions={...previous,[receiver]:stance};
    const incomingSegment={modelVersion:2,startTime:0,duration:intercepted.time,originalDuration:intercepted.time,contactTime:0,
      previous:{positions:previous},step:{positions,shot:{physicsV2:{endTimeSeconds:intercepted.time}}},
      shotSemantics:{playerId:incomingHitter,contact:{feet:feetAt(previous[incomingHitter])}},model2Momentum:[]};
    const movement=inspectGeneratedMovementV1(incomingSegment),spacing=inspectGeneratedSpacingV1(incomingSegment);
    assert.equal(movement.valid,true);assert.equal(spacing.valid,true);
    assert.deepEqual(sampleActorBoardPositionV2(incomingSegment,receiver,incomingSegment.duration),stance);
    assert.deepEqual(inspectBodyPathV2(incomingSegment,incoming,[receiver,partner]),[],'actual incoming route remains body-clear');
    const outgoingSegment={...incomingSegment,duration:outgoing.firstLandingTime,originalDuration:outgoing.firstLandingTime,
      previous:{positions},step:{positions,shot:{physicsV2:{endTimeSeconds:outgoing.firstLandingTime}}},
      shotSemantics:{playerId:receiver,contact:{feet}}};
    assert.deepEqual(inspectBodyPathV2(outgoingSegment,outgoing,[receiver,partner]),[],'identical outgoing reply clears either audited stance');
    const paddle=Math.hypot(stance.x-contact.x,stance.y-contact.y);
    assert.ok(paddle>=.9&&paddle<=3,'both groundstroke plants retain body clearance and grounded paddle reach');
    return {opportunityId:sourceIndex?'inside':'outside',actorId:receiver,sourceIndex,kind:'groundstroke',contact,availableSeconds:intercepted.time,
      stance,contactFeet:feet,recoveryPosition:stance,feasibleReplyIds:['reset'],attackingReplyAvailable:false,
      audit:{legal:true,routeValid:movement.valid,feetValid:true,peakFeetPerSecond:movement.maxPeakFeetPerSecond,minimumSpacingFeet:spacing.minimumSeparationFeet}};
  });
  assert.ok(rows[0].contactFeet.every(foot=>!isInNonVolleyZone(foot)));
  assert.ok(rows[1].contactFeet.some(isInNonVolleyZone));
  const select=candidates=>rankContactOpportunitiesV1({players,positions:previous,eligible:[receiver,partner],candidates});
  const ranked=select(rows);assert.equal(ranked.chosen.opportunityId,'outside');
  const optimistic=rows.map(row=>({opportunityId:row.opportunityId,preference:contactOpportunityPreferenceV1({...row,origin,team})})).sort(compareContactOpportunityPreferencesV1);
  assert.deepEqual(ranked.ranked.map(row=>({opportunityId:row.opportunityId,preference:row.preference})),optimistic);
  const necessary=select([rows[1]]);assert.equal(necessary.chosen.opportunityId,'inside','a legal necessary bounced-ball kitchen entry remains selectable');
});

for(const mirrored of [false,true])test(`a physically necessary deep kitchen groundstroke remains selectable (${mirrored?'orange':'green'})`,()=>{
  const at=p=>mirrored?{...p,x:20-p.x,y:44-p.y}:{...p};
  const receiver=mirrored?'player3':'player1',partner=mirrored?'player4':'player2',incomingHitter=mirrored?'player1':'player3',team=mirrored?'orange':'green';
  const players=Object.fromEntries(ids.map((id,i)=>[id,{team:i<2?'green':'orange',handedness:'right'}]));
  const incoming=solveFlightV2({from:at({x:10,y:32,heightFeet:3}),target:at({x:10,y:21}),family:'drop',physics:{apexFeet:10}});
  const intercepted=interceptFlightV2(incoming,{kind:'groundstroke',stance:at({x:10,y:14.25}),afterBounceSeconds:.2});
  const contact=intercepted.point,local=mirrored?at(contact):contact;
  assert.ok(local.y>18&&local.y<22,'even the nearest NVZ edge is beyond three-foot paddle reach');
  assert.ok(Math.min(local.x,20-local.x,local.y-15,29-local.y)>3,'no outside-NVZ stance can reach this contact');
  const stance=at({x:10.8,y:local.y-.5}),feet=feetAt(stance),origin=at({x:10.8,y:14.25});
  const previous={player1:at({x:4,y:14.25}),player2:at({x:17,y:14.25}),player3:at({x:8,y:32}),player4:at({x:17,y:32})};
  previous[receiver]=origin;previous[partner]=at({x:17,y:14.25});previous[incomingHitter]=at({x:8,y:32});
  const positions={...previous,[receiver]:stance};
  const segment={modelVersion:2,startTime:0,duration:intercepted.time,originalDuration:intercepted.time,contactTime:0,
    previous:{positions:previous},step:{positions,shot:{physicsV2:{endTimeSeconds:intercepted.time}}},
    shotSemantics:{playerId:incomingHitter,contact:{feet:feetAt(previous[incomingHitter])}},model2Momentum:[]};
  const movement=inspectGeneratedMovementV1(segment),spacing=inspectGeneratedSpacingV1(segment);
  assert.equal(movement.valid,true);assert.equal(spacing.valid,true);
  assert.deepEqual(inspectBodyPathV2(segment,incoming,[receiver,partner]),[]);
  assert.ok(feet.some(isInNonVolleyZone));assert.ok(Math.hypot(stance.x-contact.x,stance.y-contact.y)<3);
  const outgoing=solveFlightV2({from:contact,target:at({x:10,y:36}),family:'reset',pace:'soft',arc:'high'});
  assert.equal(outgoing.obstruction,null);
  const outgoingSegment={...segment,duration:outgoing.firstLandingTime,originalDuration:outgoing.firstLandingTime,previous:{positions},
    step:{positions,shot:{physicsV2:{endTimeSeconds:outgoing.firstLandingTime}}},shotSemantics:{playerId:receiver,contact:{feet}}};
  assert.deepEqual(inspectBodyPathV2(outgoingSegment,outgoing,[receiver,partner]),[]);
  const result=rankContactOpportunitiesV1({players,positions:previous,eligible:[receiver,partner],candidates:[{
    opportunityId:'necessary-entry',actorId:receiver,sourceIndex:0,kind:'groundstroke',contact,availableSeconds:intercepted.time,
    stance,contactFeet:feet,recoveryPosition:stance,feasibleReplyIds:['reset'],attackingReplyAvailable:false,
    audit:{legal:true,routeValid:movement.valid,feetValid:true,peakFeetPerSecond:movement.maxPeakFeetPerSecond,minimumSpacingFeet:spacing.minimumSeparationFeet}}]});
  assert.equal(result.chosen.opportunityId,'necessary-entry');assert.ok(result.chosen.preference.nvzResetCostFeet>0);
});
