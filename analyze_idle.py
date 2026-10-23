from PIL import Image
import numpy as np, json
from pathlib import Path
d=Path(r"W:\.gd\_video_work\cutouts_v13\idle"); recs=json.loads((d/'frames.json').read_text(encoding='utf-8'))
vals=[]
for r in recs:
 arr=np.array(Image.open(d/f"frame_{r['source_frame']:04d}.png").convert('RGBA')); a=arr[...,3]>127; ys,xs=np.where(a)
 vals.append((r['source_frame'],float(xs.mean()),float(xs.min()),float(xs.max())))
for i in range(0,len(vals),10):
 chunk=vals[i:i+10]; print(chunk[0][0],chunk[-1][0],'meanx',round(sum(v[1] for v in chunk)/len(chunk),1))
print('minmax',min(v[1] for v in vals),max(v[1] for v in vals))
# print every 6
print([(k,round(m,0)) for k,m,_,_ in vals[::6]])
