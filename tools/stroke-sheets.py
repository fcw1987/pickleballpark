import json,sys,os
from PIL import Image, ImageDraw, ImageFont
out=sys.argv[1]
r=json.load(open(os.path.join(out,'stroke-report.json')))
font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',17)
small=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',14)
allrows=[]
for case in r['cases']:
    frames=case['frames']; w,h=300,245
    sheet=Image.new('RGB',(w*5,h*((len(frames)+4)//5)+45),'#172733');d=ImageDraw.Draw(sheet)
    d.text((12,10),case['case']['id']+' | actual runtime phase samples',font=font,fill='white')
    for i,f in enumerate(frames):
        im=Image.open(os.path.join(out,f['file'])).convert('RGB');im.thumbnail((w,h-30))
        x=(i%5)*w+(w-im.width)//2;y=45+(i//5)*h
        sheet.paste(im,(x,y));d.text(((i%5)*w+6,y+h-28),f"{f['offset']:+.2f}s | {f['phase']}",font=small,fill='white')
    sheet.save(os.path.join(out,case['case']['id']+'-phases.jpg'),quality=92)
    allrows.append((case,[Image.open(os.path.join(out,frames[i]['file'])).convert('RGB') for i in [1,3,5,7,9]]))
# Preserve order in JSON key only. No shot labels appear on the recognition sheet.
w,h=280,220
blind=Image.new('RGB',(w*5,h*len(allrows)),'#172733')
for row,(_,ims) in enumerate(allrows):
    for col,im in enumerate(ims):
        im.thumbnail((w,h));blind.paste(im,(col*w+(w-im.width)//2,row*h))
blind.save(os.path.join(out,'stroke-unlabelled.jpg'),quality=92)
json.dump({'rowOrder':[c['case']['id'] for c,_ in allrows],'columns':'-0.32,-0.14,contact,+0.15,+0.44 seconds'},open(os.path.join(out,'stroke-unlabelled-key.json'),'w'),indent=2)
core_ids=['lob-right','backhand-drive-right','forehand-drive-right']
core_rows=[(c,ims) for wanted in core_ids for c,ims in allrows if c['case']['id']==wanted]
if len(core_rows)==3:
    core=Image.new('RGB',(w*5,h*3),'#172733')
    for row,(_,ims) in enumerate(core_rows):
        for col,im in enumerate(ims):
            im=im.copy();im.thumbnail((w,h));core.paste(im,(col*w+(w-im.width)//2,row*h))
    core.save(os.path.join(out,'stroke-unlabelled-core.jpg'),quality=92)
    json.dump({'rowOrder':core_ids,'columns':'-0.32,-0.14,contact,+0.15,+0.44 seconds'},open(os.path.join(out,'stroke-unlabelled-core-key.json'),'w'),indent=2)
