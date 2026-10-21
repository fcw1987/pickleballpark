import { expect, test } from '@playwright/test';

async function openBoard(page) {
  await page.goto('/index.html?workspace=planner&projection=1');
  await expect.poll(() => page.evaluate(() => Boolean(window.pickleboard?.projection))).toBe(true);
}

test('projection is affine, invertible, and spans the complete editable bounds', async ({ page }) => {
  await openBoard(page);
  const result = await page.evaluate(() => {
    const projection = window.PickleboardProjection;
    const canonical = [
      { x: -8, y: -8 }, { x: 28, y: -8 },
      { x: -8, y: 52 }, { x: 28, y: 52 },
      { x: 10, y: 22 }, { x: 5.25, y: 37.75 }
    ];
    return {
      viewBox: projection.COURT_VIEWBOX,
      projected: canonical.map(point => projection.courtToView(point)),
      roundTrips: canonical.map(point => projection.viewToCourt(projection.courtToView(point)))
    };
  });

  expect(result.viewBox).toEqual({ x: -12, y: -9.2, width: 44, height: 43.8 });
  const expectedCorners = [[-5.3,-5.2],[30.7,-5.2],[-10.7,33.8],[25.3,33.8]];
  result.projected.slice(0, 4).forEach((point, index) => {
    expect(point.x).toBeCloseTo(expectedCorners[index][0], 10);
    expect(point.y).toBeCloseTo(expectedCorners[index][1], 10);
  });
  result.roundTrips.forEach((point, index) => {
    expect(point.x).toBeCloseTo([ -8, 28, -8, 28, 10, 5.25 ][index], 10);
    expect(point.y).toBeCloseTo([ -8, -8, 52, 52, 22, 37.75 ][index], 10);
  });
});

test('ground content projects while editable state and numeric attributes stay canonical', async ({ page }) => {
  await openBoard(page);
  await page.evaluate(() => window.pickleboard.setTokenPosition('player1', 8.5, 31.25));
  const state = await page.evaluate(() => {
    const board = window.pickleboard;
    const player = document.getElementById('player1');
    const target = document.getElementById('player1-touch');
    const actor = document.getElementById('player1-actor');
    return {
      position: board.getTokenPositions().player1,
      attrs: {
        dataX: Number(player.dataset.cx), dataY: Number(player.dataset.cy),
        targetX: Number(target.getAttribute('cx')), targetY: Number(target.getAttribute('cy'))
      },
      actorTransform: actor.getAttribute('transform'),
      groundTransform: document.getElementById('groundPlane').getAttribute('transform'),
      order: [...document.getElementById('actorLayer').children].map(element => ({
        id: element.id, depth: Number(element.dataset.depth)
      }))
    };
  });

  expect(state.position).toEqual({ x: 8.5, y: 31.25 });
  expect(state.attrs).toEqual({ dataX: 8.5, dataY: 31.25, targetX: 8.5, targetY: 31.25 });
  const actorOffset = state.actorTransform.match(/translate\(([-\d.]+) ([-\d.]+)\)/).slice(1).map(Number);
  expect(actorOffset[0]).toBeCloseTo(-0.8325, 10);
  expect(actorOffset[1]).toBeCloseTo(-12.770833333333332, 10);
  expect(state.groundTransform).toBe('matrix(1 0 -0.09 0.65 1.98 0)');
  expect(state.order.map(item => item.depth)).toEqual([...state.order.map(item => item.depth)].sort((a, b) => a - b));
});

