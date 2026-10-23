from PIL import Image
import numpy as np, json, time
from pathlib import Path
src_code=open(r"D:\.丛林\battle\build_v11.py",encoding='utf-8-sig').read(); idx=src_code.index("\nfrom pathlib import Path\nimport json,time\nSRC="); exec(src_code[:idx])
SRC=Path(r"W:\.gd\_video_work\frames_full"); OUT=Path(r"W:\.gd\_video_work\idle_right_test\idle"); OUT.mkdir(parents=True,exist_ok=True)
recs=[]; t0=time.time()
for i,k in enumerate(range(600,660)):
    rgba,bbox,gap,cobtop=segment_and_save(SRC/f"frame_{k:04d}.png")
    x0,y0,x1,y1=bbox; im=Image.fromarray(rgba,'RGBA'); im.save(OUT/f"frame_{k:04d}.png",compress_level=6)
    recs.append({'source_frame':k,'crop_box':[int(x0),int(y0),int(x1),int(y1)]})
    if i%15==0: print(k,round(time.time()-t0,1),flush=True)
(OUT/'frames.json').write_text(json.dumps(recs,ensure_ascii=False,indent=2),encoding='utf-8')
print('done',len(recs),round(time.time()-t0,1))
