from PIL import Image
import numpy as np
from scipy import ndimage as ndi
k=524
im=Image.open(rf"W:\.gd\_video_work\frames_full\frame_{k:04d}.png").convert('RGB').resize((1920,1080),Image.LANCZOS)
a=np.array(im).astype(np.float32); R,G,B=a[...,0],a[...,1],a[...,2]; V=a.max(2)/255.
roi=np.zeros(V.shape,bool); roi[175:1080,450:1450]=True
green=(G>R*1.02)&(G>B*1.35)&(R>0.70*G)&(V>0.10)&roi
green=ndi.binary_opening(green,np.ones((3,3),bool)); green=ndi.binary_closing(green,np.ones((5,5),bool))
lab,n=ndi.label(green,np.ones((3,3),bool)); sizes=ndi.sum(green,lab,range(1,n+1)); comp=lab==(int(np.argmax(sizes))+1)
ys,xs=np.where(comp); x0,y0,x1,y1=xs.min(),ys.min(),xs.max(),ys.max(); bw=x1-x0+1; bh=y1-y0+1
print('bbox',x0,y0,x1,y1,bw,bh)
# close horizontally to smooth leaf runs
g=ndi.binary_closing(comp,np.ones((1,17),bool))
def runs(row):
 xs=np.where(row)[0]
 if len(xs)==0:return []
 out=[]; s=pr=int(xs[0])
 for x in xs[1:]:
  x=int(x)
  if x==pr+1:pr=x
  else:out.append((s,pr));s=pr=x
 out.append((s,pr));return out
for y in range(y0, y0+int(bh*0.75), max(1,bh//25)):
 rr=[r for r in runs(g[y]) if r[1]-r[0]>=10]
 print(y, 'ry',round((y-y0)/bh,2), rr, 'norm', [(round((a-x0)/bw,2),round((b-x0)/bw,2)) for a,b in rr])
