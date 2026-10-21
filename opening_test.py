from PIL import Image, ImageDraw
import numpy as np
from scipy import ndimage as ndi
from pathlib import Path
src=open(r"D:\.丛林\battle\build_v11.py",encoding='utf-8-sig').read(); idx=src.index("\nfrom pathlib import Path\nimport json,time\nSRC="); exec(src[:idx])
for k in [168,524]:
    rgba,bbox,gap,cobtop=segment_and_save(rf"W:\.gd\_video_work\frames_full\frame_{k:04d}.png")
    rgb=rgba[...,:3]; a=rgba[...,3]>127
    for sz in [3,5,7,9,11,15]:
        op=ndi.binary_opening(a,np.ones((sz,sz),bool))
        out=np.dstack([rgb,np.where(op,255,0).astype(np.uint8)])
        im=Image.fromarray(out,'RGBA'); chk=Image.new('RGBA',im.size,(255,255,255,255)); d=ImageDraw.Draw(chk)
        for y in range(0,im.height,32):
            for x in range(0,im.width,32):
                if (x//32+y//32)%2: d.rectangle([x,y,x+31,y+31],fill=(200,200,200,255))
        compo=chk.copy(); compo.alpha_composite(im); compo.convert('RGB').save(rf"W:\.gd\_video_work\opentest_{k}_{sz}.png")
    print('done',k,rgba.shape)
