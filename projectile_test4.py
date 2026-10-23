from PIL import Image, ImageDraw
import numpy as np
from scipy import ndimage as ndi
from pathlib import Path
src_code=open(r"D:\.丛林\battle\build_v11.py",encoding='utf-8-sig').read(); idx=src_code.index("\nfrom pathlib import Path\nimport json,time\nSRC="); exec(src_code[:idx])
bg=np.array(Image.open(r"W:\.gd\_video_work\bg_plate_360_479.png").convert('RGB')).astype(np.int16)
for k in [360,378,390,402,420,450,478]:
    rgba,bbox,gap,cobtop=segment_and_save(rf"W:\.gd\_video_work\frames_full\frame_{k:04d}.png")
    x0,y0,x1,y1=bbox; bw=x1-x0+1; bh=y1-y0+1
    full=np.zeros((1080,1920,4),np.uint8); full[y0:y1+1,x0:x1+1]=rgba
    src=np.array(Image.open(rf"W:\.gd\_video_work\frames_full\frame_{k:04d}.png").convert('RGB').resize((1920,1080),Image.LANCZOS))
    diff=np.max(np.abs(src.astype(np.int16)-bg),axis=2); fg=diff>9; fg=ndi.binary_opening(fg,np.ones((3,3),bool)); fg=ndi.binary_closing(fg,np.ones((5,5),bool))
    R,G,B=src[...,0].astype(np.float32),src[...,1].astype(np.float32),src[...,2].astype(np.float32); V=src.max(2)/255.; S=(src.max(2)-src.min(2))/np.maximum(src.max(2),1)
    yy,xx=np.mgrid[0:1080,0:1920]
    # bread seed
    white=(V>0.55)&(S<0.35)&(R>120)&(G>100)&(B>80)&fg&(xx>x0+0.22*bw)&(yy>y0+0.45*bh)
    fglab,fn=ndi.label(fg,np.ones((3,3),bool)); add=np.zeros_like(fg)
    lab,n=ndi.label(white,np.ones((3,3),bool)); sizes=ndi.sum(white,lab,range(1,n+1))
    if n:
        j=int(np.argmax(sizes))+1
        if sizes[j-1]>=60:
            m=lab==j; ys0,xs0=np.where(m); pad=55
            bb=np.zeros_like(fg); bb[max(0,ys0.min()-pad):ys0.max()+pad+1,max(0,xs0.min()-pad):xs0.max()+pad+1]=True
            ids,counts=np.unique(fglab[m],return_counts=True); idx2=ids[np.argmax(counts)]
            add|=(fglab==idx2)&bb
    # blue ball
    blue=(B>G*1.03)&(B>R*1.35)&(S>0.35)&(V>0.18)&fg
    lab2,n2=ndi.label(blue,np.ones((3,3),bool)); sizes2=ndi.sum(blue,lab2,range(1,n2+1))
    for j in range(n2):
        if sizes2[j]>=30:
            m=lab2==j+1; ids,counts=np.unique(fglab[m & fg],return_counts=True)
            if len(ids):
                idx2=ids[np.argmax(counts)]; add|=fglab==idx2
    alpha=full[...,3]>0; alpha|=add
    arr=full.copy(); arr[add,:3]=src[add]; arr[add,3]=255; arr[...,3]=(alpha*255).astype(np.uint8)
    ys,xs=np.where(alpha); bx0,bx1,by0,by1=max(0,xs.min()-20),min(1919,xs.max()+21),max(0,ys.min()-20),min(1079,ys.max()+21)
    im=Image.fromarray(arr[by0:by1+1,bx0:bx1+1],'RGBA'); chk=Image.new('RGBA',im.size,(255,255,255,255)); d=ImageDraw.Draw(chk)
    for yy2 in range(0,im.height,32):
        for xx2 in range(0,im.width,32):
            if (xx2//32+yy2//32)%2: d.rectangle([xx2,yy2,xx2+31,yy2+31],fill=(200,200,200,255))
    compo=chk.copy(); compo.alpha_composite(im); compo.convert('RGB').save(rf"W:\.gd\_video_work\proj4_{k}.png")
    print(k,im.size)
