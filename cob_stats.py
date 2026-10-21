from PIL import Image
import numpy as np
from scipy import ndimage as ndi
for fn in ['frame_0120.png','frame_0480.png','frame_0540.png']:
    a=np.array(Image.open(rf"W:\.gd\_video_work\frames_full\{fn}").convert('RGB')).astype(np.float32); R,G,B=a[...,0],a[...,1],a[...,2]
    H,W=R.shape; roi=np.zeros((H,W),bool); roi[350:2160,900:2900]=True
    orange=(R>G*1.35)&(G>B*1.30)&(R>145)&roi
    orange=ndi.binary_closing(orange,np.ones((5,5),bool))
    lab,n=ndi.label(orange,np.ones((3,3),bool)); sizes=ndi.sum(orange,lab,range(1,n+1))
    print('\n',fn)
    for j in np.argsort(sizes)[-8:][::-1]:
        yy,xx=np.where(lab==j+1)
        print(int(sizes[j]),(int(xx.min()),int(yy.min()),int(xx.max()),int(yy.max())),(round(xx.mean()),round(yy.mean())))
