from PIL import Image, ImageDraw
import numpy as np, json
from scipy import ndimage as ndi
from pathlib import Path
cutdir=Path(r"W:\.gd\_video_work\cutouts_v11\attack")
recs=json.loads((cutdir/'frames.json').read_text(encoding='utf-8'))
for k in [162,168,174,179,132]:
    r=[z for z in recs if z['source_frame']==k][0]; x0,y0,x1,y1=r['crop_box']
    cut=Image.open(cutdir/f"frame_{k:04d}.png").convert('RGBA'); arr=np.array(cut); rgb=arr[...,:3]; a=arr[...,3]
    src=np.array(Image.open(rf"W:\.gd\_video_work\frames_full\frame_{k:04d}.png").convert('RGB').resize((1920,1080),Image.LANCZOS)).astype(np.float32)
    R,G,B=src[...,0],src[...,1],src[...,2]; V=src.max(2)/255.; S=(src.max(2)-src.min(2))/np.maximum(src.max(2),1)
    blue=(B>G*1.03)&(B>R*1.35)&(S>0.35)&(V>0.18)
    afull=np.zeros((1080,1920),bool); afull[y0:y1+1,x0:x1+1]=a>127
    near=ndi.binary_dilation(blue,iterations=60) if blue.any() else np.zeros_like(afull)
    thin=afull&~ndi.binary_opening(afull,np.ones((15,15),bool))
    remove=thin&near
    afull2=afull&~remove
    a2=afull2[y0:y1+1,x0:x1+1]
    # use current RGB, zero alpha for removed
    out=rgb.copy(); outa=np.where(a2,255,0).astype(np.uint8)
    im=Image.fromarray(np.dstack([out,outa]),'RGBA')
    # checker
    chk=Image.new('RGBA',im.size,(255,255,255,255)); d=ImageDraw.Draw(chk)
    for yy in range(0,im.height,32):
        for xx in range(0,im.width,32):
            if (xx//32+yy//32)%2: d.rectangle([xx,yy,xx+31,yy+31],fill=(200,200,200,255))
    compo=chk.copy(); compo.alpha_composite(im); compo.convert('RGB').save(rf"W:\.gd\_video_work\patchtest_{k}.png")
    print(k,'remove',int(remove.sum()),'blue',int(blue.sum()))
