from PIL import Image
import numpy as np
from scipy import ndimage as ndi
from pathlib import Path
import csv, time
root=Path(r"W:\.gd\_video_work\frames_full")
files=sorted(root.glob("frame_*.png"))
W,H=960,540
rows=[]; t0=time.time()
for k,f in enumerate(files):
    im=Image.open(f).convert('RGB').resize((W,H),Image.LANCZOS)
    a=np.array(im).astype(np.float32); R,G,B=a[...,0],a[...,1],a[...,2]
    V=a.max(2)/255.0; S=(a.max(2)-a.min(2))/np.maximum(a.max(2),1)
    body=(G>R)&(G>B*1.50)&(R>0.75*G)&(S>0.30)&(V>0.12)
    roi=np.zeros((H,W),bool); roi[80:540,220:740]=True; body&=roi
    body=ndi.binary_closing(body,np.ones((5,5),bool))
    lab,n=ndi.label(body,np.ones((3,3),bool)); sizes=ndi.sum(body,lab,range(1,n+1))
    if n:
        comp=lab==(int(np.argmax(sizes))+1); area=int(comp.sum())
    else:
        comp=np.zeros_like(body); area=0
    if area:
        ys,xs=np.where(comp); x0,y0,x1,y1=xs.min(),ys.min(),xs.max(),ys.max()
        sel=ys < y0+(y1-y0)*0.65; cx=float(xs[sel].mean()); cy=float(ys[sel].mean())
        sub=comp[y0:y1+1,x0:x1+1]; filled=ndi.binary_fill_holes(sub); holes=filled&~sub
        hlab,hn=ndi.label(holes); hsizes=ndi.sum(holes,hlab,range(1,hn+1)); maxhole=int(hsizes.max()) if hn else 0
        bbox=np.zeros((H,W),bool); bbox[y0:y1+1,x0:x1+1]=True
        blue=(B>R*1.25)&(B>G*1.05)&(S>0.35)&bbox
        white=(V>0.78)&(S<0.20)&bbox
        blue_area=int(blue.sum()); white_area=int(white.sum())
    else:
        x0=y0=x1=y1=cx=cy=maxhole=blue_area=white_area=0
    rows.append(dict(frame=k,area=area,x0=int(x0),y0=int(y0),x1=int(x1),y1=int(y1),cx=round(cx,2),cy=round(cy,2),maxhole=maxhole,blue=blue_area,white=white_area))
    if k%100==0: print(k,'elapsed',round(time.time()-t0,1),flush=True)
with open(r"W:\.gd\_video_work\motion_stats.csv",'w',newline='') as fp:
    w=csv.DictWriter(fp,fieldnames=rows[0].keys()); w.writeheader(); w.writerows(rows)
print('done',len(rows),'elapsed',time.time()-t0)
