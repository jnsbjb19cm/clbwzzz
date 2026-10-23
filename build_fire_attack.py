from PIL import Image
import numpy as np, json, time
from pathlib import Path
from scipy import ndimage as ndi
src=open(r"D:\.丛林\battle\build_v11.py",encoding='utf-8-sig').read(); idx=src.index("\nfrom pathlib import Path\nimport json,time\nSRC="); exec(src[:idx])
SRC=Path(r"W:\.gd\_video_work\frames_full"); OUT=Path(r"W:\.gd\_video_work\cutouts_fire\attack"); OUT.mkdir(parents=True,exist_ok=True)
recs=[]; t0=time.time()
for i,k in enumerate(range(120,180)):
    rgba,bbox,gap,cobtop=segment_and_save(SRC/f"frame_{k:04d}.png")
    char=Image.fromarray(rgba,'RGBA')
    x0,y0,x1,y1=bbox
    # full canvas
    full=Image.new('RGBA',(1920,1080),(0,0,0,0)); full.alpha_composite(char,(x0,y0))
    src_img=np.array(Image.open(SRC/f"frame_{k:04d}.png").convert('RGB').resize((1920,1080),Image.LANCZOS)).astype(np.uint8) if False else np.array(Image.open(SRC/f"frame_{k:04d}.png").convert('RGB').resize((1920,1080),Image.LANCZOS))
    R,G,B=src_img[...,0].astype(np.float32),src_img[...,1].astype(np.float32),src_img[...,2].astype(np.float32); V=src_img.max(2)/255.; S=(src_img.max(2)-src_img.min(2))/np.maximum(src_img.max(2),1)
    blue=(B>G*1.03)&(B>R*1.35)&(S>0.35)&(V>0.18)
    lab,n=ndi.label(blue,np.ones((3,3),bool)); ball=None
    if n:
        sizes=ndi.sum(blue,lab,range(1,n+1)); j=int(np.argmax(sizes))+1
        if sizes[j-1]>=50:
            ball=ndi.binary_dilation(lab==j,iterations=4)
    arr=np.array(full)
    if ball is not None and ball.any():
        arr[ball,:3]=src_img[ball]; arr[ball,3]=255
    full=Image.fromarray(arr,'RGBA')
    # crop union bbox
    ys,xs=np.where(arr[...,3]>0)
    bx0,bx1,by0,by1=max(0,xs.min()-20),min(1919,xs.max()+21),max(0,ys.min()-20),min(1079,ys.max()+21)
    crop=full.crop((bx0,by0,bx1,by1)); crop.save(OUT/f"frame_{k:04d}.png",compress_level=6)
    recs.append({'source_frame':k,'source_time':round(k/60,4),'crop_box':[int(bx0),int(by0),int(bx1-1),int(by1-1)],'width':crop.width,'height':crop.height,'alpha_pixels':int((arr[...,3]>127).sum()),'projectile':bool(ball is not None and ball.any())})
    if i%10==0: print('fire',i,'frame',k,'elapsed',round(time.time()-t0,1),'ball',recs[-1]['projectile'],flush=True)
(OUT/'frames.json').write_text(json.dumps(recs,ensure_ascii=False,indent=2),encoding='utf-8')
print('DONE',len(recs),round(time.time()-t0,1))
