from PIL import Image
import numpy as np
from scipy import ndimage as ndi
from pathlib import Path
import time, json
root=Path(r"W:\.gd\_video_work\frames_full")
frames=list(range(96,180))
W,H=3840,2160
roi=np.zeros((H,W),bool); roi[300:2160,850:2950]=True
count=np.zeros((H,W),np.uint16)
sum_rgb=np.zeros((H,W,3),np.float32)
t0=time.time(); n=0
for k in frames:
    a=np.array(Image.open(root/f"frame_{k:04d}.png").convert('RGB')).astype(np.float32)
    R,G,B=a[...,0],a[...,1],a[...,2]; V=a.max(2)/255.
    green=(G>R*1.02)&(G>B*1.35)&(R>0.70*G)&(V>0.10)&roi
    green=ndi.binary_opening(green,np.ones((3,3),bool)); green=ndi.binary_closing(green,np.ones((7,7),bool))
    lab,ln=ndi.label(green,np.ones((3,3),bool)); sizes=ndi.sum(green,lab,range(1,ln+1))
    if ln:
        main=lab==(int(np.argmax(sizes))+1)
    else:
        main=np.zeros_like(green)
    near=ndi.binary_dilation(main,iterations=30)
    orange=(R>G*1.35)&(G>B*1.30)&(R>145)&near
    dark=(V<0.36)&near
    body=main|orange|dark
    # exclude obvious blue/cyan/white projectile colors
    blue=(B>R*1.18)&(B>G*0.92)&(V>0.18)
    white=(V>0.75)&((a.max(2)-a.min(2))/np.maximum(a.max(2),1)<0.18)
    body &= ~ndi.binary_dilation(blue|white,iterations=3)
    body &= roi
    count[body]+=1
    sum_rgb[body]+=a[body]
    n+=1
    if k%10==0: print(k,round(time.time()-t0,1),flush=True)
plate_ratio=count.astype(np.float32)/n
plate_mask=plate_ratio>0.18
plate_mask=ndi.binary_closing(plate_mask,np.ones((5,5),bool))
# keep connected to central body seed: largest comp
lab,ln=ndi.label(plate_mask,np.ones((3,3),bool)); sizes=ndi.sum(plate_mask,lab,range(1,ln+1))
if ln: plate_mask=lab==(int(np.argmax(sizes))+1)
plate_mask=ndi.binary_fill_holes(plate_mask)
rgb=np.zeros((H,W,3),np.uint8); ok=count>0
rgb[ok]=(sum_rgb[ok]/count[ok,None]).clip(0,255).astype(np.uint8)
Image.fromarray(rgb,'RGB').save(r"W:\.gd\_video_work\attack_plate_rgb.png")
Image.fromarray((plate_mask*255).astype(np.uint8),'L').save(r"W:\.gd\_video_work\attack_plate_mask.png")
print('done',n,'plate count',int(plate_mask.sum()),'elapsed',round(time.time()-t0,1))
