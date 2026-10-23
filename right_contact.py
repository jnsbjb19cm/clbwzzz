from PIL import Image, ImageDraw
from pathlib import Path
import json,math
d=Path(r"W:\.gd\_video_work\idle_right_test\idle"); recs=json.loads((d/'frames.json').read_text(encoding='utf-8'))
CELL=640; PAD=12; x0=min(r['crop_box'][0] for r in recs); y0=min(r['crop_box'][1] for r in recs); x1=max(r['crop_box'][2] for r in recs); y1=max(r['crop_box'][3] for r in recs); m=6; uw=x1-x0+1+2*m; uh=y1-y0+1+2*m
sc=min((CELL-2*PAD)/uw,(CELL-2*PAD)/uh); ow=round(uw*sc); oh=round(uh*sc); ox=(CELL-ow)//2; oy=CELL-PAD-oh
frames=[]
for r in recs:
 im=Image.open(d/f"frame_{r['source_frame']:04d}.png").convert('RGBA'); u=Image.new('RGBA',(uw,uh),(0,0,0,0)); u.alpha_composite(im,(r['crop_box'][0]-x0+m,r['crop_box'][1]-y0+m)); c=Image.new('RGBA',(CELL,CELL),(0,0,0,0)); c.alpha_composite(u.resize((ow,oh),Image.LANCZOS),(ox,oy)); frames.append(c)
for i in [0,15,30,45,59]:
 ck=Image.new('RGB',(640,640),(255,255,255)); ck.paste(frames[i].convert('RGB'),(0,0),frames[i]); ck.save(rf"W:\.gd\_video_work\rightframe_{i}.png")
print('ok')
