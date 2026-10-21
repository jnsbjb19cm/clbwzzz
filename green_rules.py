from PIL import Image
import numpy as np
from scipy import ndimage as ndi
from pathlib import Path
p=r"W:\.gd\_video_work\samples2\f0180.png"
a=np.array(Image.open(p).convert('RGB')).astype(np.float32)
R,G,B=a[...,0],a[...,1],a[...,2]
H,W=R.shape
roi=np.zeros((H,W),bool); roi[400:2160,900:2850]=True
for name,mask in {
 'old':(G>R*1.03)&(G>B*1.35)&(G>35)&roi,
 'ratio65':(G>R)&(G>B*1.4)&(R>0.65*G)&(G>35)&roi,
 'ratio70':(G>R)&(G>B*1.4)&(R>0.70*G)&(G>35)&roi,
 'ratio68sat':(G>R)&(G>B*1.4)&(R>0.68*G)&(G>35)&roi,
}.items():
    lab,n=ndi.label(mask,structure=np.ones((3,3),bool)); sizes=ndi.sum(mask,lab,range(1,n+1)); comp=(lab==int(np.argmax(sizes))+1)
    ys,xs=np.where(comp)
    print(name,'total',mask.sum(),'comp',comp.sum(),'bbox',(xs.min(),ys.min(),xs.max(),ys.max()))
    out=np.zeros_like(a,dtype=np.uint8); out[comp]=[0,255,0]
    Image.fromarray(out).resize((1280,720)).save(rf"W:\.gd\_video_work\green_{name}.png")
