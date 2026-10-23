from PIL import Image
import numpy as np, json, time
from pathlib import Path
from scipy import ndimage as ndi
src_code=open(r"D:\.丛林\battle\build_v11.py",encoding='utf-8-sig').read(); idx=src_code.index("\nfrom pathlib import Path\nimport json,time\nSRC="); exec(src_code[:idx])
SRC=Path(r"W:\.gd\_video_work\frames_full"); OUT=Path(r"W:\.gd\_video_work\cutouts_attack_68\attack"); OUT.mkdir(parents=True,exist_ok=True)
recs=[]; t0=time.time()
for i,k in enumerate(range(360,480)):
    rgba,bbox,gap,cobtop=segment_and_save(SRC/f"frame_{k:04d}.png")
    x0,y0,x1,y1=bbox; full=np.zeros((1080,1920,4),np.uint8); full[y0:y1+1,x0:x1+1]=rgba
    src=np.array(Image.open(SRC/f"frame_{k:04d}.png").convert('RGB').resize((1920,1080),Image.LANCZOS))
    R,G,B=src[...,0].astype(np.float32),src[...,1].astype(np.float32),src[...,2].astype(np.float32); V=src.max(2)/255.; S=(src.max(2)-src.min(2))/np.maximum(src.max(2),1)
    blue=(B>G*1.03)&(B>R*1.35)&(S>0.35)&(V>0.18)
    lab,n=ndi.label(blue,np.ones((3,3),bool)); ball=None
    if n:
        sizes=ndi.sum(blue,lab,range(1,n+1)); j=int(np.argmax(sizes))+1
        if sizes[j-1]>=50:
            core=lab==j; yy,xx=np.where(core); col=src[yy,xx].mean(axis=0).astype(np.uint8)
            ball=ndi.binary_dilation(core,iterations=12)
            add=ball&(full[...,3]==0); full[add,3]=255; full[add,:3]=col
            full[core,:3]=src[core]
    alpha=full[...,3]>0
    afloat=ndi.gaussian_filter(alpha.astype(np.float32),0.4); afloat[~ndi.binary_dilation(alpha,iterations=1)]=0
    full[...,3]=(np.clip(afloat,0,1)*255).astype(np.uint8)
    ys,xs=np.where(alpha); bx0,bx1,by0,by1=max(0,xs.min()-20),min(1919,xs.max()+21),max(0,ys.min()-20),min(1079,ys.max()+21)
    crop=Image.fromarray(full[by0:by1+1,bx0:bx1+1],'RGBA'); crop.save(OUT/f"frame_{k:04d}.png",compress_level=6)
    recs.append({'source_frame':k,'source_time':round(k/60,4),'crop_box':[int(bx0),int(by0),int(bx1-1),int(by1-1)],'width':crop.width,'height':crop.height,'alpha_pixels':int(alpha.sum()),'projectile':bool(ball is not None)})
    if i%20==0: print('frame',k,'elapsed',round(time.time()-t0,1),flush=True)
(OUT/'frames.json').write_text(json.dumps(recs,ensure_ascii=False,indent=2),encoding='utf-8')
print('DONE',len(recs),round(time.time()-t0,1))
