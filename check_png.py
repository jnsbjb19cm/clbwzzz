from PIL import Image
from pathlib import Path
import numpy as np
for f in sorted(Path(r"W:\.gd\_video_work\samples2").glob("f*.png")):
    im=Image.open(f)
    a=np.array(im)
    print(f.name, im.size, im.mode, a.shape, 'rgbminmax', (a[...,:3].min(),a[...,:3].max()), 'alpha', (a[...,3].min(),a[...,3].max()) if a.shape[2]==4 else None, 'mean', a[...,:3].mean())
