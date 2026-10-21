from PIL import Image
import numpy as np, json, shutil
from scipy import ndimage as ndi
from pathlib import Path
WORK=Path(r"W:\.gd\_video_work")
SRC=WORK/"cutouts_v11"; DST=WORK/"cutouts_final"
if DST.exists(): shutil.rmtree(DST)
for anim in ['attack','idle']:
    (DST/anim).mkdir(parents=True,exist_ok=True)
    recs=json.loads((SRC/anim/'frames.json').read_text(encoding='utf-8'))
    for r in recs:
        k=r['source_frame']; srcp=SRC/anim/f"frame_{k:04d}.png"
        dstp=DST/anim/f"frame_{k:04d}.png"
        if anim=='attack' and 162<=k<=179:
            arr=np.array(Image.open(srcp).convert('RGBA')); rgb=arr[...,:3]; a=arr[...,3]
            x0,y0,x1,y1=r['crop_box']; H,W=1080,1920
            afull=np.zeros((H,W),bool); afull[y0:y1+1,x0:x1+1]=a>127
            src=np.array(Image.open(WORK/'frames_full'/f"frame_{k:04d}.png").convert('RGB').resize((W,H),Image.LANCZOS)).astype(np.float32)
            R,G,B=src[...,0],src[...,1],src[...,2]; V=src.max(2)/255.; S=(src.max(2)-src.min(2))/np.maximum(src.max(2),1)
            yy,xx=np.mgrid[0:H,0:W]; top_band=(yy>=y0)&(yy<y0+(y1-y0)*0.20)
            opened=ndi.binary_opening(afull,np.ones((21,21),bool))
            orange=(R>G*1.10)&(R>B*1.25)&(R>120)
            opened |= (afull & top_band & orange)
            afull=(afull & ~top_band)|(opened & top_band)
            blue=(B>G*1.03)&(B>R*1.35)&(S>0.35)&(V>0.18)
            if blue.any():
                near=ndi.binary_dilation(blue,iterations=60)
                thin=afull&~ndi.binary_opening(afull,np.ones((15,15),bool))
                afull &= ~(thin&near)
            # remove small isolated components
            lab,n=ndi.label(afull,np.ones((3,3),bool)); sizes=ndi.sum(afull,lab,range(1,n+1))
            if n:
                mx=float(sizes.max()); keep=np.zeros_like(afull)
                for j in range(n):
                    if sizes[j]>=max(2000.0,mx*0.02): keep|=(lab==j+1)
                afull=keep
            # feather
            af=ndi.gaussian_filter(afull.astype(np.float32),0.5); af[~ndi.binary_dilation(afull,iterations=1)]=0
            a2=(np.clip(af,0,1)[y0:y1+1,x0:x1+1]*255).astype(np.uint8)
            Image.fromarray(np.dstack([rgb,a2]),'RGBA').save(dstp,compress_level=6)
            print('patched',k)
        else:
            shutil.copy2(srcp,dstp)
    shutil.copy2(SRC/anim/'frames.json',DST/anim/'frames.json')
print('done')
