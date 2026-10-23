from PIL import Image, ImageDraw
import numpy as np, json, shutil
from scipy import ndimage as ndi
from pathlib import Path
WORK=Path(r"W:\.gd\_video_work"); SRC=WORK/"cutouts_fire"/"attack"; DST=WORK/"cutouts_fire2"/"attack"; DST.mkdir(parents=True,exist_ok=True)
bg=np.array(Image.open(WORK/'bg_plate.png').convert('RGB')).astype(np.int16)
recs=json.loads((SRC/'frames.json').read_text(encoding='utf-8')); outrecs=[]
for r in recs:
    k=r['source_frame']; x0,y0,x1,y1=r['crop_box']
    char=np.array(Image.open(SRC/f"frame_{k:04d}.png").convert('RGBA'))
    full=np.zeros((1080,1920,4),np.uint8); full[y0:y1+1,x0:x1+1]=char
    src=np.array(Image.open(WORK/'frames_full'/f"frame_{k:04d}.png").convert('RGB').resize((1920,1080),Image.LANCZOS)).astype(np.int16)
    diff=np.max(np.abs(src-bg),axis=2)
    fg=diff>8
    fg=ndi.binary_closing(fg,np.ones((3,3),bool))
    R,G,B=src[...,0].astype(np.float32),src[...,1].astype(np.float32),src[...,2].astype(np.float32); V=src.max(2)/255.; S=(src.max(2)-src.min(2))/np.maximum(src.max(2),1)
    blue=(B>G*1.03)&(B>R*1.35)&(S>0.35)&(V>0.18)
    lab,n=ndi.label(blue,np.ones((3,3),bool)); ball=None
    if n:
        sizes=ndi.sum(blue,lab,range(1,n+1)); j=int(np.argmax(sizes))+1
        if sizes[j-1]>=50: ball=ndi.binary_dilation(lab==j,iterations=12)&fg
    alpha=full[...,3]>0
    if ball is not None: alpha|=ball
    alpha=ndi.binary_fill_holes(alpha)
    # keep all significant comps? keep largest + ball connected if separate
    lab2,n2=ndi.label(alpha,np.ones((3,3),bool)); sizes2=ndi.sum(alpha,lab2,range(1,n2+1)); keep=np.zeros_like(alpha)
    if n2:
        mx=sizes2.max(); keep=np.zeros_like(alpha)
        for j in range(n2):
            if sizes2[j]>=max(1000,mx*0.02): keep|=(lab2==j+1)
    alpha=keep
    full[ball if ball is not None else np.zeros_like(alpha),:3]=src[ball if ball is not None else np.zeros_like(alpha)]
    afloat=ndi.gaussian_filter(alpha.astype(np.float32),0.5); afloat[~ndi.binary_dilation(alpha,iterations=1)]=0
    full[...,3]=(np.clip(afloat,0,1)*255).astype(np.uint8)
    ys,xs=np.where(alpha); bx0,bx1,by0,by1=max(0,xs.min()-20),min(1919,xs.max()+21),max(0,ys.min()-20),min(1079,ys.max()+21)
    crop=Image.fromarray(full[by0:by1+1,bx0:bx1+1],'RGBA'); crop.save(DST/f"frame_{k:04d}.png",compress_level=6)
    outrecs.append({'source_frame':k,'source_time':round(k/60,4),'crop_box':[int(bx0),int(by0),int(bx1-1),int(by1-1)],'width':crop.width,'height':crop.height,'alpha_pixels':int(alpha.sum()),'projectile':bool(ball is not None)})
    if len(outrecs)%10==0: print('done',len(outrecs),flush=True)
(DST/'frames.json').write_text(json.dumps(outrecs,ensure_ascii=False,indent=2),encoding='utf-8')
print('ALL',len(outrecs))
