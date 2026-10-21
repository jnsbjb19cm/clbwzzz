from PIL import Image, ImageDraw, ImageFilter
import numpy as np
from scipy import ndimage as ndi
from scipy.spatial import ConvexHull
from pathlib import Path
import json, time, traceback
ROOT=Path(r"W:\.gd\_video_work")
SRC=ROOT/"frames_full"
OUT=ROOT/"cutouts_half_fix"
OUT.mkdir(exist_ok=True)
ATTACK=list(range(96,138))+list(range(162,180))
IDLE=list(range(474,594))
WHITE=(255,255,255)

def hull_mask(points,shape):
    hull=ConvexHull(points); hp=points[hull.vertices]
    m=Image.new('L',(shape[1],shape[0]),0); ImageDraw.Draw(m).polygon([(int(p[1]),int(p[0])) for p in hp],fill=255)
    return np.array(m)>0

def fill_small_holes(alpha,rgb,max_area=30000):
    filled=ndi.binary_fill_holes(alpha); holes=filled&~alpha
    lab,n=ndi.label(holes,np.ones((3,3),bool)); out=alpha.copy()
    for j in range(1,n+1):
        m=lab==j; ar=int(m.sum())
        if ar==0 or ar>max_area: continue
        px=rgb[m]; mr,mg,mb=px[:,0].mean(),px[:,1].mean(),px[:,2].mean()
        if mb>mr*1.1 and mb>mg*0.95: continue
        out|=m
    return out

