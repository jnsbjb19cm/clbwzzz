from PIL import Image, ImageDraw
import numpy as np, json
from scipy import ndimage as ndi
from pathlib import Path
ref=Image.open(r"W:\.gd\_video_work\reference_cutout.png").convert('RGBA')
ra=np.array(ref); ys,xs=np.where(ra[...,3]>16); rx0,ry0,rx1,ry1=xs.min(),ys.min(),xs.max(),ys.max(); refc=ref.crop((rx0,ry0,rx1+1,ry1+1))
for k,anim in [(100,'attack'),(524,'idle'),(540,'idle'),(168,'attack')]:
    recs=json.loads(Path(rf"W:\.gd\_video_work\cutouts_final2\{anim}\frames.json").read_text(encoding='utf-8'))
    r=[z for z in recs if z['source_frame']==k][0]; x0,y0,x1,y1=r['crop_box']; tw=x1-x0+1; th=y1-y0+1
    src_img=Image.open(rf"W:\.gd\_video_work\frames_full\frame_{k:04d}.png").convert('RGB').resize((1920,1080),Image.LANCZOS); src=np.array(src_img)
    cut=np.array(Image.open(rf"W:\.gd\_video_work\cutouts_final2\{anim}\frame_{k:04d}.png").convert('RGBA'))
    afull=np.zeros((1080,1920),bool); afull[y0:y1+1,x0:x1+1]=cut[...,3]>127
    rimg=refc.resize((tw,th),Image.LANCZOS); rarr=np.array(rimg)
    ralpha=np.zeros((1080,1920),bool); rrgb=np.zeros((1080,1920,3),np.uint8)
    ralpha[y0:y1+1,x0:x1+1]=rarr[...,3]>16; rrgb[y0:y1+1,x0:x1+1]=rarr[...,:3]
    yy,xx=np.mgrid[0:1080,0:1920]
    top=(yy>=y0)&(yy<y0+int(th*0.66))
    a2=afull | (ralpha&top)
    # rgb: source where source alpha, ref elsewhere
    rgb=src.copy(); add=(ralpha&top)&~afull; rgb[add]=rrgb[add]
    # remove dark string near blue for attack
    R,G,B=src[...,0].astype(np.float32),src[...,1].astype(np.float32),src[...,2].astype(np.float32); V=src.max(2)/255.; S=(src.max(2)-src.min(2))/np.maximum(src.max(2),1)
    blue=(B>G*1.03)&(B>R*1.35)&(S>0.35)&(V>0.18)
    if blue.any():
        # top region alpha replace with ref to kill string, then union
        a2[top]=ralpha[top]
        rgb[top&~ralpha]=0
        rgb[top&ralpha]=src[top&ralpha]
        # but some source background under ref? use ref for pixels not body-colored
        gsrc=(G>R*1.0)&(G>B*1.25); osrc=(R>G*1.08)&(R>B*1.2)
        use_ref=ralpha&top&~((gsrc|osrc)&((V<0.8)|(R>G*1.2)))
        rgb[use_ref]=rrgb[use_ref]
    # feather/keep main component
    a2=ndi.binary_closing(a2,np.ones((5,5),bool)); a2=ndi.binary_fill_holes(a2)
    lab,n=ndi.label(a2,np.ones((3,3),bool)); sizes=ndi.sum(a2,lab,range(1,n+1));
    if n: a2=lab==(int(np.argmax(sizes))+1)
    # crop
    ys2,xs2=np.where(a2); bx0,bx1,by0,by1=xs2.min(),xs2.max(),ys2.min(),ys2.max()
    af=a2.astype(np.float32); af=ndi.gaussian_filter(af,0.5); af[~ndi.binary_dilation(a2,iterations=1)]=0
    rgba=np.dstack([rgb,np.where(af>0.5,255,0).astype(np.uint8)])[by0:by1+1,bx0:bx1+1]
    im=Image.fromarray(rgba,'RGBA'); chk=Image.new('RGBA',im.size,(255,255,255,255)); d=ImageDraw.Draw(chk)
    for y in range(0,im.height,32):
        for x in range(0,im.width,32):
            if (x//32+y//32)%2: d.rectangle([x,y,x+31,y+31],fill=(200,200,200,255))
    compo=chk.copy(); compo.alpha_composite(im); compo.convert('RGB').save(rf"W:\.gd\_video_work\refunion_{k}.png")
    print(k,im.size)
