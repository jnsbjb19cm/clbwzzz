from PIL import Image
import numpy as np
from pathlib import Path
root=Path(r"W:\.gd\_video_work\frames_full")
sel=[root/f"frame_{k:04d}.png" for k in range(12,36)]
arr=np.stack([np.array(Image.open(p).convert('RGB').resize((1920,1080),Image.LANCZOS)).astype(np.float32) for p in sel],0)
bg=np.median(arr,axis=0).astype(np.uint8)
Image.fromarray(bg).save(r"W:\.gd\_video_work\bg_plate.png")
print('done',len(sel),bg.shape)
