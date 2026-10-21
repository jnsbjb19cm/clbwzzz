from PIL import Image
import numpy as np
from scipy import ndimage as ndi
from pathlib import Path

def stats(p):
    im=Image.open(p).convert('RGB'); a=np.array(im); H,W=a.shape[:2]
    R,G,B=a[...,0].astype(np.float32),a[...,1].astype(np.float32),a[...,2].astype(np.float32)
    V=a.max(2)/255.0; S=(a.max(2)-a.min(2))/np.maximum(a.max(2),1)
    roi=np.zeros((H,W),bool); roi[400:2160,900:2850]=True
    body=(G>R)&(G>B*1.5)&(R>0.745*G)&(S>0.3)&(V>0.12)&roi
    body=ndi.binary_opening(body,np.ones((3,3),bool)); body=ndi.binary_closing(body,np.ones((7,7),bool))
    lab,n=ndi.label(body,np.ones((3,3),bool)); sizes=ndi.sum(body,lab,range(1,n+1)); comp=lab==(int(np.argmax(sizes))+1)
    ys,xs=np.where(comp); bbox=(xs.min(),ys.min(),xs.max(),ys.max())
    print('\n',Path(p).name,'core bbox',bbox,'area',comp.sum())
    orange=(R>G*1.15)&(G>B*1.5)&(R>160)&(R-G>35)&roi
    # only within bbox expanded
    x0,y0,x1,y1=bbox; m=np.zeros_like(orange); m[max(0,y0-100):y1+1,max(0,x0-100):x1+1]=True
    orange &= m
    olab,on=ndi.label(orange,np.ones((3,3),bool)); osizes=ndi.sum(orange,olab,range(1,on+1))
    for j in np.argsort(osizes)[-12:][::-1]:
        idx=j+1; yy,xx=np.where(olab==idx)
        # dilation touch count
        print(' area',int(osizes[j]),'bbox',(int(xx.min()),int(yy.min()),int(xx.max()),int(yy.max())),'cent',(round(xx.mean()),round(yy.mean())))
for p in [r"W:\.gd\_video_work\samples2\f0180.png",r"W:\.gd\_video_work\frames_full\frame_0240.png"]:
    stats(p)
