from PIL import Image, ImageDraw
import numpy as np
from pathlib import Path
from scipy import ndimage as ndi
from scipy.spatial import ConvexHull
root=Path(r"W:\.gd\_video_work\frames_full")
files=sorted(root.glob("frame_*.png"))
# median from sparse valid frames
sel=files[::10]
arrs=[np.array(Image.open(f).convert('RGB')).astype(np.float32) for f in sel]
med=np.median(np.stack(arrs,0),axis=0).astype(np.uint8)
Image.fromarray(med).save(r"W:\.gd\_video_work\bg_median.png")
print('median frames',len(sel))

def segment(p,out):
    im=Image.open(p).convert('RGB'); a=np.array(im); H,W=a.shape[:2]
    R,G,B=a[...,0].astype(np.int16),a[...,1].astype(np.int16),a[...,2].astype(np.int16)
    roi=np.zeros((H,W),bool); roi[400:2160,900:2850]=True
    green=(G>R*1.03)&(G>B*1.35)&(G>35)&roi
    lab,n=ndi.label(green,structure=np.ones((3,3),bool)); sizes=ndi.sum(green,lab,range(1,n+1)); comp=(lab==int(np.argmax(sizes))+1)
    comp=ndi.binary_closing(comp,structure=np.ones((5,5),bool)); comp=ndi.binary_fill_holes(comp)
    ys,xs=np.where(comp); pts=np.column_stack([xs,ys]); hull=ConvexHull(pts); hp=pts[hull.vertices]
    hullmask=Image.new('L',(W,H),0); ImageDraw.Draw(hullmask).polygon([tuple(x) for x in hp],fill=255); hullmask=np.array(hullmask)>0
    orange=(R-G>42)&(G-B>50)&(R>170)&(G>80)&hullmask
    op_lab,on=ndi.label(orange,structure=np.ones((3,3),bool)); osizes=ndi.sum(orange,op_lab,range(1,on+1)); orange2=np.zeros_like(orange)
    for j in range(on):
        if osizes[j]>=200: orange2|=(op_lab==j+1)
    # foreground diff from median background
    diff=np.max(np.abs(a.astype(np.int16)-med.astype(np.int16)),axis=2)
    fg=diff>12
    fg=ndi.binary_opening(fg,structure=np.ones((3,3),bool))
    fg=ndi.binary_closing(fg,structure=np.ones((5,5),bool))
    # body alpha = colors and foreground. add eyes via holes of green (comp filled already includes holes? comp fill holes yes)
    alpha=(comp|orange2)&fg
    # But filled comp includes holes large; ensure body colors or small holes. Use original green+orange plus fill holes only small
    # clean small / keep largest component
    alab,an=ndi.label(alpha,structure=np.ones((3,3),bool)); asizes=ndi.sum(alpha,alab,range(1,an+1)); keep=np.zeros_like(alpha)
    for j in range(an):
        if asizes[j]>=100: keep|=(alab==j+1)
    alpha=keep
    ys,xs=np.where(alpha); x0,x1=max(0,xs.min()-20),min(W,xs.max()+21); y0,y1=max(0,ys.min()-20),min(H,ys.max()+21)
    rgba=np.dstack([a,np.where(alpha,255,0).astype(np.uint8)]); crop=Image.fromarray(rgba[y0:y1,x0:x1],'RGBA')
    crop.save(out.replace('.png','_rgba.png'))
    chk=Image.new('RGBA',crop.size,(255,255,255,255)); d=ImageDraw.Draw(chk)
    for yy in range(0,crop.size[1],32):
        for xx in range(0,crop.size[0],32):
            if (xx//32+yy//32)%2: d.rectangle([xx,yy,xx+31,yy+31],fill=(210,210,210,255))
    compo=chk.copy(); compo.alpha_composite(crop); compo.save(out)
    print(Path(p).name,'bbox',(x0,y0,x1,y1),'crop',crop.size,'alpha',alpha.sum(),'fg',fg.sum())
for n in [120,180,240,270]:
    segment(root/f"frame_{n:04d}.png",rf"W:\.gd\_video_work\segfg_{n:04d}_checker.png")
