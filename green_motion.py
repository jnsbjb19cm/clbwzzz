from PIL import Image
import numpy as np
from pathlib import Path
root=Path(r"W:\.gd\_video_work\frames_full")
vals=[]
for k in range(180,874,2):
    im=np.array(Image.open(root/f"frame_{k:04d}.png").convert('RGB').resize((480,270),Image.LANCZOS)).astype(np.float32)
    R,G,B=im[...,0],im[...,1],im[...,2]
    m=(G>R*1.03)&(G>B*1.18)&(G>55)
    # central ROI
    yy,xx=np.mgrid[0:270,0:480]; m &= (xx>120)&(xx<360)&(yy>40)&(yy<250)
    ys,xs=np.where(m)
    if len(xs)>100:
        # robust center: median x of green body
        vals.append((k,float(np.median(xs)),int(len(xs))))
print('n',len(vals))
for i in range(0,len(vals),20):
    chunk=vals[i:i+20]
    print(chunk[0][0],chunk[-1][0],'x',round(sum(v[1] for v in chunk)/len(chunk),1))
# find smooth local extrema on median filtered series
xs=np.array([v[1] for v in vals]); ks=np.array([v[0] for v in vals])
from scipy.ndimage import median_filter, uniform_filter1d
sm=uniform_filter1d(median_filter(xs,size=5),size=7)
# print every 10 with values around turns
for i in range(2,len(sm)-2):
    if (sm[i]<=sm[i-1] and sm[i]<=sm[i+1]) or (sm[i]>=sm[i-1] and sm[i]>=sm[i+1]):
        if i%3==0: print('turn',ks[i],round(sm[i],1))
np.save(r"W:\.gd\_video_work\green_x_180_873.npy",np.vstack([ks,sm]))