test('pointer dragging uses inverse projection and preserves grab offset', async ({ page }) => {
  await openBoard(page);
  const before = await page.evaluate(() => window.pickleboard.getTokenPositions().player2);
  const target = page.locator('#player2-touch');
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  const start = { x: box.x + box.width * 0.7, y: box.y + box.height * 0.35 };
  const intendedCourtDelta = { x: 3, y: 4 };
  const screenDelta = await page.evaluate(delta => {
    const svg = document.getElementById('court');
    const matrix = svg.getScreenCTM();
    const projection = window.PickleboardProjection;
    const origin = projection.courtToView(0, 0);
    const end = projection.courtToView(delta.x, delta.y);
    return {
      x: matrix.a * (end.x - origin.x) + matrix.c * (end.y - origin.y),
      y: matrix.b * (end.x - origin.x) + matrix.d * (end.y - origin.y)
    };
  }, intendedCourtDelta);

  // Synthetic mouse coordinates retain the subpixel delta needed to isolate
  // projection accuracy from native pointer coordinates' integer quantization.
  await target.dispatchEvent('mousedown', { clientX:start.x, clientY:start.y, button:0 });
  await page.evaluate(({x,y})=>document.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:x,clientY:y,buttons:1})),
    {x:start.x+screenDelta.x,y:start.y+screenDelta.y});
  await page.evaluate(({x,y})=>document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true,clientX:x,clientY:y,button:0})),
    {x:start.x+screenDelta.x,y:start.y+screenDelta.y});
  const after = await page.evaluate(() => window.pickleboard.getTokenPositions().player2);
  expect(after.x).toBeCloseTo(before.x + intendedCourtDelta.x, 1);
  expect(after.y).toBeCloseTo(before.y + intendedCourtDelta.y, 1);
});

test('drawing across the net stays in court coordinates through resize and replay restoration', async ({ page }) => {
  await openBoard(page);
  const points=[{x:6.125,y:14.5},{x:10.375,y:22},{x:15.625,y:30.25}];
  await page.evaluate(() => pickleboard.setDrawingMode(true));
  const screen=await page.evaluate(points=>points.map(p=>{const v=PickleboardProjection.courtToView(p);const s=new DOMPoint(v.x,v.y).matrixTransform(document.querySelector('#court').getScreenCTM());return{x:s.x,y:s.y};}),points);
  // This precision fixture supplies exact doubles. Native Touch constructors
  // round client coordinates to float32 before the application receives them;
  // native/emulated touch handling is covered separately by the DPR2 suite.
  await page.evaluate(screen=>{
    const court=document.querySelector('#court');
    for(const [i,point] of screen.entries()) {
      const event=new Event(i===0?'touchstart':'touchmove',{bubbles:true,cancelable:true});
      Object.defineProperty(event,'touches',{value:[{identifier:1,clientX:point.x,clientY:point.y}]});
      court.dispatchEvent(event);
    }
    court.dispatchEvent(new Event('touchend',{bubbles:true,cancelable:true}));
  },screen);
  const before=await page.evaluate(()=>pickleboard.captureBoardState());
  const numbers=before.drawings[0].match(/-?\d+(?:\.\d+)?/g).map(Number);
  points.flatMap(p=>[p.x,p.y]).forEach((n,i)=>expect(numbers[i]).toBeCloseTo(n,6));
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>pickleboard.captureBoardState())).toEqual(before);
  await page.evaluate(()=>pickleboard.plays.load('third-shot-drop'));
  await page.locator('#play3dView').click();await page.locator('#threeDCanvas canvas').waitFor();
  await page.locator('#threeDExit').click();await page.locator('#playExit').click();
  expect(await page.evaluate(()=>pickleboard.captureBoardState())).toEqual(before);
  await page.evaluate(()=>pickleboard.undoLastStroke());
  await expect(page.locator('#drawingLayer path')).toHaveCount(0);
});

test('touch cancellation completes a stroke without retaining an active drawing', async ({ page }) => {
  await openBoard(page);await page.evaluate(()=>pickleboard.setDrawingMode(true));
  const court=page.locator('#court');const b=await court.boundingBox();
  const touch=(x,y)=>({touches:[{identifier:1,clientX:x,clientY:y}],changedTouches:[{identifier:1,clientX:x,clientY:y}]});
  await court.dispatchEvent('touchstart',touch(b.x+b.width/2,b.y+b.height/2));
  await court.dispatchEvent('touchmove',touch(b.x+b.width/2+15,b.y+b.height/2+15));
  await court.dispatchEvent('touchcancel',{touches:[],changedTouches:[]});
  expect(await page.evaluate(()=>pickleboard.isDrawing)).toBe(false);
  await expect(page.locator('#drawingLayer path')).toHaveCount(1);
});
