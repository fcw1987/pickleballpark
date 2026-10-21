import test from 'node:test';
import assert from 'node:assert/strict';
import { CoachingSession } from '../coaching-session.js';

test('play completes final recovery, holds, then always repeats without backwards flight', () => {
 const s=new CoachingSession();s.reset(4);s.play(0);
 assert.equal(s.tick(4000),4);assert.equal(s.holding,true);assert.equal(s.iteration,0);
 assert.equal(s.tick(4500),4);assert.equal(s.holdElapsed,.5);
 assert.equal(s.tick(5000),0);assert.equal(s.iteration,1);assert.equal(s.holding,false);
});
test('50 repetitions and multi-boundary jumps have bounded state and no drift',()=>{
 const s=new CoachingSession();s.reset(4);s.play(0);s.tick(250000);
 assert.equal(s.iteration,50);assert.equal(s.clock.elapsed,0);assert.equal(s.holdElapsed,0);
 s.tick(253250);assert.equal(s.clock.elapsed,3.25);

});
test('pause freezes end hold and resume consumes the remainder before repeating',()=>{
 const s=new CoachingSession();s.reset(4);s.play(0);s.tick(4000);s.pause(4250);
 s.tick(100000);assert.equal(s.holdElapsed,.25);assert.equal(s.clock.elapsed,4);
 s.play(100000);s.tick(100250);assert.equal(s.holdElapsed,.5);
 s.tick(100750);assert.equal(s.clock.elapsed,0);assert.equal(s.iteration,1);
});
test('endpoint seeking shows the final pose and Play starts the next repetition at zero',()=>{
 const s=new CoachingSession();s.reset(4);s.clock.setRate(.5);s.seek(4);
 assert.equal(s.clock.elapsed,4);assert.equal(s.holding,false);assert.equal(s.playing,false);
 s.play(10);assert.equal(s.clock.elapsed,0);assert.equal(s.playing,true);assert.equal(s.clock.playing,true);
 assert.equal(s.clock.playbackRate,.5);
 s.reset(0);s.tick(99999);assert.equal(s.holding,false);assert.equal(s.clock.elapsed,0);
});

test('legacy loop preferences cannot disable the repeat policy',()=>{
 const s=new CoachingSession();s.reset(1);s.loop=false;s.setLoop(false);s.play(0);s.tick(2000);
 assert.equal(s.loop,true);assert.equal(s.iteration,1);assert.equal(s.clock.elapsed,0);assert.equal(s.playing,true);
});

test('scrub preserves playing intent but Pause wins over a later pointer release',()=>{
 const s=new CoachingSession();s.reset(8);s.play(0);s.tick(1000);
 assert.equal(s.beginScrub('drag-1',1000),true);assert.equal(s.playing,true);assert.equal(s.clock.playing,false);
 assert.equal(s.scrubSeek('drag-1',5.5),5.5);s.pause(1000);
 assert.equal(s.endScrub('drag-1',2000),true);assert.equal(s.playing,false);assert.equal(s.clock.playing,false);assert.equal(s.clock.elapsed,5.5);
});

test('completed scrub resumes only the current operation and cancellation stays paused',()=>{
 const s=new CoachingSession();s.reset(8);s.play(0);s.beginScrub(1,0);s.scrubSeek(1,3);
 assert.equal(s.endScrub(99,100),false);assert.equal(s.clock.playing,false);
 assert.equal(s.endScrub(1,100),true);assert.equal(s.clock.playing,true);assert.equal(s.playing,true);
 s.beginScrub(2,100);s.scrubSeek(2,6);assert.equal(s.cancelScrub(2),true);
 assert.equal(s.playing,false);assert.equal(s.clock.playing,false);assert.equal(s.clock.elapsed,6);
});

test('tap seek preserves running or paused intent without changing iteration',()=>{
 const s=new CoachingSession();s.reset(8);s.play(0);s.tick(1000);s.seek(4,{preserveIntent:true,timestamp:1000});
 assert.equal(s.playing,true);assert.equal(s.clock.playing,true);assert.equal(s.clock.elapsed,4);assert.equal(s.iteration,0);
 s.pause(1000);s.seek(2,{preserveIntent:true});assert.equal(s.playing,false);assert.equal(s.clock.playing,false);assert.equal(s.clock.elapsed,2);
});

test('suspension resumes only if no newer explicit Pause changed intent',()=>{
 const s=new CoachingSession();s.reset(8);s.play(0);const first=s.suspend(500);
 assert.equal(s.playing,true);assert.equal(s.clock.playing,false);assert.equal(s.resumeSuspension(first,500),true);
 const second=s.suspend(600);s.pause(600);assert.equal(s.resumeSuspension(second,700),false);
 assert.equal(s.clock.playing,false);assert.equal(s.playing,false);
});
