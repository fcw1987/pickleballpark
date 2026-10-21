import test from 'node:test';
import assert from 'node:assert/strict';
import { compilePlayTimeline } from '../three-d-core.js';
import { PICKLEBOARD_PLAYS } from '../play-catalog.js';
import { buildShotChapters, chapterAtTime, mapSemanticPlayhead } from '../shot-chapters.js';

test('chapters use real shot segments, stable ids and canonical contact times',()=>{
 const timeline=compilePlayTimeline(PICKLEBOARD_PLAYS.find(play=>play.id==='fifth-shot-drop'));
 const chapters=buildShotChapters(timeline);
 assert.deepEqual(chapters.map(chapter=>chapter.shotId),['serve','return','third-drive','fourth-block','fifth-drop']);
 assert.deepEqual(chapters.map(chapter=>chapter.anchor),timeline.segments.filter(segment=>segment.shotSemantics).map(segment=>segment.startTime));
 assert.ok(chapters.every((chapter,index)=>chapter.contactTime===timeline.segments.filter(segment=>segment.shotSemantics)[index].startTime+timeline.segments.filter(segment=>segment.shotSemantics)[index].contactTime));
 assert.equal(chapters.at(-1).endTime,timeline.duration);
 assert.notEqual(chapters[1].endTime-chapters[1].startTime,chapters[2].endTime-chapters[2].startTime);
});

test('all guided lessons preserve authored shot ids and labels across non-shot transitions',()=>{
 for(const play of PICKLEBOARD_PLAYS){
  const chapters=buildShotChapters(compilePlayTimeline(play));
  const authored=play.steps.filter(step=>step.shot);
  assert.deepEqual(chapters.map(chapter=>chapter.shotId),authored.map(step=>step.id),play.id);
  assert.deepEqual(chapters.map(chapter=>chapter.label),authored.map(step=>step.label.replace(/^\s*\d+\.?\s*/,'')),play.id);
  assert.ok(chapters.every((chapter,index)=>chapter.endTime===(chapters[index+1]?.anchor??compilePlayTimeline(play).duration)),play.id);
 }
});

test('coincident anchors retain every destination and ties choose authored order',()=>{
 const chapters=Object.freeze([
  Object.freeze({shotId:'a',number:1,label:'A',anchor:1,startTime:1,endTime:1}),
  Object.freeze({shotId:'b',number:2,label:'B',anchor:1,startTime:1,endTime:3})
 ]);
 assert.equal(chapterAtTime(chapters,1).shotId,'b');
});

test('semantic mapping preserves relative position when durations change',()=>{
 const before=[{shotId:'a',anchor:0,startTime:0,endTime:2},{shotId:'b',anchor:2,startTime:2,endTime:6}];
 const after=[{shotId:'a',anchor:0,startTime:0,endTime:4},{shotId:'b',anchor:4,startTime:4,endTime:12}];
 assert.equal(mapSemanticPlayhead(before,after,4,6,12),8);
 assert.equal(mapSemanticPlayhead(before,after,6,6,12),12);
});

test('semantic mapping chooses the nearest surviving authored chapter after deletion',()=>{
 const before=[{shotId:'a',anchor:0,startTime:0,endTime:2},{shotId:'b',anchor:2,startTime:2,endTime:4},{shotId:'c',anchor:4,startTime:4,endTime:6}];
 const after=[{shotId:'a',anchor:0,startTime:0,endTime:3},{shotId:'c',anchor:3,startTime:3,endTime:7}];
 assert.equal(mapSemanticPlayhead(before,after,3,6,7),5);
});