def segment(p):
    im=Image.open(p).convert('RGB'); im=im.resize((im.width//2,im.height//2),Image.LANCZOS); a=np.array(im); H,W=a.shape[:2]
    R,G,B=a[...,0].astype(np.float32),a[...,1].astype(np.float32),a[...,2].astype(np.float32)
    V=a.max(2)/255.0; S=(a.max(2)-a.min(2))/np.maximum(a.max(2),1)
    roi=np.zeros((H,W),bool); roi[175:1080,450:1450]=True
    green=(G>R*1.02)&(G>B*1.35)&(R>0.70*G)&(S>0.28)&(V>0.10)&roi
    green=ndi.binary_opening(green,np.ones((3,3),bool)); green=ndi.binary_closing(green,np.ones((7,7),bool))
    lab,n=ndi.label(green,np.ones((3,3),bool)); sizes=ndi.sum(green,lab,range(1,n+1))
    if n==0: return None
    comp=lab==(int(np.argmax(sizes))+1)
    ys,xs=np.where(comp); y0,y1,x0,x1=ys.min(),ys.max(),xs.min(),xs.max(); bh=y1-y0+1; bw=x1-x0+1
    sel=ys<y0+bh*0.6; cx_body=float(xs[sel].mean())
    # prune thin projectile trails / tendrils
    core=ndi.binary_closing(comp,np.ones((5,5),bool))
    core=ndi.binary_opening(core,np.ones((13,13),bool))
    core=ndi.binary_closing(core,np.ones((7,7),bool))
    core=ndi.binary_dilation(core,np.ones((5,5),bool))
    lab,n=ndi.label(core,np.ones((3,3),bool)); sizes=ndi.sum(core,lab,range(1,n+1)); core=(lab==(int(np.argmax(sizes))+1))
    yy,xx=np.mgrid[0:H,0:W]; rx=(xx-x0)/bw; ry=(yy-y0)/bh
    gate=np.ones_like(core); boundary=0.81-0.05*np.clip((rx-0.56)/0.44,0,1)
    gate &= ~((rx>0.56)&(ry>boundary)); gate &= ~((rx>0.48)&(ry>0.94)); gate &= ~((rx<0.14)&(ry>0.88))
    gate &= ~((ry>0.90)&(rx<0.16)); gate &= ~((ry>0.95)&(rx>0.50))
    core &= gate
    # eyes
    dark=(V<0.36)&roi; dlab,dn=ndi.label(dark,np.ones((3,3),bool)); dsizes=ndi.sum(dark,dlab,range(1,dn+1))
    eyemask=np.zeros_like(core)
    for j in range(dn):
        ar=dsizes[j]
        if not (1250<=ar<=6500): continue
        yy2,xx2=np.where(dlab==j+1); ex0,ey0,ex1,ey1=xx2.min(),yy2.min(),xx2.max(),yy2.max()
        ecx,ecy=xx2.mean(),yy2.mean(); ew=ex1-ex0+1; eh=ey1-ey0+1
        ncx=(ecx-x0)/bw; ncy=(ecy-y0)/bh
        if 0.18<ncx<0.82 and 0.42<ncy<0.78 and 25<ew<130 and 25<eh<130:
            pad=4; cx=(ex0+ex1)/2; cy=(ey0+ey1)/2; rxr=ew/2+pad; ryr=eh/2+pad
            eyemask |= (((xx-cx)/rxr)**2+((yy-cy)/ryr)**2<=1)
    # cob: compact orange component near body center
    orange=(R>G*1.35)&(G>B*1.30)&(R>145)&roi
    orange=ndi.binary_closing(orange,np.ones((5,5),bool))
    olab,on=ndi.label(orange,np.ones((3,3),bool)); osizes=ndi.sum(orange,olab,range(1,on+1)); best=None
    for j in range(on):
        area=osizes[j]
        if area<500: continue
        yy2,xx2=np.where(olab==j+1); ox0,oy0,ox1,oy1=xx2.min(),yy2.min(),xx2.max(),yy2.max()
        ocx=xx2.mean(); ocy=yy2.mean(); ow=ox1-ox0+1; oh=oy1-oy0+1
        if not (x0+0.18*bw<ocx<x1-0.18*bw): continue
        if ocy>y0+0.62*bh: continue
        if ow>0.55*bw or oh>0.65*bh: continue
        score=abs(ocx-cx_body)/bw-min(area,200000)/400000+max(0,oy0-y0)/bh
        if best is None or score<best[0]: best=(score,j+1,area)
    rgb=a.copy(); okeep=np.zeros_like(core)
    if best:
        m=(olab==best[1]); pts=np.column_stack(np.where(m)); hull=hull_mask(pts,(H,W))
        yy2,xx2=np.where(m); pad=3; box=np.zeros_like(hull); box[max(0,yy2.min()-pad):yy2.max()+pad+1,max(0,xx2.min()-pad):xx2.max()+pad+1]=True
        cob=hull&box&gate&(xx<x0+0.78*bw)&(xx>x0+0.18*bw)
        fill=cob&~m
        if fill.any() and m.any():
            inds=ndi.distance_transform_edt(~m,return_indices=True)[1]; rgb[fill]=a[inds[0][fill],inds[1][fill]]
        okeep=cob
    alpha=core|eyemask|okeep
    alpha=ndi.binary_closing(alpha,np.ones((5,5),bool))
    alpha=fill_small_holes(alpha,rgb,7500)
    # keep only body-connected components
    alab,an=ndi.label(alpha,np.ones((3,3),bool)); keepseed=ndi.binary_dilation(core,iterations=3)
    if okeep.any(): keepseed=keepseed|okeep
    touched=np.unique(alab[keepseed]); touched=touched[touched>0]
    keep=np.zeros_like(alpha)
    for jj in touched: keep|=(alab==jj)
    alpha=keep
    # edge decontamination + feather
    solid=ndi.binary_erosion(alpha,iterations=1)
    if not solid.any(): solid=alpha
    inds=ndi.distance_transform_edt(~solid,return_indices=True)[1]
    rgb_clean=rgb[inds[0],inds[1]]
    af=alpha.astype(np.float32)
    af=ndi.gaussian_filter(af,0.5)
    af=np.clip(af,0,1)
    af[~ndi.binary_dilation(alpha,iterations=1)]=0
    alpha_u=(af*255).astype(np.uint8)
    return rgb_clean,alpha_u,(x0,y0,x1,y1),core,gate

def process(name,frames):
    d=OUT/name; d.mkdir(exist_ok=True)
    recs=[]; t0=time.time()
    for i,k in enumerate(frames):
        r=segment(SRC/f"frame_{k:04d}.png")
        if r is None:
            print('EMPTY',name,k,flush=True); continue
        rgb,alpha,bbox,core,gate=r
        ys,xs=np.where(alpha>0)
        bx0,bx1,by0,by1=xs.min(),xs.max(),ys.min(),ys.max()
        rgba=np.dstack([rgb,alpha])
        crop=Image.fromarray(rgba[by0:by1+1,bx0:bx1+1],'RGBA')
        crop.save(d/f"frame_{k:04d}.png",compress_level=3)
        recs.append({'source_frame':k,'source_time':round(k/60,4),'crop_box':[int(bx0),int(by0),int(bx1),int(by1)],'width':int(bx1-bx0+1),'height':int(by1-by0+1),'alpha_pixels':int((alpha>127).sum())})
        if i%10==0: print(name,i,'/',len(frames),'frame',k,'elapsed',round(time.time()-t0,1),flush=True)
    (d/"frames.json").write_text(json.dumps(recs,ensure_ascii=False,indent=2),encoding='utf-8')
    print('DONE',name,len(recs),round(time.time()-t0,1),flush=True)

process('idle',IDLE)
print('ALL DONE')
