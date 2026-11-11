import test from 'node:test';
import assert from 'node:assert/strict';
import { contactFeetV1, contactFeetCandidatesV1 } from '../rally-movement.js';
import { assessGeneratedContactSupportV1, generatedContactRadiusFeetV1 } from '../generated-contact-support.js';
for (const team of ['green','orange']) for (const hand of ['left','right']) test(`generated high contacts couple vertical and horizontal reach (${team}/${hand})`, () => {
  for (const heightFeet of [1,2.2,7,7.5,7.8,8.5]) {
    const bodySide=(team==='green'?1:-1)*(hand==='right'?1:-1);
    const contact={x:10,y:team==='green'?14.25:29.75,heightFeet};
    const args={contact,target:{x:10,y:team==='green'?32:12},team,handedness:hand,contactStyle:'forehand',kind:'volley',
      position:{x:10+bodySide*4.4,y:contact.y},availableSeconds:1};
    const before=JSON.stringify(args),result=contactFeetV1(args),candidates=contactFeetCandidatesV1(args);
    if(heightFeet===8.5) {
      assert.equal(result.reachable,false);assert.ok(candidates.every(item=>!item.reachable));
      assert.equal(generatedContactRadiusFeetV1(heightFeet),null);
    } else {
      assert.equal(result.reachable,true);assert.equal(result.legalVolleyFeet,true);
      for(const item of candidates.filter(item=>item.reachable)) {
        const assessment=assessGeneratedContactSupportV1({contact,feet:item.feet});
        assert.equal(assessment.supported,true,JSON.stringify(assessment));
        assert.ok(item.bodyClearanceFeet>=.9-1e-7);assert.ok(item.feet.every(foot=>team==='green'?foot.y<15:foot.y>29));
      }
      assert.ok(result.bodyClearanceFeet<=generatedContactRadiusFeetV1(heightFeet));
    }
    assert.equal(JSON.stringify(args),before);
  }
});
