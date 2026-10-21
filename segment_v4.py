from PIL import Image, ImageDraw
import numpy as np
from scipy import ndimage as ndi
from pathlib import Path

def runs_of_row(row):
    xs=np.where(row)[0]
    if len(xs)==0: return []
    runs=[]; s=prev=xs[0]
    for x in xs[1:]:
        if x==prev+1: prev=x
        else: runs.append((s,prev)); s=prev=x
    runs.append((s,prev)); return runs

def segment(p,out):
    im=Image.open(p).convert('RGB'); a=np.array(im); H,W=a.shape[:2]
    R,G,B=a[...,0].astype(np.float32),a[...,1].astype(np.float32),a[...,2].astype(np.float32)
    V=a.max(2)/255.0; S=(a.max(2)-a.min(2))/np.maximum(a.max(2),1)
    roi=np.zeros((H,W),bool); roi[400:2160,900:2850]=True
    body=(G>R)&(G>B*1.5)&(R>0.75*G)&(S>0.30)&(V>0.12)&roi
    body=ndi.binary_opening(body,np.ones((3,3),bool)); body=ndi.binary_closing(body,np.ones((7,7),bool))
    lab,n=ndi.label(body,np.ones((3,3),bool)); sizes=ndi.sum(body,lab,range(1,n+1)); comp=lab==(int(np.argmax(sizes))+1)
    # dark outline close to leaves only
    near=ndi.binary_dilation(comp,iterations=10)
    outline=(V<0.38)&roi&near
    core=comp|outline
    core=ndi.binary_closing(core,np.ones((5,5),bool))
    # fill holes only within core, then keep big component
    core=ndi.binary_fill_holes(core)
    lab,n=ndi.label(core,np.ones((3,3),bool)); sizes=ndi.sum(core,lab,range(1,n+1)); keep=np.zeros_like(core)
    for j in range(n):
        if sizes[j]>1000: keep|=(lab==j+1)
    core=keep
    ys,xs=np.where(core); y0,y1,x0,x1=ys.min(),ys.max(),xs.min(),xs.max()
    # gap between upper leaves
    g=ndi.binary_closing(comp,np.ones((1,17),bool))
    gaps=np.zeros_like(core)
    for y in range(y0, int(y0+(y1-y0)*0.68)):
        rr=[r for r in runs_of_row(g[y]) if r[1]-r[0]>=15]
        if len(rr)>=2:
            # two largest runs; gap between them ordered by x
            rr=sorted(sorted(rr,key=lambda r:r[1]-r[0],reverse=True)[:2], key=lambda r:r[0])
            # require gap not too wide and gap center within body central band
            gx0=rr[0][1]+1; gx1=rr[1][0]-1
            if 20 <= gx1-gx0 <= 500 and x0+0.20*(x1-x0) < (gx0+gx1)/2 < x1-0.20*(x1-x0):
                gaps[y,gx0:gx1+1]=True
    # orange in gap, relaxed color, then close/fill
    orange=(R>G*1.08)&(R-G>25)&(G>B*1.4)&(R>160)&gaps
    orange=ndi.binary_closing(orange,np.ones((7,7),bool))
    orange=ndi.binary_fill_holes(orange)
    olab,on=ndi.label(orange,np.ones((3,3),bool)); osizes=ndi.sum(orange,olab,range(1,on+1)); okeep=np.zeros_like(orange)
    for j in range(on):
        if osizes[j]>=300: okeep|=(olab==j+1)
    alpha=core|okeep
    alpha=ndi.binary_closing(alpha,np.ones((3,3),bool)); alpha=ndi.binary_fill_holes(alpha)
    lab,n=ndi.label(alpha,np.ones((3,3),bool)); sizes=ndi.sum(alpha,lab,range(1,n+1)); keep=np.zeros_like(alpha)
    for j in range(n):
        if sizes[j]>800: keep|=(lab==j+1)
    alpha=keep
    ys,xs=np.where(alpha); bx0,bx1=max(0,xs.min()-20),min(W,xs.max()+21); by0,by1=max(0,ys.min()-20),min(H,ys.max()+21)
    rgba=np.dstack([a,np.where(alpha,255,0).astype(np.uint8)]); crop=Image.fromarray(rgba[by0:by1,bx0:bx1],'RGBA'); crop.save(out.replace('.png','_rgba.png'))
    chk=Image.new('RGBA',crop.size,(255,255,255,255)); d=ImageDraw.Draw(chk)
    for yy in range(0,crop.size[1],32):
        for xx in range(0,crop.size[0],32):
            if (xx//32+yy//32)%2: d.rectangle([xx,yy,xx+31,yy+31],fill=(210,210,210,255))
    compo=chk.copy(); compo.alpha_composite(crop); compo.save(out)
    print(Path(p).name,'crop',crop.size,'core',core.sum(),'orange',okeep.sum(),'gap',gaps.sum())

for name,p in [('f0180',r"W:\.gd\_video_work\samples2\f0180.png"),('f0240',r"W:\.gd\_video_work\frames_full\frame_0240.png"),('f0300',r"W:\.gd\_video_work\frames_full\frame_0300.png")]:
    if Path(p).exists(): segment(p,rf"W:\.gd\_video_work\segv4_{name}_checker.png")
