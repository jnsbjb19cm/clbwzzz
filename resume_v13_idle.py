from PIL import Image
from pathlib import Path
import json,time
src=open(r"D:\.丛林\battle\build_v11.py",encoding='utf-8-sig').read(); idx=src.index("\nfrom pathlib import Path\nimport json,time\nSRC="); exec(src[:idx])
SRC=Path(r"W:\.gd\_video_work\frames_full"); OUT=Path(r"W:\.gd\_video_work\cutouts_v13\idle"); OUT.mkdir(parents=True,exist_ok=True)
recs=[]; t0=time.time()
for i,k in enumerate(range(474,594)):
    rgba,bbox,gap,cobtop=segment_and_save(SRC/f"frame_{k:04d}.png")
    Image.fromarray(rgba,'RGBA').save(OUT/f"frame_{k:04d}.png",compress_level=3)
    recs.append({'source_frame':k,'source_time':round(k/60,4),'crop_box':list(bbox),'width':rgba.shape[1],'height':rgba.shape[0],'alpha_pixels':int((rgba[...,3]>127).sum())})
    if i%10==0: print('idle',i,'/',120,'frame',k,'elapsed',round(time.time()-t0,1),flush=True)
(OUT/'frames.json').write_text(json.dumps(recs,ensure_ascii=False,indent=2),encoding='utf-8')
print('DONE',len(recs),round(time.time()-t0,1))
