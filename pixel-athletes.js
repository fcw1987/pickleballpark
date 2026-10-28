import {computePixelStroke,pixelContactSoles} from './pixel-strokes.js';
export {computePixelStroke,pixelContactSoles};
export const PIXEL_ATHLETE_PROVENANCE=Object.freeze({author:'Pickleball Park original procedural pixel artwork',license:'Project-owned original artwork; no external sprite sources',source:'tools/source-art/pixel-athlete-proof.mjs',nativeHeight:24});
const ink='#1c2940',shoe='#f1edce';
const kits={green:['#246c58','#48ad72','#92d68c'],orange:['#ad4437','#ed7650','#ffc47a']};
// Bresenham strokes and solid integer rectangles only: no raster blur or vectors.
function line(ctx,a,b,color,width=1){let x=Math.round(a.x),y=Math.round(a.y),ex=Math.round(b.x),ey=Math.round(b.y),dx=Math.abs(ex-x),sx=x<ex?1:-1,dy=-Math.abs(ey-y),sy=y<ey?1:-1,e=dx+dy;ctx.fillStyle=color;for(;;){ctx.fillRect(x,y,width,width);if(x===ex&&y===ey)break;let e2=e*2;if(e2>=dy){e+=dy;x+=sx;}if(e2<=dx){e+=dx;y+=sy;}}}
export function drawPixelAthlete(ctx,{x=0,y=0,scale=1,playerId='player1',kit='green',facing='front',handedness='right',shot,phase=3,contact,contactWeight,support,supportWeight,planted,modelVersion,footPoints,move=false,time=0}={}) {
 const type=typeof shot==='string'?shot:shot?.authoring?.family||shot?.family||shot?.type||'ready';
 const style=shot?.contact?.strokeSide||shot?.strokeSide||shot?.contactStyle||shot?.stroke;
 let pose=computePixelStroke({type,style,handedness,phase,facing,moving:move,time,planted:planted??(contactWeight>.5?true:undefined)});
 const canonicalSole={x,y};
 if(contact){const key=computePixelStroke({type,style,handedness,phase:1,facing});
  // The support base remains canonical. Adapt the stroke arc in the player's
  // local space, with fixed arm bones and a torso that follows the shoulder.
  const paddleTarget={x:(contact.x-x)/scale+pose.paddle.x-key.paddle.x,y:(contact.y-y)/scale+pose.paddle.y-key.paddle.y};
  pose=computePixelStroke({type,style,handedness,phase,facing,moving:move,time,paddleTarget,targetWeight:contactWeight??1,planted:planted??(contactWeight>.5?true:undefined)});}
 const rawSupportWeight=Math.max(0,Math.min(1,supportWeight??contactWeight??0)),supportRamp=Math.min(1,rawSupportWeight/.5),supportBlend=supportRamp*supportRamp*(3-2*supportRamp);
 const supportOffset=support?{x:(support.x-x)/scale*supportBlend,y:(support.y-y)/scale*supportBlend}:{x:0,y:0};
 pose={...pose,feet:pose.feet.map(foot=>({x:foot.x+supportOffset.x,y:foot.y+supportOffset.y}))};
 const physicalFeet=modelVersion===2&&Array.isArray(footPoints)&&footPoints.length===2&&footPoints.every(point=>Number.isFinite(point.x)&&Number.isFinite(point.y));
 if(physicalFeet)pose={...pose,feet:footPoints.map(point=>({x:(point.x-x)/scale,y:(point.y-y)/scale}))};
 const logicalPose=pose;
 const rasterPaddle={x:(Math.round(x+pose.paddle.x*scale)-Math.round(x))/scale,y:(Math.round(y+pose.paddle.y*scale)-Math.round(y))/scale};
 pose=computePixelStroke({type,style,handedness,phase,facing,moving:move,time,paddleTarget:rasterPaddle,targetWeight:1,planted:planted??(contactWeight>.5?true:undefined)});
 pose={...pose,feet:logicalPose.feet.map(foot=>({x:(Math.round(x+foot.x*scale)-Math.round(x))/scale,y:(Math.round(y+foot.y*scale)-Math.round(y))/scale}))};
 const rasterContact={x:Math.round(x)+Math.round(pose.paddle.x)*scale,y:Math.round(y)+Math.round(pose.paddle.y)*scale};
 const contactCorrection={x:0,y:0},contactBounded=!pose.reachable;
 const n=Number(String(playerId).replace(/\D/g,''))||1,palette=kits[kit]||kits.green;
 const skin=['#efbd8a','#ba7957','#e4aa77','#8e573e'][(n-1)%4],shade=['#bc8058','#844b39','#b4734e','#60372d'][(n-1)%4];
 const rear=String(facing).includes('back')||facing==='north';
 const left=String(facing).includes('left')||facing==='west',right=String(facing).includes('right')||facing==='east',profile=left||right,pureSide=facing==='left'||facing==='right'||facing==='west'||facing==='east';
 const headShift=left?-1:right?1:0;
 ctx.save();ctx.translate(Math.round(x),Math.round(y));ctx.scale(scale,scale);ctx.imageSmoothingEnabled=false;
 let bodyShift=false;const r=(a,b,w,h,c)=>{ctx.fillStyle=c;ctx.fillRect(Math.round(a+(bodyShift?pose.torsoOffset.x:0)),Math.round(b),w,h);};
 // Small pixel shadow, separated shoes, socks, shorts, shaded jersey.
 r(-5,0,10,1,'#233c4c66');
 const shoes=()=>{for(const f of pose.feet){if(physicalFeet){r(f.x-2,f.y-5,4,3,ink);r(f.x-1,f.y-4,2,2,skin);r(f.x-2,f.y-2,4,2,ink);r(f.x-1,f.y-1,2,1,shoe);}else{r(f.x-2,f.y-4,4,4,ink);r(f.x-1,f.y-4,2,2,skin);r(f.x-2,f.y-1,4,2,ink);r(f.x-1,f.y-1,3,1,shoe);}}};
 const legs=()=>{for(const f of pose.feet){line(ctx,{x:f.x,y:f.y-3},{x:f.x+pose.torsoOffset.x,y:-6+pose.torsoOffset.y},ink,3);line(ctx,{x:f.x,y:f.y-3},{x:f.x+pose.torsoOffset.x,y:-6+pose.torsoOffset.y},skin,2);}};
 // Model 2 anchors the bottom-center edge of the actual raster shoes. Draw
 // those shoes after the legs so their measured bottom row stays visible.
 if(physicalFeet){legs();shoes();}else{shoes();legs();}
 bodyShift=true;r(-4,-8+pose.torsoOffset.y,8,4,ink);r(-3,-8+pose.torsoOffset.y,3,3,'#344863');r(1,-8+pose.torsoOffset.y,2,3,'#4d617b');
 const c=pose.crouch+pose.torsoOffset.y;r(-5,-15+c,10,8-pose.crouch,ink);r(-4,-14+c,8,6-pose.crouch,palette[0]);r(-3,-14+c,6,4,palette[1]);r(-3,-14+c,2,2,palette[2]);r(2,-13+c,2,4,palette[0]);r(-3,-9+pose.torsoOffset.y,6,1,palette[2]);
 // Off hand counterbalances; elbow and wrist remain readable at native size.
 const off={x:pose.torsoOffset.x-(handedness==='left'?-3:3),y:-13+pose.torsoOffset.y};line(ctx,off,{x:off.x-2,y:off.y+3},ink,3);line(ctx,off,{x:off.x-2,y:off.y+3},skin,2);
 const arm=(a,b)=>{line(ctx,a,b,ink,3);line(ctx,{x:a.x,y:a.y},{x:b.x,y:b.y},skin,2);};arm(pose.shoulder,pose.elbow);arm(pose.elbow,pose.wrist);
 // Head silhouette and three discrete cap/hair styles, four distinct skin tones.
 r(-5,-23+c,10,9,ink);r(-6,-21+c,12,5,ink);r(-4,-21+c,8,7,shade);r(-4,-20+c,8,5,skin);r(-5,-23+c,10,4,n%2?'#443641':'#e5e8cf');r(-4,-24+c,8,3,n%2?palette[0]:'#f8f3dd');
 r(-3,-24+c,6,1,n%2?palette[1]:'#ffffff');r(-5,-21+c,11,1,n%2?palette[1]:palette[2]);
 if(n%2){r(-5,-19+c,2,4,'#5f4038');r(4,-20+c,2,3,'#5f4038');if(n===3){r(5,-22+c,3,4,'#5f4038');r(7,-21+c,2,3,'#8b5b3e');}}else{r(3,-21+c,4,2,palette[0]);r(4,-22+c,2,1,palette[2]);}
 if(!rear){r(-3+headShift,-18+c,2,2,ink);if(!pureSide)r(2+headShift,-18+c,1,2,ink);r(-3+headShift,-18+c,1,1,'#ffffff');r(headShift,-15+c,2,1,shade);if(profile){r(headShift*4,-18+c,1,2,skin);r(headShift*4,-22+c,2,1,palette[2]);}}else{r(-4,-19+c,8,4,'#594139');r(-3,-18+c,6,2,'#76503c');if(profile){r(headShift*5,-18+c,1,2,skin);r(headShift*3,-20+c,2,1,palette[1]);}}
 // Continuous visible handle terminates in the gripped hand; original paddle.
 line(ctx,pose.wrist,pose.paddle,ink,2);line(ctx,pose.wrist,pose.paddle,'#cc9a61');
 bodyShift=false;const p=pose.paddle;r(p.x-3,p.y-3,6,6,ink);r(p.x-4,p.y-2,8,4,ink);r(p.x-2,p.y-2,4,4,'#547786');r(p.x-3,p.y-1,6,2,'#547786');r(p.x-2,p.y-2,3,1,'#a0b5ad');r(pose.wrist.x,pose.wrist.y,2,2,skin);
 ctx.restore();return {...logicalPose,rasterContact,rasterPose:pose,...(physicalFeet?{rasterFeet:pose.feet.map(foot=>({x:Math.round(x)+Math.round(foot.x)*scale,y:Math.round(y)+Math.round(foot.y)*scale}))}:{}),sole:{x,y},canonicalSole,supportOffset,torsoOffset:logicalPose.torsoOffset,contactCorrection,contactBounded,contact:{x:x+logicalPose.paddle.x*scale,y:y+logicalPose.paddle.y*scale},scale};
}
export function drawPixelActor(ctx,o={}){return drawPixelAthlete(ctx,{...o,playerId:o.id||o.playerId,kit:o.team||o.kit,move:o.moving??o.move,shot:o.swing?.shot||o.shot,phase:o.swing?.phase??o.phase,contact:o.swing?.contact||o.contact});}
