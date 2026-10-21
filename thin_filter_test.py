from PIL import Image, ImageDraw
import numpy as np
from scipy import ndimage as ndi
from pathlib import Path
src=open(r"D:\.丛林\battle\build_v11.py",encoding='utf-8-sig').read(); idx=src.index("\nfrom pathlib import Path\nimport json,time\nSRC="); exec(src[:idx])
for k in [168,178,100,524]:
    rgba,bbox,gap,cobtop=segment_and_save(rf"W:\.gd\_video_work\frames_full\frame_{k:04d}.png")
    rgb=rgba[...,:3]; a=rgba[...,3]>127
    srcim=np.array(Image.open(rf"W:\.gd\_video_work\frames_full\frame_{k:04d}.png").convert('RGB').resize((1920,1080),Image.LANCZOS)).astype(np.float32)
    R,G,B=srcim[...,0],srcim[...,1],srcim[...,2]; V=srcim.max(2)/255.; S=(srcim.max(2)-srcim.min(2))/np.maximum(srcim.max(2),1)
    blue=(B>G*1.03)&(B>R*1.35)&(S>0.35)&(V>0.18)
    # map alpha back to full half frame to compute near-ball? rgba is cropped; need bbox
    bx0,by0,bx1,by1=bbox; afull=np.zeros((1080,1920),bool); afull[by0:by1+1,bx0:bx1+1]=a
    near=ndi.binary_dilation(blue,iterations=60)
    thin=afull&~ndi.binary_opening(afull,np.ones((15,15),bool))
    remove=thin&near
    afull2=afull&~remove
    # render crop from rgb (cropped)
    a2=afull2[by0:by1+1,bx0:bx1+1]
    out=np.dstack([rgb,np.where(a2,255,0).astype(np.uint8)])
    im=Image.fromarray(out,'RGBA'); chk=Image.new('RGBA',im.size,(255,255,255,255)); d=ImageDraw.Draw(chk)
    for y in range(0,im.height,32):
        for x in range(0,im.width,32):
            if (x//32+y//32)%2: d.rectangle([x,y,x+31,y+31],fill=(200,200,200,255))
    compo=chk.copy(); compo.alpha_composite(im); compo.convert('RGB').save(rf"W:\.gd\_video_work\thintest_{k}.png")
    print(k,'remove',int(remove.sum()),'thin',int(thin.sum()))
