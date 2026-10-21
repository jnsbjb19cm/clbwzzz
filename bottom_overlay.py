from PIL import Image, ImageDraw
import numpy as np
from scipy import ndimage as ndi
p=r"W:\.gd\_video_work\samples2\f0180.png"
im=Image.open(p).convert('RGB'); a=np.array(im).astype(np.float32); R,G,B=a[...,0],a[...,1],a[...,2]
H,W=R.shape; roi=np.zeros((H,W),bool); roi[400:2160,900:2850]=True
mask=(G>R)&(G>B*1.4)&(R>0.70*G)&(G>35)&roi
lab,n=ndi.label(mask,structure=np.ones((3,3),bool)); sizes=ndi.sum(mask,lab,range(1,n+1)); comp=(lab==int(np.argmax(sizes))+1)
vis=a.copy().astype(np.uint8); vis[comp]=(vis[comp]*0.3+np.array([0,255,0])*0.7).astype(np.uint8)
x0,y0,x1,y1=1100,1300,2700,2160
crop=Image.fromarray(vis[y0:y1,x0:x1])
d=ImageDraw.Draw(crop)
for x in range(0,crop.width,100): d.line([(x,0),(x,crop.height)],fill=(255,0,255),width=1); d.text((x+2,2),str(x+x0),fill=(255,0,255))
for y in range(0,crop.height,100): d.line([(0,y),(crop.width,y)],fill=(255,0,255),width=1); d.text((2,y+2),str(y+y0),fill=(255,0,255))
crop.save(r"W:\.gd\_video_work\bottom_overlay.png")
