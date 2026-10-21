from PIL import Image, ImageDraw
import numpy as np
from scipy import ndimage as ndi
from pathlib import Path

def run(p,out):
    im=Image.open(p).convert('RGB'); a=np.array(im); H,W=a.shape[:2]
    R,G,B=a[...,0].astype(np.float32),a[...,1].astype(np.float32),a[...,2].astype(np.float32)
    V=a.max(2)/255.0; S=(a.max(2)-a.min(2))/np.maximum(a.max(2),1)
    roi=np.zeros((H,W),bool); roi[400:2160,900:2850]=True
    body=(G>R)&(G>B*1.5)&(R>0.745*G)&(S>0.3)&(V>0.12)&roi
    # fill holes and clean
    body=ndi.binary_opening(body,structure=np.ones((3,3),bool))
    body=ndi.binary_closing(body,structure=np.ones((7,7),bool))
    # keep components that are large and in central area
    lab,n=ndi.label(body,structure=np.ones((3,3),bool)); sizes=ndi.sum(body,lab,range(1,n+1))
    # choose largest
    comp=lab==(int(np.argmax(sizes))+1)
    # add dark outline near comp
    dark=(V<0.38)&roi
    near=ndi.binary_dilation(comp,iterations=18)
    outline=dark&near
    core=comp|outline
    core=ndi.binary_closing(core,structure=np.ones((5,5),bool))
    core=ndi.binary_fill_holes(core)
    # remove small comps
    lab,n=ndi.label(core,np.ones((3,3),bool)); sizes=ndi.sum(core,lab,range(1,n+1)); keep=np.zeros_like(core)
    for j in range(n):
        if sizes[j]>500: keep|=(lab==j+1)
    core=keep
    # orange cob: select orange comps inside bbox of green core and upper-middle
    ys,xs=np.where(core); y0,y1=ys.min(),ys.max(); x0,x1=xs.min(),xs.max()
    hullmask=np.zeros_like(core); hullmask[y0:y1+1,x0:x1+1]=True
    orange=(R>G*1.15)&(G>B*1.5)&(R>160)&(R-G>35)&hullmask
    # only orange components with area >1000 and centroid above 65% height
    olab,on=ndi.label(orange,np.ones((3,3),bool)); osizes=ndi.sum(orange,olab,range(1,on+1)); okeep=np.zeros_like(orange)
    for j in range(on):
        if osizes[j]>1000:
            yy,xx=np.where(olab==j+1)
            cy=yy.mean()
            if cy < y0+(y1-y0)*0.55:
                okeep|=(olab==j+1)
    alpha=core|okeep
    # fill holes again but not huge? fill
    alpha=ndi.binary_fill_holes(alpha)
    # remove small comps
    lab,n=ndi.label(alpha,np.ones((3,3),bool)); sizes=ndi.sum(alpha,lab,range(1,n+1)); keep=np.zeros_like(alpha)
    for j in range(n):
        if sizes[j]>500: keep|=(lab==j+1)
    alpha=keep
    ys,xs=np.where(alpha); bx0,bx1=max(0,xs.min()-20),min(W,xs.max()+21); by0,by1=max(0,ys.min()-20),min(H,ys.max()+21)
    rgba=np.dstack([a,np.where(alpha,255,0).astype(np.uint8)]); crop=Image.fromarray(rgba[by0:by1,bx0:bx1],'RGBA'); crop.save(out.replace('.png','_rgba.png'))
    chk=Image.new('RGBA',crop.size,(255,255,255,255)); d=ImageDraw.Draw(chk)
    for yy in range(0,crop.size[1],32):
        for xx in range(0,crop.size[0],32):
            if (xx//32+yy//32)%2: d.rectangle([xx,yy,xx+31,yy+31],fill=(210,210,210,255))
    compo=chk.copy(); compo.alpha_composite(crop); compo.save(out)
    print(Path(p).name,'bbox',(bx0,by0,bx1,by1),'crop',crop.size,'core',core.sum(),'orange',okeep.sum())

for name in ['f0180','f0240']:
    if name=='f0180': p=r"W:\.gd\_video_work\samples2\f0180.png"
    else: p=r"W:\.gd\_video_work\frames_full\frame_0240.png"
    run(p,rf"W:\.gd\_video_work\segv3_{name}_checker.png")
