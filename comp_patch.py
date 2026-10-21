from PIL import Image
import numpy as np, json
from scipy import ndimage as ndi
from pathlib import Path
cutdir=Path(r"W:\.gd\_video_work\cutouts_v11\attack"); recs=json.loads((cutdir/'frames.json').read_text(encoding='utf-8'))
for k in [162,168]:
 r=[z for z in recs if z['source_frame']==k][0]; x0,y0,x1,y1=r['crop_box']
 cut=np.array(Image.open(cutdir/f"frame_{k:04d}.png").convert('RGBA')); a=cut[...,3]>127
 src=np.array(Image.open(rf"W:\.gd\_video_work\frames_full\frame_{k:04d}.png").convert('RGB').resize((1920,1080),Image.LANCZOS)).astype(np.float32)
 R,G,B=src[...,0],src[...,1],src[...,2]; V=src.max(2)/255.; S=(src.max(2)-src.min(2))/np.maximum(src.max(2),1)
 blue=(B>G*1.03)&(B>R*1.35)&(S>0.35)&(V>0.18); afull=np.zeros((1080,1920),bool); afull[y0:y1+1,x0:x1+1]=a
 near=ndi.binary_dilation(blue,iterations=60)
 thin=afull&~ndi.binary_opening(afull,np.ones((15,15),bool)); afull2=afull&~(thin&near)
 lab,n=ndi.label(afull2,np.ones((3,3),bool)); sizes=ndi.sum(afull2,lab,range(1,n+1))
 print('\nframe',k,'components',n)
 for j in np.argsort(sizes)[-10:][::-1]:
  yy,xx=np.where(lab==j+1); print(int(sizes[j]),(int(xx.min()),int(yy.min()),int(xx.max()),int(yy.max())))
