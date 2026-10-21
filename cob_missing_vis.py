from PIL import Image
import numpy as np
from pathlib import Path
k=524
cut=Path(r"W:\.gd\_video_work\cutouts_half_fix\idle\frame_0524.png")
a=np.array(Image.open(rf"W:\.gd\_video_work\frames_full\frame_{k:04d}.png").convert('RGB').resize((1920,1080),Image.LANCZOS)).astype(np.uint8)
R,G,B=a[...,0].astype(np.int16),a[...,1].astype(np.int16),a[...,2].astype(np.int16)
crop=Image.open(cut).convert('RGBA'); alpha=np.array(crop.getchannel('A'))
# crop box read from json
import json
recs=json.loads(Path(r"W:\.gd\_video_work\cutouts_half_fix\idle\frames.json").read_text(encoding='utf-8'))
r=[x for x in recs if x['source_frame']==k][0]; x0,y0,x1,y1=r['crop_box']
afull=np.zeros((1080,1920),np.uint8); afull[y0:y1+1,x0:x1+1]=alpha
strict=(R>G*1.35)&(G>B*1.30)&(R>145)
loose=(R>G*1.12)&(G>B*1.18)&(R>120)
roi=np.zeros_like(strict); roi[max(0,y0-40):y1+40,max(0,x0-40):x1+40]=True
strict&=roi; loose&=roi; alpha=(afull>127)&roi
vis=a.copy()
vis[strict]=(vis[strict]*0.35+np.array([0,0,255])*0.65).astype(np.uint8)
vis[loose&~strict]=(vis[loose&~strict]*0.35+np.array([255,255,0])*0.65).astype(np.uint8)
vis[loose&~alpha]=(vis[loose&~alpha]*0.2+np.array([255,0,0])*0.8).astype(np.uint8)
# crop around body
cropvis=Image.fromarray(vis[max(0,y0-40):y1+40,max(0,x0-40):x1+40])
cropvis.save(r"W:\.gd\_video_work\cob_missing_0524.png")
print('strict',strict.sum(),'loose',loose.sum(),'missing loose',int((loose&~alpha).sum()),'bbox',x0,y0,x1,y1)
