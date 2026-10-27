import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { COURT_DIMENSIONS, COURT_LINES } from '../court-geometry.js';

const context={window:{}};
vm.runInNewContext(fs.readFileSync(new URL('../board-projection.js',import.meta.url),'utf8'),context);
const projection=context.window.PickleboardProjection;

test('pixel court projects feet with equal x/y scales and exact regulation proportions',()=>{
 const origin=projection.courtToView({x:0,y:0}),right=projection.courtToView({x:20,y:0}),far=projection.courtToView({x:0,y:44});
 const width=Math.hypot(right.x-origin.x,right.y-origin.y),length=Math.hypot(far.x-origin.x,far.y-origin.y);
 assert.equal(width/length,20/44);
 for(const y of [15,29]){
  const line=COURT_LINES.find(line=>line.from.y===y&&line.to.y===y);
  assert.ok(line);
  const a=projection.courtToView(line.from),b=projection.courtToView(line.to);
  assert.equal(Math.hypot(b.x-a.x,b.y-a.y),width);
 }
 assert.equal(COURT_DIMENSIONS.netY-COURT_DIMENSIONS.nearKitchenLineY,7);
 assert.equal(COURT_DIMENSIONS.farKitchenLineY-COURT_DIMENSIONS.netY,7);
});

test('pixel projection round trips the entire editable court including fractional out-of-bounds positions',()=>{
 for(let x=-8;x<=28;x+=2.25)for(let y=-8;y<=52;y+=3.75){
  const actual=projection.viewToCourt(projection.courtToView({x,y}));
  assert.ok(Math.abs(actual.x-x)<1e-10);assert.ok(Math.abs(actual.y-y)<1e-10);
 }
});
