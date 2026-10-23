from PIL import Image
import numpy as np
from pathlib import Path
root=Path(r"W:\.gd\_video_work\frames_full")
ref=np.array(Image.open(root/'frame_0474.png').convert('RGB').resize((480,270),Image.LANCZOS)).astype(np.float32)
for k in range(575,600):
 im=np.array(Image.open(root/f'frame_{k:04d}.png').convert('RGB').resize((480,270),Image.LANCZOS)).astype(np.float32)
 # central ROI only
 d=np.abs(im[40:250,120:360]-ref[40:250,120:360]).mean()
 print(k,round(float(d),2))
