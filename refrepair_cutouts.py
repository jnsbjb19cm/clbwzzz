from PIL import Image
import numpy as np, json, shutil
from pathlib import Path
WORK=Path(r"W:\.gd\_video_work"); SRC=WORK/"cutouts_v13"; DST=WORK/"cutouts_v13_refrepair"
if DST.exists(): shutil.rmtree(DST)
ref=Image.open(WORK/"reference_cutout.png").convert('RGBA'); ra=np.array(ref); ys,xs=np.where(ra[...,3]>16); rx0,ry0,rx1,ry1=xs.min(),ys.min(),xs.max(),ys.max(); refc=ref.crop((rx0,ry0,rx1+1,ry1+1))
for anim in ['attack','idle']:
    (DST/anim).mkdir(parents=True,exist_ok=True)
    recs=json.loads((SRC/anim/'frames.json').read_text(encoding='utf-8'))
    for r in recs:
        k=r['source_frame']; sp=SRC/anim/f"frame_{k:04d}.png"; dp=DST/anim/f"frame_{k:04d}.png"
        if anim=='attack' and k>=162:
            x0,y0,x1,y1=r['crop_box']; tw=x1-x0+1; th=y1-y0+1
            rimg=refc.resize((tw,th),Image.LANCZOS)
            full=Image.new('RGBA',(1920,1080),(0,0,0,0)); full.alpha_composite(rimg,(x0,y0))
            crop=full.crop((x0,y0,x1+1,y1+1)); crop.save(dp,compress_level=6)
        else:
            shutil.copy2(sp,dp)
    shutil.copy2(SRC/anim/'frames.json',DST/anim/'frames.json')
print('done')
