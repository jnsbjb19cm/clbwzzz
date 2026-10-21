from PIL import Image
import numpy as np
from scipy import ndimage as ndi
for fn in ['frame_0480.png','frame_0540.png','frame_0120.png']:
    a=np.array(Image.open(rf"W:\.gd\_video_work\frames_full\{fn}").convert('RGB')).astype(np.float32); R,G,B=a[...,0],a[...,1],a[...,2]
    V=a.max(2)/255.; S=(a.max(2)-a.min(2))/np.maximum(a.max(2),1)
    dark=(V<0.35)&(np.abs(R-G)<80)&(G>20)
    roi=np.zeros(V.shape,bool); roi[350:2160,900:2900]=True; dark&=roi
    lab,n=ndi.label(dark,np.ones((3,3),bool)); sizes=ndi.sum(dark,lab,range(1,n+1))
    print('\n',fn)
    for j in np.argsort(sizes)[-20:][::-1]:
        yy,xx=np.where(lab==j+1)
        print(int(sizes[j]),(int(xx.min()),int(yy.min()),int(xx.max()),int(yy.max())),round(xx.mean()),round(yy.mean()))
