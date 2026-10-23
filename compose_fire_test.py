from PIL import Image, ImageDraw
from pathlib import Path
import json,math,shutil
src=Path(r"W:\.gd\_video_work\cutouts_fire\attack"); out=Path(r"W:\.gd\_video_work\fire_sheet"); out.mkdir(exist_ok=True)
recs=json.loads((src/'frames.json').read_text(encoding='utf-8'))
CELL=640; PAD=12; COLS=10
x0=min(r['crop_box'][0] for r in recs); y0=min(r['crop_box'][1] for r in recs); x1=max(r['crop_box'][2] for r in recs); y1=max(r['crop_box'][3] for r in recs)
m=8; ux0=x0-m; uy0=y0-m; uw=x1-x0+1+2*m; uh=y1-y0+1+2*m; scale=min((CELL-2*PAD)/uw,(CELL-2*PAD)/uh); ow=round(uw*scale); oh=round(uh*scale); ox=(CELL-ow)//2; oy=CELL-PAD-oh
frames=[]
for r in recs:
    im=Image.open(src/f"frame_{r['source_frame']:04d}.png").convert('RGBA'); cx0,cy0,cx1,cy1=r['crop_box']; canvas=Image.new('RGBA',(uw,uh),(0,0,0,0)); canvas.alpha_composite(im,(cx0-ux0,cy0-uy0)); cell=Image.new('RGBA',(CELL,CELL),(0,0,0,0)); cell.alpha_composite(canvas.resize((ow,oh),Image.LANCZOS),(ox,oy)); frames.append(cell)
rows=math.ceil(len(frames)/COLS); sheet=Image.new('RGBA',(COLS*CELL,rows*CELL),(0,0,0,0))
for i,f in enumerate(frames): sheet.alpha_composite(f,((i%COLS)*CELL,(i//COLS)*CELL))
sheet.save(out/'fire_attack_sheet.png')
# contact on checker 240
cellw=240; cols=10; rows2=math.ceil(len(frames)/cols); contact=Image.new('RGB',(cols*cellw,rows2*(cellw+18)),(255,255,255)); d=ImageDraw.Draw(contact)
for i,f in enumerate(frames):
    ck=Image.new('RGBA',(cellw,cellw),(255,255,255,255)); d2=ImageDraw.Draw(ck)
    for yy in range(0,cellw,32):
        for xx in range(0,cellw,32):
            if (xx//32+yy//32)%2: d2.rectangle([xx,yy,xx+31,yy+31],fill=(200,200,200,255))
    ck.alpha_composite(f.resize((cellw,cellw),Image.LANCZOS)); x=(i%cols)*cellw; y=(i//cols)*(cellw+18); contact.paste(ck.convert('RGB'),(x,y)); d.text((x+3,y+cellw+1),str(i),fill=(0,0,0))
contact.save(out/'fire_attack_contact.jpg',quality=92)
print(sheet.size,len(frames))
