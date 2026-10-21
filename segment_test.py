from PIL import Image, ImageDraw
import numpy as np
from scipy import ndimage as ndi
from scipy.spatial import ConvexHull
from pathlib import Path

def segment(p,out):
    im=Image.open(p).convert('RGB'); a=np.array(im); H,W=a.shape[:2]
    R,G,B=a[...,0].astype(np.int16),a[...,1].astype(np.int16),a[...,2].astype(np.int16)
    roi=np.zeros((H,W),bool); roi[400:2160,900:2850]=True
    green=(G>R*1.03)&(G>B*1.35)&(G>35)&roi
    # strongest green body component
    lab,n=ndi.label(green,structure=np.ones((3,3),bool))
    sizes=ndi.sum(green,lab,range(1,n+1)); idx=int(np.argmax(sizes))+1
    comp=(lab==idx)
    comp=ndi.binary_closing(comp,structure=np.ones((5,5),bool))
    comp=ndi.binary_fill_holes(comp)
    ys,xs=np.where(comp)
    pts=np.column_stack([xs,ys])
    hull=ConvexHull(pts)
    hp=pts[hull.vertices]
    hullmask=Image.new('L',(W,H),0); ImageDraw.Draw(hullmask).polygon([tuple(x) for x in hp],fill=255)
    hullmask=np.array(hullmask)>0
    orange=(R-G>42)&(G-B>50)&(R>170)&(G>80)&hullmask
    # orange in hull close to green: dilate green and require overlap? allow cob central
    op_lab,on=ndi.label(orange,structure=np.ones((3,3),bool))
    osizes=ndi.sum(orange,op_lab,range(1,on+1))
    orange2=np.zeros_like(orange)
    for j in range(on):
        if osizes[j]>=200:
            orange2 |= (op_lab==j+1)
    # add eye/mouth holes: filled already has them, but holes filled too much? alpha = comp + orange
    alpha=comp|orange2
    # close tiny gaps and clean
    alpha=ndi.binary_closing(alpha,structure=np.ones((3,3),bool))
    alpha=ndi.binary_fill_holes(alpha)
    # remove small components
    alab,an=ndi.label(alpha,structure=np.ones((3,3),bool)); asizes=ndi.sum(alpha,alab,range(1,an+1))
    # keep components >=100 and intersect component with largest green overlap
    keep=np.zeros_like(alpha)
    for j in range(an):
        if asizes[j]>=100: keep|=(alab==j+1)
    alpha=keep
    # bbox and pad
    ys,xs=np.where(alpha); x0,x1=max(0,xs.min()-30),min(W,xs.max()+31); y0,y1=max(0,ys.min()-30),min(H,ys.max()+31)
    rgba=np.dstack([a, np.where(alpha,255,0).astype(np.uint8)])
    crop=Image.fromarray(rgba[y0:y1,x0:x1],'RGBA')
    # checker composite
    chk=Image.new('RGBA',crop.size,(255,255,255,255)); d=ImageDraw.Draw(chk)
    for yy in range(0,crop.size[1],32):
        for xx in range(0,crop.size[0],32):
            if (xx//32+yy//32)%2: d.rectangle([xx,yy,xx+31,yy+31],fill=(210,210,210,255))
    compo=chk.copy(); compo.alpha_composite(crop)
    compo.save(out)
    crop.save(out.replace('.png','_rgba.png'))
    print(Path(p).name,'bbox',(x0,y0,x1,y1),'crop',crop.size,'alpha px',alpha.sum(),'green',comp.sum(),'orange',orange2.sum())

for name in ['f0060','f0090','f0120','f0150','f0180']:
    segment(rf"W:\.gd\_video_work\samples2\{name}.png",rf"W:\.gd\_video_work\seg_{name}_checker.png")
