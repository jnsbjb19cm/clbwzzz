from PIL import Image
import numpy as np
from scipy import ndimage as ndi
from pathlib import Path

def mask_stats(path):
    a=np.array(Image.open(path).convert('RGB')).astype(np.int16)
    R,G,B=a[...,0],a[...,1],a[...,2]
    green=(G>R*1.03)&(G>B*1.35)&(G>35)
    orange=(R>G*1.12)&(G>B*1.5)&(R>150)
    # restrict
    roi=np.zeros(R.shape,bool); roi[350:2120,1150:2700]=True
    print('\n',Path(path).name)
    for name,m0 in [('green',green),('orange',orange),('both',green|orange)]:
        m=m0&roi
        lab,n=ndi.label(m,structure=np.ones((3,3),bool))
        sizes=ndi.sum(m,lab,range(1,n+1))
        order=np.argsort(sizes)[-10:][::-1]
        print(name,'comps',n,'total',m.sum())
        for j in order[:6]:
            idx=j+1; ys,xs=np.where(lab==idx)
            print(' ',int(sizes[j]),'bbox',(int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())),'cent',(round(xs.mean()),round(ys.mean())))
for p in [r"W:\.gd\_video_work\samples2\f0060.png",r"W:\.gd\_video_work\samples2\f0090.png",r"W:\.gd\_video_work\samples2\f0120.png",r"W:\.gd\_video_work\samples2\f0150.png",r"W:\.gd\_video_work\samples2\f0180.png"]:
    mask_stats(p)
