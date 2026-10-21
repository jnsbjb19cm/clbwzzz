from PIL import Image, ImageDraw, ImageFont
import numpy as np
p=r"W:\.gd\_video_work\samples2\f0180.png"
im=Image.open(p).convert('RGB')
# crop character ROI
x0,y0,x1,y1=1000,450,2800,2160
crop=im.crop((x0,y0,x1,y1))
d=ImageDraw.Draw(crop)
for x in range(0,crop.width,100):
    d.line([(x,0),(x,crop.height)],fill=(255,0,255),width=1); d.text((x+2,2),str(x+x0),fill=(255,0,255))
for y in range(0,crop.height,100):
    d.line([(0,y),(crop.width,y)],fill=(255,0,255),width=1); d.text((2,y+2),str(y+y0),fill=(255,0,255))
crop.resize((900,int(900*crop.height/crop.width)),Image.LANCZOS).save(r"W:\.gd\_video_work\grid_f0180.png")
# sample likely regions
a=np.array(im)
pts=[(1800,1500),(1800,1700),(1800,1900),(1800,2000),(1800,2080),(1500,2000),(2100,2000),(1300,1850),(2300,1850),(1700,1200),(1900,1200),(2000,80)]
for x,y in pts:
    print((x,y),a[y,x])
