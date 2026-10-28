// Original integer-grid stroke choreography. Coordinates are relative to the soles.
// Screen y points down. Every pose uses the same two 4.5 px arm bones.
export const PIXEL_STROKE_FAMILIES = Object.freeze(['serve','return','forehand','backhand','drive','drop','dink','volley','block','reset','short-hop','lob','overhead']);
export const PIXEL_STROKE_PHASES = Object.freeze(['prepare','contact','follow','recover']);
const profiles = {
 ready:[[7,-11],[7,-11],[7,-11],[7,-11]],
 serve:[[7,-7],[9,-10],[-1,-18],[7,-11]],
 return:[[9,-14],[10,-12],[-3,-17],[7,-11]],
 forehand:[[9,-14],[10,-12],[-3,-17],[7,-11]],
 backhand:[[-8,-13],[-9,-12],[5,-17],[7,-11]],
 drive:[[10,-15],[8,-11],[-4,-18],[7,-11]],
 drop:[[7,-8],[9,-10],[5,-14],[7,-11]],
 dink:[[6,-8],[5,-9],[7,-12],[7,-11]],
 volley:[[5,-15],[6,-12],[10,-14],[7,-11]],
 block:[[5,-13],[5,-12],[8,-11],[7,-11]],
 reset:[[5,-11],[4,-10],[7,-10],[7,-11]],
 'short-hop':[[5,-6],[8,-7],[7,-11],[7,-11]],
 lob:[[6,-7],[8,-11],[3,-22],[7,-11]],
 overhead:[[3,-24],[7,-23],[9,-12],[7,-11]]
};
const mix=(a,b,t)=>a+(b-a)*t;
export function computePixelStroke({type='ready',style,strokeSide,handedness='right',phase=1,facing='front',moving=false,time=0,paddleTarget,targetWeight=1,planted:plantOverride}={}) {
 const family=profiles[type]?type:'ready';
 const back=(strokeSide||style)==='backhand'||family==='backhand';
 const viewFlip=String(facing).includes('back')||facing==='north'?1:-1;
 const hand=(handedness==='left'?-1:1)*viewFlip;
 const side=hand*(back&&family!=='backhand'?-1:1);
 const p=typeof phase==='string'?Math.max(0,PIXEL_STROKE_PHASES.indexOf(phase)):Math.max(0,Math.min(3,Number(phase)||0));
 const i=Math.min(2,Math.floor(p)),t=p-i,keys=profiles[family];
 const paddle={x:mix(keys[i][0],keys[i+1][0],t)*side,y:mix(keys[i][1],keys[i+1][1],t)};
 let torsoOffset={x:0,y:0};
 if(paddleTarget){const w=Math.max(0,Math.min(1,targetWeight));paddle.x=mix(paddle.x,paddleTarget.x,w);paddle.y=mix(paddle.y,paddleTarget.y,w);}
 const shoulder={x:hand*(back?0:3),y:-14};
 const shoulderDistance=Math.hypot(paddle.x-shoulder.x,paddle.y-shoulder.y);
 if(shoulderDistance>12.95){const shift=Math.min(8.5,shoulderDistance-12.95);torsoOffset={x:(paddle.x-shoulder.x)/shoulderDistance*shift,y:(paddle.y-shoulder.y)/shoulderDistance*shift};shoulder.x+=torsoOffset.x;shoulder.y+=torsoOffset.y;}

 // Paddle handle extends 4 pixels toward the shoulder. Fixed-length IK arms.
 const dx=shoulder.x-paddle.x,dy=shoulder.y-paddle.y,len=Math.hypot(dx,dy)||1;
 const wrist={x:paddle.x+dx/len*4,y:paddle.y+dy/len*4};
 const ax=wrist.x-shoulder.x,ay=wrist.y-shoulder.y,d=Math.hypot(ax,ay),reach=Math.min(d,9),h=Math.sqrt(4.5**2-(reach/2)**2);
 const elbow={x:(shoulder.x+wrist.x)/2-(d>1e-8?ay/d:1)*h*hand,y:(shoulder.y+wrist.y)/2+(d>1e-8?ax/d:0)*h*hand};
 const planted=plantOverride??(family!=='ready'&&p>.65&&p<1.4);
 const gait=moving&&!planted?Math.sin(time*15):0;
 const spread=['dink','short-hop','block','reset'].includes(family)?4:3;
 const step=!planted&&!moving&&family!=='ready'?(p<.65?-1:p>1.4&&p<2.7?1:0):0;
 return {family,phase:p,torsoOffset,backhand:back,handedness,shoulder,wrist,elbow,paddle,reach:d,reachable:d<=9.01,planted,
  facing,feet:[{x:-spread-gait*2-step,y:Math.min(0,gait*2)-Math.abs(step)},{x:spread-gait*2+step,y:Math.min(0,-gait*2)}],
  crouch:['dink','short-hop','reset'].includes(family)?1:0};
}
export function pixelContactSoles(contact,options={}) {
 const pose=computePixelStroke({...options,phase:'contact'}),scale=options.scale||1;
 return {x:contact.x-pose.paddle.x*scale,y:contact.y-pose.paddle.y*scale};
}
