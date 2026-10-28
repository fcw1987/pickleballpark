/** Original 16px tile park; editable PNG and construction source in source-art/pixel-park. */
const atlas = typeof Image === 'undefined' ? null : new Image();
if (atlas) atlas.src = new URL('./assets/pixel-park/atlas.png', import.meta.url).href;
export const pixelEnvironmentReady = atlas ? new Promise(resolve => {
  if (atlas.complete && atlas.naturalWidth) resolve();
  else { atlas.addEventListener('load', resolve, {once:true}); atlas.addEventListener('error', resolve, {once:true}); }
}) : Promise.resolve();
const SPRITES = {tree:[0,0,32,48],bush:[32,0,16,17],bench:[48,0,24,24],flowers:[72,0,16,18],fence:[96,0,32,16],clubhouse:[48,32,64,64],grass:[0,64,16,16],grass1:[112,64,16,16],grass2:[128,64,16,16],grass3:[144,64,16,16],path:[16,64,16,16],pond:[0,80,32,48]};
export function drawPixelEnvironment(ctx,{width,height,court,theme,time}={}) {
  const w=Math.ceil(width),h=Math.ceil(height);
  const c=court || {x:Math.round((w-80)/2),y:28,width:80,height:176};
  ctx.save(); ctx.imageSmoothingEnabled=false;
  ctx.fillStyle='#78bd72';ctx.fillRect(0,0,w,h);
  if (!atlas?.complete || !atlas.naturalWidth) {ctx.restore();return;}
  function sprite(name,x,y){const [sx,sy,sw,sh]=SPRITES[name];ctx.drawImage(atlas,sx,sy,sw,sh,Math.round(x),Math.round(y),sw,sh);}
  for(let y=0;y<h;y+=16)for(let x=0;x<w;x+=16)sprite('grass'+String(((x/16*7+y/16*13)^(x/16*y/16))%4 || ''),x,y);
  const left=Math.round(c.x-13),right=Math.round(c.x+c.width+13),top=Math.round(c.y-13),bottom=Math.round(c.y+c.height+14);
  // Continuous sandy paths have a darker broken verge and warm center.
  function path(x,y,pw,ph){ctx.fillStyle='#a6b36b';ctx.fillRect(x-2,y-2,pw+4,ph+4);ctx.fillStyle='#d2bd7e';ctx.fillRect(x-1,y-1,pw+2,ph+2);ctx.fillStyle='#e8ce8b';ctx.fillRect(x,y,pw,ph);for(let yy=y;yy<y+ph;yy+=16)for(let xx=x;xx<x+pw;xx+=32){ctx.save();ctx.beginPath();ctx.rect(x,y,pw,ph);ctx.clip();sprite('path',xx,yy);ctx.restore();}}
  path(0,bottom+12,w,16);
  if(left>30)path(left-26,0,16,bottom+16);
  if(w-right>30)path(right+14,0,16,h);
  ctx.fillStyle='#489965';ctx.fillRect(left+3,top+6,right-left-6,bottom-top-7);
  ctx.fillStyle='#40875e';ctx.fillRect(c.x-5,c.y-5,c.width+10,c.height+10);
  // Rail fence outside run-off, never encroaching on playing geometry.
  for(let x=left;x<right;x+=32){ctx.save();ctx.beginPath();ctx.rect(left,top,right-left,16);ctx.clip();sprite('fence',x,top);ctx.restore();}
  for(let x=left;x<right;x+=32){ctx.save();ctx.beginPath();ctx.rect(left,bottom,right-left,16);ctx.clip();sprite('fence',x,bottom);ctx.restore();}
  for(const x of [left,right]) {
    ctx.fillStyle='#3b5861';ctx.fillRect(x,top+4,3,bottom-top+8);ctx.fillStyle='#bbcdca';ctx.fillRect(x,top+4,1,bottom-top+8);
    for(let y=top;y<bottom+10;y+=16){ctx.fillStyle='#4b6870';ctx.fillRect(x-1,y,5,8);ctx.fillStyle='#afc3c0';ctx.fillRect(x,y,3,7);ctx.fillStyle='#e3e9d5';ctx.fillRect(x,y,2,2);}
  }
  // Dense staggered tree borders frame the world, clipped naturally on phones.
  for(let x=-16;x<w+16;x+=30) { if(x+28<c.x-3 || x>c.x+c.width+1 || top>29) sprite('tree',x,-30); }
  for(let y=25;y<bottom-15;y+=43){if(left>=25)sprite('tree',Math.max(-12,left-62),y);else sprite('tree',-24,y);if(w-right>=25){if(!(w-right>88 && y<100))sprite('tree',Math.min(w-20,right+31),y+6);}else sprite('tree',w-8,y+6);}
  if(w-right>88){sprite('clubhouse',right+39,5);sprite('flowers',right+82,78);sprite('flowers',right+82,105);sprite('bench',right+73,143);sprite('bush',right+80,192);}
  if(left>70){sprite('pond',left-105,60);sprite('bench',left-100,150);sprite('flowers',left-99,190);}
  // Outer groves occupy wide screens without changing the central court framing.
  if(w>340){
    for(let y=22;y<bottom-20;y+=46){sprite('tree',-10+(Math.floor(y/46)%2)*9,y);sprite('tree',w-28-(Math.floor(y/46)%2)*7,y+14);}
    sprite('bush',28,34);sprite('flowers',34,119);sprite('bush',w-57,111);sprite('flowers',w-51,183);
  }
  if(left>70){sprite('flowers',left-91,42);sprite('bush',left-85,119);}

  for(let x=2;x<w;x+=37){if(x<c.x-8 || x>c.x+c.width+7)sprite('bush',x,bottom+31);}
  ctx.restore();
}
