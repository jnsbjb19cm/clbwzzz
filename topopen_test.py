from PIL import Image, ImageDraw
import numpy as np, json
from scipy import ndimage as ndi
from pathlib import Path
cutdir=Path(r"W:\.gd\_video_work\cutouts_v11\attack"); recs=json.loads((cutdir/'frames.json').read_text(encoding='utf-8'))
for k in [162,168,174,179]:
 r=[z for z in recs if z['source_frame']==k][0]; x0,y0,x1,y1=r['crop_box']
 cut=np.array(Image.open(cutdir/f"frame_{k:04d}.png").convert('RGBA')); rgb=cut[...,:3]; a=cut[...,3]>127
 src=np.array(Image.open(rf"W:\.gd\_video_work\frames_full\frame_{k:04d}.png").convert('RGB').resize((1920,1080),Image.LANCZOS)).astype(np.float32)
 R,G,B=src[...,0],src[...,1],src[...,2]; V=src.max(2)/255.; S=(src.max(2)-src.min(2))/np.maximum(src.max(2),1)
 afull=np.zeros((1080,1920),bool); afull[y0:y1+1,x0:x1+1]=a
 H,W=afull.shape; yy,xx=np.mgrid[0:H,0:W]
 top_band=(yy>=y0)&(yy<y0+(y1-y0)*0.20)
 opened=ndi.binary_opening(afull,np.ones((21,21),bool))
 # protect cob orange in top band
 orange=(R>G*1.10)&(R>B*1.25)&(R>120)
 opened |= (afull & top_band & orange)
 afull2=(afull & ~top_band) | (opened & top_band)
 # remove thin near blue as before
 blue=(B>G*1.03)&(B>R*1.35)&(S>0.35)&(V>0.18)
 if blue.any():
  near=ndi.binary_dilation(blue,iterations=60); thin=afull2&~ndi.binary_opening(afull2,np.ones((15,15),bool)); afull2 &= ~(thin&near)
 a2=afull2[y0:y1+1,x0:x1+1]
 out=np.dstack([rgb,np.where(a2,255,0).astype(np.uint8)]); im=Image.fromarray(out,'RGBA'); chk=Image.new('RGBA',im.size,(255,255,255,255)); d=ImageDraw.Draw(chk)
 for yy2 in range(0,im.height,32):
  for xx2 in range(0,im.width,32):
   if (xx2//32+yy2//32)%2: d.rectangle([xx2,yy2,xx2+31,yy2+31],fill=(200,200,200,255))
 compo=chk.copy(); compo.alpha_composite(im); compo.convert('RGB').save(rf"W:\.gd\_video_work\topopen_{k}.png")
 print(k,'removed',int(a.sum()-a2.sum()))
