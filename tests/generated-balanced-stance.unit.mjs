import test from 'node:test';
import assert from 'node:assert/strict';
import { contactFeetCandidatesV1 } from '../rally-movement.js';
import { contactOpportunityPreferenceV1, compareContactOpportunityPreferencesV1 } from '../rally-contact-selection.js';
const feetAt=p=>[{x:p.x-.42,y:p.y},{x:p.x+.42,y:p.y}];
for(const team of ['green','orange'])for(const hand of ['left','right'])test(`bounded stance search reserves a comfortable plant without surrendering the ready line (${team}/${hand})`,()=>{
  const side=(team==='green'?1:-1)*(hand==='right'?1:-1),y=team==='green'?14.25:29.75;
  const args={contact:{x:10,y,heightFeet:2.2},target:{x:13,y:team==='green'?32:12},team,handedness:hand,kind:'volley',
    position:{x:10+side*4.4,y},availableSeconds:1};
  const before=JSON.stringify(args),candidates=contactFeetCandidatesV1(args);
  assert.ok(candidates.length<=8);assert.ok(candidates[0].bodyClearanceFeet>2.99,'emergency nearest-origin support remains available');
  assert.ok(candidates.some(item=>item.reachable&&item.legalVolleyFeet&&item.bodyClearanceFeet<=1.8+1e-7&&item.stance.y===y),
    'diagonal outgoing geometry must not make the full-extension plant the only line-ready choice');
  assert.equal(JSON.stringify(args),before);
});

test('a time-feasible comfortable contact wins an otherwise equal line-ready opportunity but never trades away legal NVZ reset',()=>{
  const contact={x:10,y:14.25,heightFeet:2.2},base={contact,origin:{x:15,y:14.25},team:'green',feasibleReplyIds:['drop','drive'],attackingReplyAvailable:false,availableSeconds:1};
  const preference=stance=>contactOpportunityPreferenceV1({...base,stance,contactFeet:feetAt(stance)});
  const stretched={opportunityId:'a',preference:preference({x:12.9,y:14.25})},balanced={opportunityId:'b',preference:preference({x:11.8,y:14.25})};
  assert.ok(compareContactOpportunityPreferencesV1(balanced,stretched)<0);
  assert.ok(balanced.preference.contactExtensionFeet<stretched.preference.contactExtensionFeet);
  const kitchen={opportunityId:'c',preference:preference({x:10.8,y:15.1})};
  assert.ok(compareContactOpportunityPreferencesV1(stretched,kitchen)<0,'grounded NVZ recovery still precedes optional reach comfort');
});

for(const team of ['green','orange'])for(const hand of ['left','right'])test(`a balanced high contact stays in front rather than reaching backward to preserve line depth (${team}/${hand})`,()=>{
 const near=team==='green'?1:-1,side=near*(hand==='right'?1:-1),contact={x:10,y:team==='green'?10:34,heightFeet:7.5};
 const base={contact,origin:{x:10+side*.8,y:contact.y+near*2.7},team,feasibleReplyIds:['overhead','lob'],attackingReplyAvailable:true,availableSeconds:1.4};
 const make=(id,stance)=>({opportunityId:id,preference:contactOpportunityPreferenceV1({...base,stance,contactFeet:feetAt(stance)})});
 const backward=make('a',{x:10+side*.8,y:contact.y+near*2.7}),front=make('b',{x:10+side*.8,y:contact.y-near*.8});
 assert.ok(compareContactOpportunityPreferencesV1(front,backward)<0,'line advantage never rewards a backward full-extension contact over an available balanced plant');
 const candidates=contactFeetCandidatesV1({contact,target:{x:team==='green'?18:2,y:team==='green'?34:10},team,handedness:hand,
   contactStyle:'forehand',kind:'volley',position:base.origin,availableSeconds:base.availableSeconds});
 assert.ok(candidates.some(item=>item.routeReachable&&near*(contact.y-item.stance.y)>=.7&&item.bodyClearanceFeet<1.8),
  'bounded candidate enumeration reserves a hand-correct front-of-body plant');
});

test('comfort ranks before a small optional line gain but never declares an infeasible arrival legal',()=>{
 const contact={x:10,y:14.25,heightFeet:2.2},base={contact,origin:{x:13,y:14.25},team:'green',feasibleReplyIds:['drop'],attackingReplyAvailable:false,availableSeconds:.1};
 const make=(id,stance)=>({opportunityId:id,preference:contactOpportunityPreferenceV1({...base,stance,contactFeet:feetAt(stance)})});
 const edge=make('edge',{x:12.9,y:14.25}),comfortable=make('comfortable',{x:11.1,y:13.45});
 assert.ok(compareContactOpportunityPreferencesV1(comfortable,edge)<0);
 assert.equal(Object.hasOwn(comfortable.preference,'routeValid'),false,'this is preference only; timing still belongs to independent admission');
});

for (const team of ['green', 'orange']) for (const hand of ['left', 'right']) test(`a rushed contact reserves the shortest extension its actual route time permits (${team}/${hand})`, () => {
  const side = (team === 'green' ? 1 : -1) * (hand === 'right' ? 1 : -1), y = team === 'green' ? 14.25 : 29.75;
  const candidates = contactFeetCandidatesV1({ contact: { x: 10, y, heightFeet: 1.5 }, target: { x: 13, y: team === 'green' ? 32 : 12 },
    team, handedness: hand, kind: 'volley', position: { x: 10 + side * 4.4, y }, availableSeconds: .5 });
  // The exact30ft/s² allowance is1.875ft in0.5s, so2.525ft paddle extension
  // is available. A grid containing only3/2.9/1.8ft misses this balanced plant.
  const chosen = candidates.find(item => item.routeReachable && item.bodyClearanceFeet >= 2.525 - 1e-6 && item.bodyClearanceFeet < 2.52501);
  assert.ok(chosen, 'real route time, not a coarse radius grid, supplies the emergency comfort boundary');
  assert.equal(chosen.stance.y, y); assert.ok(chosen.travelFeet <= 1.875 + 1e-7); assert.ok(candidates.length <= 8);
});
