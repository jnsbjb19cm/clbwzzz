from PIL import Image
import numpy as np
from scipy import ndimage as ndi
from pathlib import Path
for p in [r"W:\.gd\_video_work\samples2\f0180.png",r"W:\.gd\_video_work\frames_full\frame_0300.png",r"W:\.gd\_video_work\frames_full\frame_0600.png"]:
    a=np.array(Image.open(p).convert('RGB')).astype(np.float32); R,G,B=a[...,0],a[...,1],a[...,2]
    H,W=R.shape; roi=np.zeros((H,W),bool); roi[350:2160,900:2900]=True
    for th in [1.25,1.30,1.35,1.40]:
        m=(R>G*th)&(G>B*1.35)&(R>160)&roi
        m=ndi.binary_closing(m,np.ones((5,5),bool))
        lab,n=ndi.label(m,np.ones((3,3),bool)); sizes=ndi.sum(m,lab,range(1,n+1))
        print('\n',Path(p).name,'th',th,'total',m.sum())
        for j in np.argsort(sizes)[-5:][::-1]:
            idx=j+1; yy,xx=np.where(lab==idx)
            print(' ',int(sizes[j]),(int(xx.min()),int(yy.min()),int(xx.max()),int(yy.max())))
