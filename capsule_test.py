from PIL import Image, ImageDraw
import numpy as np, json
from scipy import ndimage as ndi
from pathlib import Path
for k in [162,168,174,179]:
 cutdir=Path(r"W:\.gd\_video_work\cutouts_v13\attack"); recs=json.loads((cutdir/'frames.json').read_text(encoding='utf-8')); r=[z for z in recs if z['source_frame']==k][0]
 x0,y0,x1,y1=r['crop_box']; arr=np.array(Image.open(cutdir/f"frame_{k:04d}.png").convert('RGBA')); rgb=arr[...,:3]; a=arr[...,3]
 afull=np.zeros((1080,1920),bool); afull[y0:y1+1,x0:x1+1]=a>127
 src=np.array(Image.open(rf"W:\.gd\_video_work\frames_full\frame_{k:04d}.png").convert('RGB').resize((1920,1080),Image.LANCZOS)).astype(np.float32)
 R,G,B=src[...,0],src[...,1],src[...,2]; V=src.max(2)/255.; S=(src.max(2)-src.min(2))/np.maximum(src.max(2),1)
 blue=(B>G*1.03)&(B>R*1.35)&(S>0.35)&(V>0.18)
 if blue.any():
  yb,xb=np.where(blue); bcx,bcy=xb.mean(),yb.mean()
  thick=ndi.binary_opening(afull,np.ones((11,11),bool))
  # nearest thick pixel
  dist,inds=ndi.distance_transform_edt(~thick,return_indices=True)
  iy,ix=inds[0][int(bcy),int(bcx)],inds[1][int(bcy),int(bcx)]
  # capsule mask: distance from segment (bcx,bcy)-(ix,iy) < width
  yy,xx=np.mgrid[0:1080,0:1920]
  vx,vy=ix-bcx,iy-bcy; L2=vx*vx+vy*vy
  if L2>0:
   t=np.clip(((xx-bcx)*vx+(yy-bcy)*vy)/L2,0,1); px=bcx+t*vx; py=bcy+t*vy
   d2=(xx-px)**2+(yy-py)**2; caps=(d2<18**2)&~thick
  else: caps=np.zeros_like(afull)
  # also remove thin pixels in ball bbox expanded 40
  bx0,bx1,by0,by1=xb.min()-40,xb.max()+40,yb.min()-40,yb.max()+40
  thin=afull&~ndi.binary_opening(afull,np.ones((7,7),bool))
  ballbox=np.zeros_like(afull); ballbox[max(0,by0):by1,max(0,bx0):bx1]=True
  remove=(caps|(thin&ballbox))&afull
  afull2=afull&~remove
  print(k,'ball',round(bcx),round(bcy),'attach',int(ix),int(iy),'remove',int(remove.sum()))
 else:
  afull2=afull; print(k,'no blue')
 afull2=ndi.binary_closing(afull2,np.ones((3,3),bool)); lab,n=ndi.label(afull2,np.ones((3,3),bool)); sizes=ndi.sum(afull2,lab,range(1,n+1));
 if n: afull2=lab==(int(np.argmax(sizes))+1)
 af=ndi.gaussian_filter(afull2.astype(np.float32),0.5); af[~ndi.binary_dilation(afull2,iterations=1)]=0
 a2=(np.clip(af,0,1)[y0:y1+1,x0:x1+1]*255).astype(np.uint8)
 im=Image.fromarray(np.dstack([rgb,a2]),'RGBA'); chk=Image.new('RGBA',im.size,(255,255,255,255)); d=ImageDraw.Draw(chk)
 for y in range(0,im.height,32):
  for x in range(0,im.width,32):
   if (x//32+y//32)%2: d.rectangle([x,y,x+31,y+31],fill=(200,200,200,255))
 compo=chk.copy(); compo.alpha_composite(im); compo.convert('RGB').save(rf"W:\.gd\_video_work\capsule_{k}.png")
