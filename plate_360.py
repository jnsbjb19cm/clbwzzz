from PIL import Image
import numpy as np
from pathlib import Path
root=Path(r"W:\.gd\_video_work\frames_full")
arr=np.stack([np.array(Image.open(root/f"frame_{k:04d}.png").convert('RGB').resize((1920,1080),Image.LANCZOS)).astype(np.float32) for k in range(360,480)],0)
bg=np.median(arr,axis=0).astype(np.uint8)
Image.fromarray(bg).save(r"W:\.gd\_video_work\bg_plate_360_479.png")
print('done',bg.shape)
