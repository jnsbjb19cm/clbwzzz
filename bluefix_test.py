from PIL import Image, ImageDraw
import numpy as np, json
from scipy import ndimage as ndi
from pathlib import Path
ref=Image.open(r"W:\.gd\_video_work\reference_cutout.png").convert('RGBA'); ra=np.array(ref); ys,xs=np.where(ra[...,3]>16); rx0,ry0,rx1,ry1=xs.min(),ys.min(),xs.max(),ys.max(); refc=ref.crop((rx0,ry0,rx1+1,ry1+1))
for k in [162,168,174,179]:
 recs=json.loads(Path(r"W:\.gd\_video_work\cutouts_v13\attack\frames.json").read_text(encoding='utf-8')); r=[z for z in recs if z['source_frame']==k][0]
 x0,y0,x1,y1=r['crop_box']; tw=x1-x0+1; th=y1-y0+1
 src=np.array(Image.open(rf"W:\.gd\_video_work\frames_full\frame_{k:04d}.png").convert('RGB').resize((1920,1080),Image.LANCZOS))
 arr=np.array(Image.open(rf"W:\.gd\_video_work\cutouts_v13\attack\frame_{k:04d}.png").convert('RGBA')); a=arr[...,3]
 afull=np.zeros((1080,1920),bool); afull[y0:y1+1,x0:x1+1]=a>127
 rimg=refc.resize((tw,th),Image.LANCZOS); rarr=np.array(rimg); ref_a=np.zeros((1080,1920),bool); ref_rgb=np.zeros((1080,1920,3),np.uint8); ref_a[y0:y1+1,x0:x1+1]=rarr[...,3]>16; ref_rgb[y0:y1+1,x0:x1+1]=rarr[...,:3]
 afull2=afull&ndi.binary_dilation(ref_a,iterations=2)
 # replace bluish pixels in top region with reference RGB
 R,G,B=src[...,0].astype(np.float32),src[...,1].astype(np.float32),src[...,2].astype(np.float32); V=np.maximum(np.maximum(R,G),B)/255.; S=(np.maximum(np.maximum(R,G),B)-np.minimum(np.minimum(R,G),B))/np.maximum(np.maximum(np.maximum(R,G),B),1)
 bluish=((B>R*1.03)&(B>G*0.98)&(V>0.12)) | ((B>G*1.02)&(B>R*1.1))
 yy,xx=np.mgrid[0:1080,0:1920]; top=yy<y0+(y1-y0)*0.30
 rgb=src.copy(); repl=afull2&top&bluish&ref_a; rgb[repl]=ref_rgb[repl]
 # also remove any alpha outside ref
 afull2=ndi.binary_closing(afull2,np.ones((3,3),bool)); afull2=ndi.binary_fill_holes(afull2)
 lab,n=ndi.label(afull2,np.ones((3,3),bool)); sizes=ndi.sum(afull2,lab,range(1,n+1));
 if n: afull2=lab==(int(np.argmax(sizes))+1)
 af=ndi.gaussian_filter(afull2.astype(np.float32),0.5); af[~ndi.binary_dilation(afull2,iterations=1)]=0
 a2=(np.clip(af,0,1)[y0:y1+1,x0:x1+1]*255).astype(np.uint8); rgbc=rgb[y0:y1+1,x0:x1+1]
 im=Image.fromarray(np.dstack([rgbc,a2]),'RGBA'); chk=Image.new('RGBA',im.size,(255,255,255,255)); d=ImageDraw.Draw(chk)
 for y in range(0,im.height,32):
  for x in range(0,im.width,32):
   if (x//32+y//32)%2: d.rectangle([x,y,x+31,y+31],fill=(200,200,200,255))
 compo=chk.copy(); compo.alpha_composite(im); compo.convert('RGB').save(rf"W:\.gd\_video_work\bluefix_{k}.png")
 print(k,'repl',int(repl.sum()))
