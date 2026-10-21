from PIL import Image, ImageDraw
import numpy as np
from scipy import ndimage as ndi
from scipy.spatial import ConvexHull
from pathlib import Path

def hull_mask(points,shape):
    hull=ConvexHull(points); hp=points[hull.vertices]
    m=Image.new('L',(shape[1],shape[0]),0); ImageDraw.Draw(m).polygon([(int(p[1]),int(p[0])) for p in hp],fill=255)
    return np.array(m)>0

def fill_small_holes(alpha, rgb, max_area=30000):
    filled=ndi.binary_fill_holes(alpha); holes=filled&~alpha
    lab,n=ndi.label(holes,np.ones((3,3),bool)); out=alpha.copy()
    for j in range(1,n+1):
        m=lab==j; ar=int(m.sum())
        if ar==0 or ar>max_area: continue
        # don't fill blue/cyan/white object holes
        px=rgb[m]; mr,mg,mb=px[:,0].mean(),px[:,1].mean(),px[:,2].mean()
        if mb>mr*1.1 and mb>mg*0.95: continue
        out|=m
    return out

def segment(p,out):
    im=Image.open(p).convert('RGB'); a=np.array(im); H,W=a.shape[:2]
    R,G,B=a[...,0].astype(np.float32),a[...,1].astype(np.float32),a[...,2].astype(np.float32)
    V=a.max(2)/255.0; S=(a.max(2)-a.min(2))/np.maximum(a.max(2),1)
    roi=np.zeros((H,W),bool); roi[350:2160,900:2900]=True
    green=(G>R*1.02)&(G>B*1.35)&(R>0.70*G)&(S>0.28)&(V>0.10)&roi
    green=ndi.binary_opening(green,np.ones((3,3),bool)); green=ndi.binary_closing(green,np.ones((7,7),bool))
    lab,n=ndi.label(green,np.ones((3,3),bool)); sizes=ndi.sum(green,lab,range(1,n+1)); comp=lab==(int(np.argmax(sizes))+1)
    ys,xs=np.where(comp); y0,y1,x0,x1=ys.min(),ys.max(),xs.min(),xs.max(); bh=y1-y0+1; bw=x1-x0+1
    sel=ys<y0+bh*0.6; cx_body=float(xs[sel].mean())
    # prune thin tendrils/trails before filling
    core=ndi.binary_closing(comp,np.ones((5,5),bool))
    core=ndi.binary_opening(core,np.ones((25,25),bool))
    core=ndi.binary_closing(core,np.ones((7,7),bool))
    # restore a little edge thickness after opening
    core=ndi.binary_dilation(core,np.ones((5,5),bool))
    lab,n=ndi.label(core,np.ones((3,3),bool)); sizes=ndi.sum(core,lab,range(1,n+1)); core=(lab==(int(np.argmax(sizes))+1))
    yy,xx=np.mgrid[0:H,0:W]; rx=(xx-x0)/bw; ry=(yy-y0)/bh
    gate=np.ones_like(core); boundary=0.81-0.05*np.clip((rx-0.56)/0.44,0,1)
    gate &= ~((rx>0.56)&(ry>boundary)); gate &= ~((rx>0.48)&(ry>0.94)); gate &= ~((rx<0.14)&(ry>0.88))
    gate &= ~((ry>0.90)&(rx<0.16)); gate &= ~((ry>0.95)&(rx>0.50))
    core &= gate
    # eyes/mouth
    dark=(V<0.36)&roi; dlab,dn=ndi.label(dark,np.ones((3,3),bool)); dsizes=ndi.sum(dark,dlab,range(1,dn+1))
    eyemask=np.zeros_like(core)
    for j in range(dn):
        ar=dsizes[j]
        if not (5000<=ar<=26000): continue
        yy2,xx2=np.where(dlab==j+1); ex0,ey0,ex1,ey1=xx2.min(),yy2.min(),xx2.max(),yy2.max()
        ecx,ecy=xx2.mean(),yy2.mean(); ew=ex1-ex0+1; eh=ey1-ey0+1
        ncx=(ecx-x0)/bw; ncy=(ecy-y0)/bh
        if 0.18<ncx<0.82 and 0.42<ncy<0.78 and 50<ew<260 and 50<eh<260:
            pad=8; cx=(ex0+ex1)/2; cy=(ey0+ey1)/2; rxr=ew/2+pad; ryr=eh/2+pad
            eyemask |= (((xx-cx)/rxr)**2+((yy-cy)/ryr)**2<=1)
    # cob hull
    orange=(R>G*1.35)&(G>B*1.30)&(R>145)&roi; orange=ndi.binary_closing(orange,np.ones((5,5),bool))
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
    ori_rgb=a.copy(); okeep=np.zeros_like(core)
    if best:
        m=(olab==best[1]); pts=np.column_stack(np.where(m)); hull=hull_mask(pts,(H,W))
        yy2,xx2=np.where(m); pad=6; box=np.zeros_like(hull); box[max(0,yy2.min()-pad):yy2.max()+pad+1,max(0,xx2.min()-pad):xx2.max()+pad+1]=True
        cob=hull&box&gate&(xx<x0+0.78*bw)&(xx>x0+0.18*bw)
        fill=cob&~m
        if fill.any() and m.any():
            inds=ndi.distance_transform_edt(~m,return_indices=True)[1]; ori_rgb[fill]=a[inds[0][fill],inds[1][fill]]
        okeep=cob
    alpha=core|eyemask|okeep
    alpha=ndi.binary_closing(alpha,np.ones((5,5),bool))
    alpha=fill_small_holes(alpha,ori_rgb,max_area=30000)
    alab,an=ndi.label(alpha,np.ones((3,3),bool)); asizes=ndi.sum(alpha,alab,range(1,an+1)); keep=np.zeros_like(alpha)
    for j in range(an):
        if asizes[j]>1000: keep|=(alab==j+1)
    alpha=keep
    ys,xs=np.where(alpha); bx0,bx1=max(0,xs.min()-20),min(W,xs.max()+21); by0,by1=max(0,ys.min()-20),min(H,ys.max()+21)
    rgba_full=np.dstack([ori_rgb,np.where(alpha,255,0).astype(np.uint8)]); rgba=rgba_full[by0:by1,bx0:bx1]
    crop=Image.fromarray(rgba,'RGBA'); crop.save(out.replace('.png','_rgba.png'))
    chk=Image.new('RGBA',crop.size,(255,255,255,255)); d=ImageDraw.Draw(chk)
    for y in range(0,crop.size[1],32):
        for x in range(0,crop.size[0],32):
            if (x//32+y//32)%2: d.rectangle([x,y,x+31,y+31],fill=(210,210,210,255))
    compo=chk.copy(); compo.alpha_composite(crop); compo.save(out)
    print(Path(p).name,'crop',crop.size,'alpha',int(alpha.sum()),'cob',int(okeep.sum()))

for name in ['f0148','f0158','f0168','f0480','f0540','f0593']:
    segment(rf"W:\.gd\_video_work\frames_full\frame_{int(name[1:]):04d}.png",rf"W:\.gd\_video_work\segv10_{name}_checker.png")
