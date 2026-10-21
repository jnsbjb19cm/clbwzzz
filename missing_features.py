from PIL import Image
import numpy as np
from pathlib import Path
import json
for anim,rootcut in [('attack',r"W:\.gd\_video_work\cutouts_half\attack"),('idle',r"W:\.gd\_video_work\cutouts_half_fix\idle")]:
    cut=Path(rootcut); recs=json.loads((cut/'frames.json').read_text(encoding='utf-8'))
    print('\n===',anim)
    worst=[]
    for r in recs:
        k=r['source_frame']
        src=np.array(Image.open(rf"W:\.gd\_video_work\frames_full\frame_{k:04d}.png").convert('RGB').resize((1920,1080),Image.LANCZOS)).astype(np.float32)
        R,G,B=src[...,0],src[...,1],src[...,2]
        crop=Image.open(cut/f"frame_{k:04d}.png").convert('RGBA')
        a=np.zeros((1080,1920),np.uint8)
        x0,y0,x1,y1=r['crop_box']; a[y0:y1+1,x0:x1+1]=np.array(crop.getchannel('A'))
        alpha=a>127
        # region around character bbox
        bx0,by0,bx1,by1=max(0,x0-30),max(0,y0-30),min(1919,x1+30),min(1079,y1+30)
        roi=np.zeros_like(alpha); roi[by0:by1+1,bx0:bx1+1]=True
        orange=(R>G*1.35)&(G>B*1.30)&(R>145)&roi
        green=(G>R*1.02)&(G>B*1.35)&(R>0.70*G)&roi
        miss_o=int((orange&~alpha).sum()); tot_o=int(orange.sum())
        miss_g=int((green&~alpha).sum()); tot_g=int(green.sum())
        ratio_o=miss_o/max(tot_o,1); ratio_g=miss_g/max(tot_g,1)
        worst.append((ratio_o,miss_o,tot_o,ratio_g,miss_g,tot_g,k))
    for row in sorted(worst,reverse=True)[:20]:
        print(f"src{row[6]:4d} orange_miss={row[1]:6d}/{row[2]:6d} ({row[0]*100:5.1f}%) green_miss={row[4]:6d}/{row[5]:6d} ({row[3]*100:5.1f}%)")
