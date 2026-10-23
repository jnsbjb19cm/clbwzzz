from PIL import Image
import numpy as np
from pathlib import Path
root=Path(r"W:\.gd\_video_work\frames_full")
vals=[]
for k in range(460,721,2):
 im=np.array(Image.open(root/f"frame_{k:04d}.png").convert('RGB').resize((480,270),Image.LANCZOS)).astype(np.float32)
 R,G,B=im[...,0],im[...,1],im[...,2]
 m=(R>G*1.05)&(R>B*1.2)&(R>110)
 yy,xx=np.mgrid[0:270,0:480]; m&=(xx>150)&(xx<330)&(yy>20)&(yy<190)
 ys,xs=np.where(m)
 if len(xs)>30: vals.append((k,float(np.median(xs)),len(xs)))
for i in range(0,len(vals),20):
 ch=vals[i:i+20]; print(ch[0][0],ch[-1][0],'cobx',round(sum(v[1] for v in ch)/len(ch),1))
print([(k,round(x,0)) for k,x,_ in vals[::6]])
