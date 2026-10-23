from PIL import Image, ImageDraw
import numpy as np
from scipy import ndimage as ndi
from pathlib import Path
src_code=open(r"D:\.丛林\battle\build_v11.py",encoding='utf-8-sig').read(); idx=src_code.index("\nfrom pathlib import Path\nimport json,time\nSRC="); exec(src_code[:idx])
bg=np.array(Image.open(r"W:\.gd\_video_work\bg_plate_360_479.png").convert('RGB')).astype(np.int16)
for k in [360,378,390,405,420,450,478]:
    rgba,bbox,gap,cobtop=segment_and_save(rf"W:\.gd\_video_work\frames_full\frame_{k:04d}.png")
    x0,y0,x1,y1=bbox; full=np.zeros((1080,1920,4),np.uint8); full[y0:y1+1,x0:x1+1]=rgba
    src=np.array(Image.open(rf"W:\.gd\_video_work\frames_full\frame_{k:04d}.png").convert('RGB').resize((1920,1080),Image.LANCZOS))
    diff=np.max(np.abs(src.astype(np.int16)-bg),axis=2)
    fg=diff>9; fg=ndi.binary_opening(fg,np.ones((3,3),bool)); fg=ndi.binary_closing(fg,np.ones((5,5),bool))
    roi=np.zeros_like(fg); roi[120:1020,250:1680]=True; fg&=roi
    # keep components with area >=150
    lab,n=ndi.label(fg,np.ones((3,3),bool)); sizes=ndi.sum(fg,lab,range(1,n+1)); add=np.zeros_like(fg)
    for j in range(n):
        if sizes[j]>=150: add|=lab==j+1
    alpha=full[...,3]>0; alpha|=add
    arr=full.copy(); arr[add,:3]=src[add]; arr[add,3]=255; arr[...,3]=(alpha*255).astype(np.uint8)
    ys,xs=np.where(alpha); bx0,bx1,by0,by1=max(0,xs.min()-20),min(1919,xs.max()+21),max(0,ys.min()-20),min(1079,ys.max()+21)
    im=Image.fromarray(arr[by0:by1+1,bx0:bx1+1],'RGBA'); chk=Image.new('RGBA',im.size,(255,255,255,255)); d=ImageDraw.Draw(chk)
    for yy in range(0,im.height,32):
        for xx in range(0,im.width,32):
            if (xx//32+yy//32)%2: d.rectangle([xx,yy,xx+31,yy+31],fill=(200,200,200,255))
    compo=chk.copy(); compo.alpha_composite(im); compo.convert('RGB').save(rf"W:\.gd\_video_work\allfg_{k}.png")
    print(k,im.size)
