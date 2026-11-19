import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {installDimensionalAudit} from './helpers/dimensional-audit.mjs';
import {reviewDocument} from '../tools/emerald-review/examples.mjs';
const source=JSON.parse(readFileSync(new URL('../docs/builder/examples/eight-shot-drive-drop.json',import.meta.url)));
test.use({serviceWorkers:'block'});

test('the optional teaching stop, simulator contact, actual blade and selected hand agree on the court',async({page})=>{
    await page.goto('/');
    await page.waitForFunction(()=>window.playBuilder?.view==='3d' && pickleboard.threeD.emeraldAthlete?.parent);
    await expect(page.locator('.builder-emerald-cue')).toHaveCount(0);
    await page.locator('.builder-context-menu summary').click();
    await page.getByRole('button',{name:'Emerald coaching'}).click();
    await page.locator('.builder-context-menu summary').click();
    await installDimensionalAudit(page);
    for(const key of ['backhand-dink','lob-chase','overhead','dink']){
        const doc=reviewDocument(key,'right',source);
        await page.evaluate(doc=>playBuilder.loadDocument(doc,{persist:false}),doc);
        for(const hand of ['right','left']){
            const target=await page.evaluate(async({hand,key})=>{
                const b=playBuilder,v=pickleboard.threeD;
                if(b.document.players.player1.handedness!==hand)await b.action('handedness',{id:'player1',value:hand});
                const leg=v.timeline.segments.find(s=>s.step.id===(key==='backhand-dink'?'kitchen':key==='dink'?'stroke':'recovery')).rallyLeg;
                const time=v.timeline.events.find(e=>e.type==='contact'&&e.rallyLeg===leg).time;
                b.seek(time-.015); return time;
            },{hand,key});
            await page.getByRole('button',{name:'Next contact',exact:true}).click();
            const state=await page.evaluate(async()=>{
                const b=playBuilder,v=pickleboard.threeD,a=v.emeraldAthlete,read=()=>{
                    const s=v.coverageSamples.player1,ball=v.ballObject.position,face=a.userData.animation.bodyFacing;
                    const dx=ball.x-a.position.x,dz=ball.z-a.position.z;
                    return {gap:window.__athleteAudit(a).paddleDistance(ball),front:dx*face.x+dz*face.z,across:dx*face.z-dz*face.x,
                        side:s.strokeSide,actual:a.userData.animation.backhand,hand:a.userData.handedness};};
                const hit=read(),time=b.session.clock.elapsed;
                const teachingSize=v.readableBall.sprite.scale.x;
                await b.action('emeraldCoaching',false);
                const trackingSize=v.readableBall.sprite.scale.x;
                await b.action('emeraldCoaching',true);
                v.cameraControls.setState({azimuth:1.5,elevation:23});v.applyAtTime(time);
                return {hit,orbit:read(),time,teachingSize,trackingSize,playing:b.session.playing,coach:b.emeraldCue.title};
            });
            expect(state.time).toBeCloseTo(target,7);expect(state.playing).toBe(false);
            expect(state.hit.gap).toBeLessThan(.037);expect(state.orbit.gap).toBeCloseTo(state.hit.gap,6);
            expect(state.teachingSize).toBeLessThan(state.trackingSize*.65);
            expect(state.hit.hand).toBe(hand);expect(state.hit.front).toBeGreaterThan(.08);
            expect(state.hit.actual).toBe(key==='backhand-dink');
            if(key==='backhand-dink'){
                expect(state.coach).toBe('Backhand dink · contact');
                expect(state.hit.across*(hand==='right'?1:-1)).toBeGreaterThan(.15);
            }else if(key==='dink')expect(state.coach).toBe('Forehand dink · contact');
            else expect(state.coach).toContain(key==='overhead'?'Overhead':'drop');
            const after=await page.evaluate(async time=>{
                const b=playBuilder;b.seek(b.session.duration>time+.64?time+.64:b.session.duration);const recovered=b.emeraldCue.title;
                const id='lesson-review';await b.action('scrubBegin',{id});await b.action('scrubSeek',{id,time});await b.action('scrubEnd',{id,time});
                return {recovered,back:b.emeraldCue.title};
            },target);
            expect(after.recovered).toBe('Ready');expect(after.back).toBe(state.coach);
        }
    }
});
