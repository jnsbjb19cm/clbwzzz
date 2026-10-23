from PIL import Image, ImageDraw
from pathlib import Path
import json,math
src=Path(r"W:\.gd\_video_work\cutouts_fire3\attack"); recs=json.loads((src/'frames.json').read_text(encoding='utf-8'))
CELL=640; PAD=12; COLS=10; x0=min(r['crop_box'][0] for r in recs); y0=min(r['crop_box'][1] for r in recs); x1=max(r['crop_box'][2] for r in recs); y1=max(r['crop_box'][3] for r in recs)
m=8; ux0=x0-m; uy0=y0-m; uw=x1-x0+1+2*m; uh=y1-y0+1+2*m; sc=min((CELL-2*PAD)/uw,(CELL-2*PAD)/uh); ow=round(uw*sc); oh=round(uh*sc); ox=(CELL-ow)//2; oy=CELL-PAD-oh
frames=[]
for r in recs:
 im=Image.open(src/f"frame_{r['source_frame']:04d}.png").convert('RGBA'); cx0,cy0,cx1,cy1=r['crop_box']; can=Image.new('RGBA',(uw,uh),(0,0,0,0)); can.alpha_composite(im,(cx0-ux0,cy0-uy0)); cell=Image.new('RGBA',(CELL,CELL),(0,0,0,0)); cell.alpha_composite(can.resize((ow,oh),Image.LANCZOS),(ox,oy)); frames.append(cell)
rows=math.ceil(len(frames)/COLS); sheet=Image.new('RGBA',(COLS*CELL,rows*CELL),(0,0,0,0))
for i,f in enumerate(frames): sheet.alpha_composite(f,((i%COLS)*CELL,(i//COLS)*CELL))
sheet.save(r"W:\.gd\_video_work\fire3_sheet.png")
p=Path(r"W:\.gd\_video_work\fire3_preview"); p.mkdir(exist_ok=True)
for i,f in enumerate(frames):
 bg=Image.new('RGBA',(640,640),(255,255,255,255)); d=ImageDraw.Draw(bg)
 for yy in range(0,640,32):
  for xx in range(0,640,32):
   if (xx//32+yy//32)%2: d.rectangle([xx,yy,xx+31,yy+31],fill=(200,200,200,255))
 bg.alpha_composite(f); bg.convert('RGB').save(p/f"{i:02d}.png")
print('done',len(frames))
