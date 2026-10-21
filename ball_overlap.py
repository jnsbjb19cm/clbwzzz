from PIL import Image
import numpy as np
from scipy import ndimage as ndi
from pathlib import Path
plate=np.array(Image.open(r"W:\.gd\_video_work\attack_plate_mask.png").convert('L'))>0
plate_d=ndi.binary_dilation(plate,iterations=20)
rows=[]
for k in range(96,180):
    a=np.array(Image.open(rf"W:\.gd\_video_work\frames_full\frame_{k:04d}.png").convert('RGB')).astype(np.float32)
    R,G,B=a[...,0],a[...,1],a[...,2]; V=a.max(2)/255.
    blue=(B>R*1.18)&(B>G*0.92)&(V>0.18)
    cyan=(G>R*1.15)&(B>G*0.50)&(B>70)
    ball=ndi.binary_dilation(blue|cyan,iterations=3)
    overlap=int((ball&plate_d).sum())
    rows.append((k,overlap,int(ball.sum())))
for k,o,b in rows: print(k,o,b)
