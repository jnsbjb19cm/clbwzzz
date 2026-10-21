from PIL import Image, ImageDraw
import numpy as np
from scipy import ndimage as ndi
from pathlib import Path

def runs_of_row(row):
    xs=np.where(row)[0]
    if len(xs)==0: return []
    runs=[]; s=prev=int(xs[0])
    for x in xs[1:]:
        x=int(x)
        if x==prev+1: prev=x
        else: runs.append((s,prev)); s=prev=x
    runs.append((s,prev)); return runs

def segment(p,out):
    im=Image.open(p).convert('RGB'); a=np.array(im); H,W=a.shape[:2]
    R,G,B=a[...,0].astype(np.float32),a[...,1].astype(np.float32),a[...,2].astype(np.float32)
    V=a.max(2)/255.0; S=(a.max(2)-a.min(2))/np.maximum(a.max(2),1)
    roi=np.zeros((H,W),bool); roi[350:2160,900:2900]=True
    body=(G>R)&(G>B*1.50)&(R>0.75*G)&(S>0.30)&(V>0.12)&roi
    body=ndi.binary_opening(body,np.ones((3,3),bool)); body=ndi.binary_closing(body,np.ones((7,7),bool))
    lab,n=ndi.label(body,np.ones((3,3),bool)); sizes=ndi.sum(body,lab,range(1,n+1)); comp=lab==(int(np.argmax(sizes))+1)
    near=ndi.binary_dilation(comp,iterations=5)
    outline=(V<0.38)&roi&near
    core=comp|outline
    core=ndi.binary_closing(core,np.ones((5,5),bool))
    core=ndi.binary_fill_holes(core)
    # keep main component + things touching it
    lab,n=ndi.label(core,np.ones((3,3),bool)); sizes=ndi.sum(core,lab,range(1,n+1)); main=lab==(int(np.argmax(sizes))+1)
    keep=np.zeros_like(core); keep[main]=True
    core=keep
    ys,xs=np.where(core); y0,y1,x0,x1=ys.min(),ys.max(),xs.min(),xs.max(); bw=x1-x0+1; bh=y1-y0+1
    yy,xx=np.mgrid[0:H,0:W]
    rx=(xx-x0)/bw; ry=(yy-y0)/bh
    gate=~(((rx>0.56)&(ry>0.76))|((rx>0.50)&(ry>0.94)))
    core &= gate
    # gaps between tall leaves via comp (not core)
    g=ndi.binary_closing(comp,np.ones((1,19),bool))
    gaps=np.zeros_like(core)
    for y in range(int(y0), int(y0+bh*0.66)):
        rr=[r for r in runs_of_row(g[y]) if r[1]-r[0]>=15]
        if len(rr)>=2:
            rr=sorted(sorted(rr,key=lambda r:r[1]-r[0],reverse=True)[:2],key=lambda r:r[0])
            gx0=rr[0][1]+1; gx1=rr[1][0]-1
            if 20 <= gx1-gx0 <= 500:
                gaps[y,max(0,gx0-10):min(W,gx1+11)]=True
    orange=(R>G*1.08)&(R-G>25)&(G>B*1.35)&(R>160)&gaps
    # keep orange comps, close then fill holes
    orange=ndi.binary_closing(orange,np.ones((9,9),bool))
    olab,on=ndi.label(orange,np.ones((3,3),bool)); osizes=ndi.sum(orange,olab,range(1,on+1)); okeep=np.zeros_like(orange)
    for j in range(on):
        if osizes[j]>=300:
            m=olab==j+1; m=ndi.binary_closing(m,np.ones((9,9),bool)); m=ndi.binary_fill_holes(m); okeep|=m
    alpha=core|(okeep&gate)
    alpha=ndi.binary_closing(alpha,np.ones((5,5),bool)); alpha=ndi.binary_fill_holes(alpha)
    lab,n=ndi.label(alpha,np.ones((3,3),bool)); sizes=ndi.sum(alpha,lab,range(1,n+1)); keep=np.zeros_like(alpha)
    for j in range(n):
        if sizes[j]>1000: keep|=(lab==j+1)
    alpha=keep
    ys,xs=np.where(alpha); bx0,bx1=max(0,xs.min()-20),min(W,xs.max()+21); by0,by1=max(0,ys.min()-20),min(H,ys.max()+21)
    rgba=np.dstack([a,np.where(alpha,255,0).astype(np.uint8)]); crop=Image.fromarray(rgba[by0:by1,bx0:bx1],'RGBA'); crop.save(out.replace('.png','_rgba.png'))
    chk=Image.new('RGBA',crop.size,(255,255,255,255)); d=ImageDraw.Draw(chk)
    for y in range(0,crop.size[1],32):
        for x in range(0,crop.size[0],32):
            if (x//32+y//32)%2: d.rectangle([x,y,x+31,y+31],fill=(210,210,210,255))
    compo=chk.copy(); compo.alpha_composite(crop); compo.save(out)
    print(Path(p).name,'bbox',(x0,y0,x1,y1),'crop',crop.size,'core',core.sum(),'orange',okeep.sum())

for name,p in [('f0180',r"W:\.gd\_video_work\samples2\f0180.png"),('f0300',r"W:\.gd\_video_work\frames_full\frame_0300.png"),('f0600',r"W:\.gd\_video_work\frames_full\frame_0600.png")]:
    if Path(p).exists(): segment(p,rf"W:\.gd\_video_work\segv5_{name}_checker.png")
