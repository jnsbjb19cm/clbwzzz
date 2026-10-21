from PIL import Image
import numpy as np
from scipy import ndimage as ndi
from pathlib import Path

def analyze(path):
    im=Image.open(path).convert('RGB')
    a=np.array(im)
    hsv=np.array(im.convert('HSV'))
    H=hsv[...,0].astype(np.int16); S=hsv[...,1].astype(np.float32)/255; V=hsv[...,2].astype(np.float32)/255
    # PIL H 0-255 maps 0-360
    green=((H>=40)&(H<=115)&(S>0.22)&(V>0.08))
    orange=((H>=8)&(H<=45)&(S>0.45)&(V>0.25))
    print('\n',Path(path).name, im.size)
    for name,mask in [('green',green),('orange',orange)]:
        lab,n=ndi.label(mask,structure=np.ones((3,3),bool))
        sizes=ndi.sum(mask,lab,range(1,n+1))
        order=np.argsort(sizes)[-12:][::-1]
        print(name,'components',n)
        for j in order:
            idx=j+1; ys,xs=np.where(lab==idx)
            print(' ',int(sizes[j]),'bbox',(int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max())),'cent',(round(xs.mean()),round(ys.mean())))
    # dominant colors center crop
    x0,y0,x1,y1=1200,200,2800,2050
    sub=a[y0:y1,x0:x1][::8,::8].reshape(-1,3)
    q=(sub//16*16)
    vals,cnt=np.unique(q,axis=0,return_counts=True)
    ids=np.argsort(cnt)[-20:][::-1]
    print('dominant colors')
    for i in ids: print(' ',vals[i],cnt[i])
for p in [r"W:\.gd\_video_work\samples2\f0120.png",r"W:\.gd\_video_work\samples2\f0180.png"]:
    analyze(p)
