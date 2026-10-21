from PIL import Image
import numpy as np
p=r"W:\.gd\_video_work\samples2\f0120.png"
a=np.array(Image.open(p).convert('RGB')).astype(np.int16)
R,G,B=a[...,0],a[...,1],a[...,2]
green=(G>R*1.03)&(G>B*1.35)&(G>35)
orange=(R>G*1.12)&(G>B*1.5)&(R>150)
out=np.zeros_like(a)
out[green]=[0,255,0]; out[orange]=[255,128,0]
Image.fromarray(out.astype(np.uint8)).resize((1280,720)).save(r"W:\.gd\_video_work\mask_f0120.png")
# distinct hue scatter? show sat/value and sample body coords
print(a[1500,1800],a[700,1800],a[1800,1800],a[1200,2200])
