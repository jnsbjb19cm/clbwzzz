from PIL import Image, ImageDraw
import numpy as np, json
from scipy import ndimage as ndi
from pathlib import Path
k=168; cutdir=Path(r"W:\.gd\_video_work\cutouts_v13\attack")
recs=json.loads((cutdir/'frames.json').read_text(encoding='utf-8')); r=[z for z in recs if z['source_frame']==k][0]
x0,y0,x1,y1=r['crop_box']; arr=np.array(Image.open(cutdir/f"frame_{k:04d}.png").convert('RGBA')); rgb=arr[...,:3]; a=arr[...,3]
afull=np.zeros((1080,1920),bool); afull[y0:y1+1,x0:x1+1]=a>127
src=np.array(Image.open(rf"W:\.gd\_video_work\frames_full\frame_{k:04d}.png").convert('RGB').resize((1920,1080),Image.LANCZOS)).astype(np.float32)
R,G,B=src[...,0],src[...,1],src[...,2]; V=src.max(2)/255.; S=(src.max(2)-src.min(2))/np.maximum(src.max(2),1)
yy,xx=np.mgrid[0:1080,0:1920]; top=(yy>=y0)&(yy<y0+(y1-y0)*0.20)
opened=ndi.binary_opening(afull,np.ones((21,21),bool))
orange=(R>G*1.10)&(R>B*1.25)&(R>120)
opened |= afull&top&orange
afull=(afull&~top)|(opened&top)
blue=(B>G*1.03)&(B>R*1.35)&(S>0.35)&(V>0.18)
if blue.any():
 near=ndi.binary_dilation(blue,iterations=60); thin=afull&~ndi.binary_opening(afull,np.ones((15,15),bool)); afull&=~(thin&near)
lab,n=ndi.label(afull,np.ones((3,3),bool)); sizes=ndi.sum(afull,lab,range(1,n+1))
if n:
 mx=float(sizes.max()); keep=np.zeros_like(afull)
 for j in range(n):
  if sizes[j]>=max(2000.0,mx*0.02): keep|=(lab==j+1)
 afull=keep
a2=afull[y0:y1+1,x0:x1+1]
# feather
af=ndi.gaussian_filter(afull.astype(np.float32),0.5); af[~ndi.binary_dilation(afull,iterations=1)]=0; a2=(np.clip(af,0,1)[y0:y1+1,x0:x1+1]*255).astype(np.uint8)
im=Image.fromarray(np.dstack([rgb,a2]),'RGBA'); chk=Image.new('RGBA',im.size,(255,255,255,255)); d=ImageDraw.Draw(chk)
for y in range(0,im.height,32):
 for x in range(0,im.width,32):
  if (x//32+y//32)%2: d.rectangle([x,y,x+31,y+31],fill=(200,200,200,255))
compo=chk.copy(); compo.alpha_composite(im); compo.convert('RGB').save(r"W:\.gd\_video_work\v13top_168.png")
print('done')
