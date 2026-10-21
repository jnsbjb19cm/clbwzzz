from PIL import Image, ImageDraw
import numpy as np
from scipy import ndimage as ndi
from pathlib import Path

def segment(p,out):
    im=Image.open(p).convert('RGB'); a=np.array(im); H,W=a.shape[:2]
    R,G,B=a[...,0].astype(np.float32),a[...,1].astype(np.float32),a[...,2].astype(np.float32)
    V=a.max(2)/255.0; S=(a.max(2)-a.min(2))/np.maximum(a.max(2),1)
    roi=np.zeros((H,W),bool); roi[350:2160,900:2900]=True
    # green leaves: exclude cyan puddle & yellow bg
    green=(G>R*1.02)&(G>B*1.35)&(R>0.70*G)&(S>0.28)&(V>0.10)&roi
    green=ndi.binary_opening(green,np.ones((3,3),bool)); green=ndi.binary_closing(green,np.ones((7,7),bool))
    lab,n=ndi.label(green,np.ones((3,3),bool)); sizes=ndi.sum(green,lab,range(1,n+1)); comp=lab==(int(np.argmax(sizes))+1)
    ys,xs=np.where(comp); y0,y1,x0,x1=ys.min(),ys.max(),xs.min(),xs.max(); bh=y1-y0+1; bw=x1-x0+1
    # body centroid from upper leaves
    sel=ys<y0+bh*0.6; cx_body=float(xs[sel].mean())
    # add dark leaf outline near core only
    near=ndi.binary_dilation(comp,iterations=4)
    outline=(V<0.42)&roi&near
    core=comp|outline
    core=ndi.binary_closing(core,np.ones((5,5),bool)); core=ndi.binary_fill_holes(core)
    # keep main body component
    lab,n=ndi.label(core,np.ones((3,3),bool)); sizes=ndi.sum(core,lab,range(1,n+1)); core=(lab==(int(np.argmax(sizes))+1))
    # normalized gate to remove green slime/base bottom-right
    yy,xx=np.mgrid[0:H,0:W]; rx=(xx-x0)/bw; ry=(yy-y0)/bh
    gate=np.ones_like(core)
    boundary=0.81-0.05*np.clip((rx-0.56)/0.44,0,1)
    gate &= ~((rx>0.56)&(ry>boundary))
    gate &= ~((rx>0.48)&(ry>0.94))
    core &= gate
    # orange cob: compact orange component near body center above mid-height
    orange=(R>G*1.35)&(G>B*1.30)&(R>145)&roi
    orange=ndi.binary_closing(orange,np.ones((5,5),bool))
    olab,on=ndi.label(orange,np.ones((3,3),bool)); osizes=ndi.sum(orange,olab,range(1,on+1))
    best=None
    for j in range(on):
        idx=j+1; area=osizes[j]
        if area<500: continue
        yy2,xx2=np.where(olab==idx); ox0,oy0,ox1,oy1=xx2.min(),yy2.min(),xx2.max(),yy2.max()
        ocx=xx2.mean(); ocy=yy2.mean(); ow=ox1-ox0+1; oh=oy1-oy0+1
        if not (x0+0.18*bw < ocx < x1-0.18*bw): continue
        if ocy > y0+0.62*bh: continue
        if ow > 0.55*bw or oh > 0.65*bh: continue
        score=abs(ocx-cx_body)/bw - min(area,200000)/400000 + max(0,oy0-y0)/bh
        if best is None or score<best[0]: best=(score,idx,area)
    okeep=np.zeros_like(core)
    if best:
        m=(olab==best[1]); m=ndi.binary_closing(m,np.ones((9,9),bool)); m=ndi.binary_fill_holes(m); okeep=m&gate
    alpha=core|okeep
    alpha=ndi.binary_closing(alpha,np.ones((5,5),bool)); alpha=ndi.binary_fill_holes(alpha)
    # keep all significant comps (usually one)
    alab,an=ndi.label(alpha,np.ones((3,3),bool)); asizes=ndi.sum(alpha,alab,range(1,an+1)); keep=np.zeros_like(alpha)
    for j in range(an):
        if asizes[j]>600: keep|=(alab==j+1)
    alpha=keep
    ys,xs=np.where(alpha); bx0,bx1=max(0,xs.min()-20),min(W,xs.max()+21); by0,by1=max(0,ys.min()-20),min(H,ys.max()+21)
    rgba=np.dstack([a,np.where(alpha,255,0).astype(np.uint8)]); crop=Image.fromarray(rgba[by0:by1,bx0:bx1],'RGBA'); crop.save(out.replace('.png','_rgba.png'))
    chk=Image.new('RGBA',crop.size,(255,255,255,255)); d=ImageDraw.Draw(chk)
    for y in range(0,crop.size[1],32):
        for x in range(0,crop.size[0],32):
            if (x//32+y//32)%2: d.rectangle([x,y,x+31,y+31],fill=(210,210,210,255))
    compo=chk.copy(); compo.alpha_composite(crop); compo.save(out)
    print(Path(p).name,'crop',crop.size,'core',core.sum(),'cob',int(okeep.sum()),'cand',best[2] if best else None,'cx',int(cx_body))

tests=[('f0060',r"W:\.gd\_video_work\frames_full\frame_0060.png"),('f0120',r"W:\.gd\_video_work\frames_full\frame_0120.png"),('f0179',r"W:\.gd\_video_work\frames_full\frame_0179.png"),('f0480',r"W:\.gd\_video_work\frames_full\frame_0480.png"),('f0540',r"W:\.gd\_video_work\frames_full\frame_0540.png"),('f0593',r"W:\.gd\_video_work\frames_full\frame_0593.png")]
for name,p in tests: segment(p,rf"W:\.gd\_video_work\segv6_{name}_checker.png")
