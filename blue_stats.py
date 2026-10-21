from PIL import Image
import numpy as np
from scipy import ndimage as ndi
for k in range(96,180,2):
    a=np.array(Image.open(rf"W:\.gd\_video_work\frames_full\frame_{k:04d}.png").convert('RGB')).astype(np.float32)
    R,G,B=a[...,0],a[...,1],a[...,2]; V=a.max(2)/255.; S=(a.max(2)-a.min(2))/np.maximum(a.max(2),1)
    blue=(B>G*1.03)&(B>R*1.35)&(S>0.35)&(V>0.18)
    lab,n=ndi.label(blue,np.ones((3,3),bool)); sizes=ndi.sum(blue,lab,range(1,n+1))
    top=int(sizes.max()) if n else 0
    # largest bbox
    bbox=(0,0,0,0)
    if n:
        idx=int(np.argmax(sizes))+1; yy,xx=np.where(lab==idx); bbox=(int(xx.min()),int(yy.min()),int(xx.max()),int(yy.max()))
    print(k,top,bbox)
