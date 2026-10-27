"""Optional Pillow review sheets; runtime atlas generation uses dependency-free Node."""
from PIL import Image, ImageDraw
from pathlib import Path
import json, subprocess
ROOT=Path(__file__).resolve().parents[2]
subprocess.run(['node',str(ROOT/'tools/generate-pixel-park.mjs')],check=True)
im=Image.open(ROOT/'assets/pixel-park/atlas.png').convert('RGBA')
source=ROOT/'source-art/pixel-park';source.mkdir(parents=True,exist_ok=True);im.save(source/'atlas-editable.png');im.resize((640,576),Image.Resampling.NEAREST).save(source/'atlas-review.png')
(source/'provenance.json').write_text(json.dumps({'name':'Leaf Court original park atlas','author':'Codex original pixel construction','generator':'tools/generate-pixel-park.mjs','externalAssets':[],'pixelScale':1,'tileSize':16,'palette':'Custom moss green, warm sand, terracotta, lake blue and slate ink','sprites':{'tree':[0,0,32,48],'bush':[32,0,16,17],'bench':[48,0,24,24],'flowers':[72,0,16,18],'fence':[96,0,32,16],'clubhouse':[48,32,64,64],'grass':[0,64,16,16],'path':[16,64,16,16],'pond':[0,80,32,48]}},indent=2)+'\n')
# Review sheet with mathematically correct 20x44 ft court at 4 pixels/ft.
def scene(w,h):
 out=Image.new('RGBA',(w,h),'#78bd72');q=ImageDraw.Draw(out);cx=(w-80)//2;cy=28;left=cx-13;right=cx+93;bottom=218
 def paste(name,x,y):
  box={'tree':(0,0,32,48),'bush':(32,0,48,17),'bench':(48,0,72,24),'flowers':(72,0,88,18),'fence':(96,0,128,16),'clubhouse':(48,32,112,96),'grass':(0,64,16,80),'grass1':(112,64,128,80),'grass2':(128,64,144,80),'grass3':(144,64,160,80),'path':(16,64,32,80),'pond':(0,80,32,128)}[name];t=im.crop(box);out.alpha_composite(t,(x,y))
 for y in range(0,h,16):
  for x in range(0,w,16):paste('grass'+str(((x//16*7+y//16*13) ^ (x//16*y//16))%4 or ''),x,y)
 q.rectangle((0,230,w,247),fill='#d2bd7e');q.rectangle((0,232,w,245),fill='#e8ce8b')
 for x in [left-26,right+14]:
  if x>0 and x+16<w:q.rectangle((x,0,x+15,h),fill='#e8ce8b')
 q.rectangle((left+3,21,right-3,217),fill='#489965');q.rectangle((cx-5,23,cx+85,209),fill='#40875e')
 for x in range(left,right,32):paste('fence',x,15);paste('fence',x,218)
 for x in [left,right]:
  q.rectangle((x,19,x+2,230),fill='#afc3c0')
  for y in range(15,228,16):q.rectangle((x-1,y,x+3,y+7),fill='#4b6870');q.rectangle((x,y,x+2,y+5),fill='#c2d1cb')
 for y in range(25,203,43):
  paste('tree',max(-24,left-62),y)
  if not(w-right>88 and y<100):paste('tree',min(w-8,right+31),y+6)
 for x in range(-16,w+16,30):
  if x+28<cx-3 or x>cx+81:paste('tree',x,-30)
 if w-right>88:paste('clubhouse',right+39,5);paste('flowers',right+82,78);paste('bench',right+73,143)
 if left>70:paste('pond',left-105,60);paste('bench',left-100,150)
 for x in [left+5,right-19]:
  for y in [35,189]:paste('flowers',x,y)
 q.rectangle((cx,cy,cx+79,cy+175),fill='#347fa7',outline='#f5ebc9',width=1)
 for y in [cy+60,cy+116]:q.line((cx,y,cx+79,y),fill='#f5ebc9')
 q.line((cx+40,cy,cx+40,cy+60),fill='#f5ebc9');q.line((cx+40,cy+116,cx+40,cy+175),fill='#f5ebc9')
 q.rectangle((cx-3,cy+86,cx+82,cy+89),fill='#293e4d');q.line((cx-3,cy+86,cx+82,cy+86),fill='#cad3c8')
 return out
scene(320,272).resize((960,816),Image.Resampling.NEAREST).save(source/'park-review.png')
scene(144,256).resize((432,768),Image.Resampling.NEAREST).save(source/'phone-review.png')
(source/'tile-map.json').write_text(json.dumps({'tileSize':16,'world':'Adaptive to viewport','court':{'width':80,'height':176,'feetPerPixel':0.25},'layers':['grass tile grid','path verge and sand','green runoff','fence rails','border trees','clubhouse pond benches flowers'],'desktopReview':{'width':320,'height':272,'courtOrigin':[120,28]},'phoneReview':{'width':144,'height':256,'courtOrigin':[32,28]}},indent=2)+'\n')
