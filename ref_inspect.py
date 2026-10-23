from PIL import Image
import numpy as np
p=r"C:\Users\佰震\.dsh\attachments\v1\objects\31\31663aeba906f1a19a3e59c0b569c0c9bf909193c2964cd86a58d4c61e9eed81"
im=Image.open(p); print(im.mode,im.size,im.getextrema())
a=np.array(im.convert('RGBA')); print('alpha minmax',a[...,3].min(),a[...,3].max(),'zero%',(a[...,3]==0).mean())
# background pixel corners
print('corners',a[0,0],a[0,-1],a[-1,0],a[-1,-1])
