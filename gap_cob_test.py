from PIL import Image, ImageDraw
import numpy as np, json
from scipy import ndimage as ndi
from pathlib import Path

def gap_for(k,cutdir):
    src=Image.open(rf"W:\.gd\_video_work\frames_full\frame_{k:04d}.png").convert('RGB').resize((1920,1080),Image.LANCZOS)
    a=np.array(src).astype(np.float32); R,G,B=a[...,0],a[...,1],a[...,2]; V=a.max(2)/255.
    roi=np.zeros(V.shape,bool); roi[175:1080,450:1450]=True
    green=(G>R*1.02)&(G>B*1.35)&(R>0.70*G)&(V>0.10)&roi
    green=ndi.binary_opening(green,np.ones((3,3),bool)); green=ndi.binary_closing(green,np.ones((5,5),bool))
    lab,n=ndi.label(green,np.ones((3,3),bool)); sizes=ndi.sum(green,lab,range(1,n+1)); comp=lab==(int(np.argmax(sizes))+1)
    ys,xs=np.where(comp); x0,y0,x1,y1=xs.min(),ys.min(),xs.max(),ys.max(); bh=y1-y0+1; bw=x1-x0+1
    g=ndi.binary_closing(comp,np.ones((1,17),bool))
    gap=np.zeros_like(comp); central=(x0+x1)/2
    def runs(row):
        xx=np.where(row)[0]
        if len(xx)==0:return []
        out=[];s=pr=int(xx[0])
        for x in xx[1:]:
            x=int(x)
            if x==pr+1:pr=x
            else:out.append((s,pr));s=pr=x
        out.append((s,pr));return out
    for y in range(max(0,y0-25), int(y0+bh*0.58)):
        rr=[r for r in runs(g[y]) if r[1]-r[0]>=8]
        left=[r for r in rr if r[1]<central]; right=[r for r in rr if r[0]>central]
        if left and right:
            le=max(r[1] for r in left); rs=min(r[0] for r in right)
            if 30 <= rs-le <= 450:
                gap[y,max(0,le-3):min(1919,rs+4)]=True
    # Add top cap: extend top row gap upward 25 px
    ys2,xs2=np.where(gap)
    if len(ys2):
        top=ys2.min(); rows=xs2[ys2<top+30]
        # no need
        pass
    gap=ndi.binary_closing(gap,np.ones((5,5),bool)); gap=ndi.binary_fill_holes(gap)
    # load current cutout alpha and bbox
    recs=json.loads((Path(cutdir)/'frames.json').read_text(encoding='utf-8')); r=[z for z in recs if z['source_frame']==k][0]
    x0c,y0c,x1c,y1c=r['crop_box']; crop=Image.open(Path(cutdir)/f"frame_{k:04d}.png").convert('RGBA'); ca=np.array(crop.getchannel('A'))
    afull=np.zeros((1080,1920),np.uint8); afull[y0c:y1c+1,x0c:x1c+1]=ca
    alpha=(afull>127)|gap
    # RGB from source, transparent elsewhere
    rgba=np.dstack([np.array(src),np.where(alpha,255,0).astype(np.uint8)])
    out=Path(r"W:\.gd\_video_work")/f"gaptest_{k}.png"
    # crop around body bbox
    bx0=max(0,x0-35); by0=max(0,y0-35); bx1=min(1919,x1+35); by1=min(1079,y1+35)
    im=Image.fromarray(rgba[by0:by1+1,bx0:bx1+1],'RGBA')
    chk=Image.new('RGBA',im.size,(255,255,255,255)); d=ImageDraw.Draw(chk)
    for yy in range(0,im.height,32):
        for xx in range(0,im.width,32):
            if (xx//32+yy//32)%2: d.rectangle([xx,yy,xx+31,yy+31],fill=(200,200,200,255))
    compo=chk.copy(); compo.alpha_composite(im); compo.convert('RGB').save(out)
    print(k,'gap',int(gap.sum()),'bbox',x0,y0,x1,y1,out)
for k,cutdir in [(524,r"W:\.gd\_video_work\cutouts_half_fix\idle"),(540,r"W:\.gd\_video_work\cutouts_half_fix\idle"),(100,r"W:\.gd\_video_work\cutouts_half\attack")]:
    gap_for(k,cutdir)
