from PIL import Image, ImageDraw
import numpy as np, json
from scipy import ndimage as ndi
from pathlib import Path
for k in [162,168,174,179]:
 cutdir=Path(r"W:\.gd\_video_work\cutouts_v13\attack"); recs=json.loads((cutdir/'frames.json').read_text(encoding='utf-8')); r=[z for z in recs if z['source_frame']==k][0]
 x0,y0,x1,y1=r['crop_box']; arr=np.array(Image.open(cutdir/f"frame_{k:04d}.png").convert('RGBA')); rgb=arr[...,:3]; a=arr[...,3]
 afull=np.zeros((1080,1920),bool); afull[y0:y1+1,x0:x1+1]=a>127
 yy,xx=np.mgrid[0:1080,0:1920]; top=yy<y0+(y1-y0)*0.22
 longh=ndi.binary_opening(afull,np.ones((1,31),bool))
 remove=longh&top&(xx>x0+(x1-x0)*0.42)
 afull2=afull&~remove
 # fill?
 afull2=ndi.binary_closing(afull2,np.ones((3,3),bool))
 lab,n=ndi.label(afull2,np.ones((3,3),bool)); sizes=ndi.sum(afull2,lab,range(1,n+1));
 if n: afull2=lab==(int(np.argmax(sizes))+1)
 af=ndi.gaussian_filter(afull2.astype(np.float32),0.5); af[~ndi.binary_dilation(afull2,iterations=1)]=0
 a2=(np.clip(af,0,1)[y0:y1+1,x0:x1+1]*255).astype(np.uint8)
 im=Image.fromarray(np.dstack([rgb,a2]),'RGBA'); chk=Image.new('RGBA',im.size,(255,255,255,255)); d=ImageDraw.Draw(chk)
 for y in range(0,im.height,32):
  for x in range(0,im.width,32):
   if (x//32+y//32)%2: d.rectangle([x,y,x+31,y+31],fill=(200,200,200,255))
 compo=chk.copy(); compo.alpha_composite(im); compo.convert('RGB').save(rf"W:\.gd\_video_work\linetest2_{k}.png")
 print(k,'remove',int(remove.sum()))
