from PIL import Image, ImageDraw
import numpy as np, json
from scipy import ndimage as ndi
from pathlib import Path
ref=Image.open(r"W:\.gd\_video_work\reference_cutout.png").convert('RGBA')
ra=np.array(ref); ys,xs=np.where(ra[...,3]>16); rx0,ry0,rx1,ry1=xs.min(),ys.min(),xs.max(),ys.max(); refc=ref.crop((rx0,ry0,rx1+1,ry1+1))
for k,anim in [(100,'attack'),(524,'idle'),(540,'idle'),(168,'attack')]:
    recs=json.loads(Path(rf"W:\.gd\_video_work\cutouts_final2\{anim}\frames.json").read_text(encoding='utf-8'))
    r=[z for z in recs if z['source_frame']==k][0]; x0,y0,x1,y1=r['crop_box']; tw=x1-x0+1; th=y1-y0+1
    src=np.array(Image.open(rf"W:\.gd\_video_work\frames_full\frame_{k:04d}.png").convert('RGB').resize((1920,1080),Image.LANCZOS)).astype(np.float32)
    cut=np.array(Image.open(rf"W:\.gd\_video_work\cutouts_final2\{anim}\frame_{k:04d}.png").convert('RGBA'))
    src_a=np.zeros((1080,1920),bool); src_a[y0:y1+1,x0:x1+1]=cut[...,3]>127
    rimg=refc.resize((tw,th),Image.LANCZOS); rarr=np.array(rimg)
    ref_a=np.zeros((1080,1920),bool); ref_rgb=np.zeros((1080,1920,3),np.uint8)
    ref_a[y0:y1+1,x0:x1+1]=rarr[...,3]>16; ref_rgb[y0:y1+1,x0:x1+1]=rarr[...,:3]
    R,G,B=src[...,0],src[...,1],src[...,2]; V=src.max(2)/255.; S=(src.max(2)-src.min(2))/np.maximum(src.max(2),1)
    green=(G>R*1.02)&(G>B*1.25)&(V>0.10)
    orange=(R>G*1.08)&(R>B*1.2)&(R>120)
    dark=(V<0.38)
    white=(V>0.72)&(S<0.25)
    blue=(B>G*1.03)&(B>R*1.35)&(S>0.30)&(V>0.18)
    body=(green|orange|dark|white)&~ndi.binary_dilation(blue,iterations=4)
    use_src=ref_a&src_a&body
    rgb=ref_rgb.copy(); rgb[use_src]=src[use_src].astype(np.uint8)
    alpha=ref_a
    # feather/keep main comp
    alpha=ndi.binary_closing(alpha,np.ones((5,5),bool)); alpha=ndi.binary_fill_holes(alpha)
    lab,n=ndi.label(alpha,np.ones((3,3),bool)); sizes=ndi.sum(alpha,lab,range(1,n+1));
    if n: alpha=lab==(int(np.argmax(sizes))+1)
    ys2,xs2=np.where(alpha); bx0,bx1,by0,by1=xs2.min(),xs2.max(),ys2.min(),ys2.max()
    af=ndi.gaussian_filter(alpha.astype(np.float32),0.5); af[~ndi.binary_dilation(alpha,iterations=1)]=0
    rgba=np.dstack([rgb,np.where((af*255)>127,255,0).astype(np.uint8)])[by0:by1+1,bx0:bx1+1]
    im=Image.fromarray(rgba,'RGBA'); chk=Image.new('RGBA',im.size,(255,255,255,255)); d=ImageDraw.Draw(chk)
    for y in range(0,im.height,32):
        for x in range(0,im.width,32):
            if (x//32+y//32)%2: d.rectangle([x,y,x+31,y+31],fill=(200,200,200,255))
    compo=chk.copy(); compo.alpha_composite(im); compo.convert('RGB').save(rf"W:\.gd\_video_work\refguide_{k}.png")
    print(k,im.size)
