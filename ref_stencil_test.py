from PIL import Image, ImageDraw
import numpy as np, json
from pathlib import Path
ref=Image.open(r"W:\.gd\_video_work\reference_cutout.png").convert('RGBA')
# reference alpha bbox
ra=np.array(ref); ys,xs=np.where(ra[...,3]>16); rx0,ry0,rx1,ry1=xs.min(),ys.min(),xs.max(),ys.max()
refc=ref.crop((rx0,ry0,rx1+1,ry1+1))
# target crop boxes from cutouts_final2
for k,anim in [(100,'attack'),(524,'idle'),(540,'idle'),(168,'attack')]:
    recs=json.loads(Path(rf"W:\.gd\_video_work\cutouts_final2\{anim}\frames.json").read_text(encoding='utf-8'))
    r=[z for z in recs if z['source_frame']==k][0]; x0,y0,x1,y1=r['crop_box']
    src=Image.open(rf"W:\.gd\_video_work\frames_full\frame_{k:04d}.png").convert('RGB').resize((1920,1080),Image.LANCZOS)
    tw=x1-x0+1; th=y1-y0+1
    rimg=refc.resize((tw,th),Image.LANCZOS)
    # use reference RGBA composited at bbox, but source RGB where ref alpha
    out=Image.new('RGBA',(1920,1080),(0,0,0,0))
    out.alpha_composite(rimg,(x0,y0))
    # replace RGB with source for all ref alpha pixels
    oa=np.array(out); sa=np.array(src)
    m=oa[...,3]>0; oa[m,:3]=sa[m,:3]
    # crop bbox
    crop=Image.fromarray(oa[y0:y1+1,x0:x1+1],'RGBA')
    chk=Image.new('RGBA',crop.size,(255,255,255,255)); d=ImageDraw.Draw(chk)
    for yy in range(0,crop.height,32):
        for xx in range(0,crop.width,32):
            if (xx//32+yy//32)%2: d.rectangle([xx,yy,xx+31,yy+31],fill=(200,200,200,255))
    compo=chk.copy(); compo.alpha_composite(crop); compo.convert('RGB').save(rf"W:\.gd\_video_work\refstencil_{k}.png")
    print(k,tw,th)
