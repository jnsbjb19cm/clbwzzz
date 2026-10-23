from PIL import Image, ImageDraw
import numpy as np, json
from scipy import ndimage as ndi
from pathlib import Path
ref=Image.open(r"W:\.gd\_video_work\reference_cutout.png").convert('RGBA')
ra=np.array(ref); ys,xs=np.where(ra[...,3]>16); rx0,ry0,rx1,ry1=xs.min(),ys.min(),xs.max(),ys.max(); refc=ref.crop((rx0,ry0,rx1+1,ry1+1))
for k,anim in [(100,'attack'),(524,'idle'),(540,'idle'),(168,'attack'),(162,'attack')]:
    recs=json.loads(Path(rf"W:\.gd\_video_work\cutouts_v13\{anim}\frames.json").read_text(encoding='utf-8'))
    r=[z for z in recs if z['source_frame']==k][0]; x0,y0,x1,y1=r['crop_box']; tw=x1-x0+1; th=y1-y0+1
    arr=np.array(Image.open(rf"W:\.gd\_video_work\cutouts_v13\{anim}\frame_{k:04d}.png").convert('RGBA')); rgb=arr[...,:3]; a=arr[...,3]
    afull=np.zeros((1080,1920),bool); afull[y0:y1+1,x0:x1+1]=a>127
    rimg=refc.resize((tw,th),Image.LANCZOS); rarr=np.array(rimg)
    ralpha=np.zeros((1080,1920),bool); ralpha[y0:y1+1,x0:x1+1]=rarr[...,3]>16
    allowed=ndi.binary_dilation(ralpha,iterations=10)
    afull2=afull&allowed
    # fill holes and keep main
    afull2=ndi.binary_closing(afull2,np.ones((3,3),bool)); afull2=ndi.binary_fill_holes(afull2)
    lab,n=ndi.label(afull2,np.ones((3,3),bool)); sizes=ndi.sum(afull2,lab,range(1,n+1));
    if n: afull2=lab==(int(np.argmax(sizes))+1)
    a2=afull2[y0:y1+1,x0:x1+1]
    # feather
    af=ndi.gaussian_filter(afull2.astype(np.float32),0.5); af[~ndi.binary_dilation(afull2,iterations=1)]=0
    a2=(np.clip(af,0,1)[y0:y1+1,x0:x1+1]*255).astype(np.uint8)
    im=Image.fromarray(np.dstack([rgb,a2]),'RGBA'); chk=Image.new('RGBA',im.size,(255,255,255,255)); d=ImageDraw.Draw(chk)
    for y in range(0,im.height,32):
        for x in range(0,im.width,32):
            if (x//32+y//32)%2: d.rectangle([x,y,x+31,y+31],fill=(200,200,200,255))
    compo=chk.copy(); compo.alpha_composite(im); compo.convert('RGB').save(rf"W:\.gd\_video_work\refclip_{k}.png")
    print(k,im.size)
