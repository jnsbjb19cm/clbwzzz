from PIL import Image
import numpy as np
p=r"C:\Users\佰震\.dsh\attachments\v1\objects\31\31663aeba906f1a19a3e59c0b569c0c9bf909193c2964cd86a58d4c61e9eed81"
a=np.array(Image.open(p).convert('RGBA'))
ys,xs=np.where(a[...,3]>16); print('bbox',xs.min(),ys.min(),xs.max(),ys.max(),'size',xs.max()-xs.min()+1,ys.max()-ys.min()+1)
# crop and save ref cutout
Image.fromarray(a).save(r"W:\.gd\_video_work\reference_cutout.png")
