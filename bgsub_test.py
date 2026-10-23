from PIL import Image, ImageDraw
import numpy as np
from scipy import ndimage as ndi
bg=np.array(Image.open(r"W:\.gd\_video_work\bg_plate.png").convert('RGB')).astype(np.int16)
for k in [100,524,540,593,168,120]:
    a=np.array(Image.open(rf"W:\.gd\_video_work\frames_full\frame_{k:04d}.png").convert('RGB').resize((1920,1080),Image.LANCZOS)).astype(np.int16)
    diff=np.max(np.abs(a-bg),axis=2)
    for th in [8,12,18]:
        m=diff>th
        roi=np.zeros_like(m); roi[150:1080,430:1480]=True; m&=roi
        m=ndi.binary_opening(m,np.ones((3,3),bool)); m=ndi.binary_closing(m,np.ones((9,9),bool))
        lab,n=ndi.label(m,np.ones((3,3),bool)); sizes=ndi.sum(m,lab,range(1,n+1))
        if n:
            # choose component with largest area in central region
            idx=int(np.argmax(sizes))+1; m=lab==idx
        m=ndi.binary_fill_holes(m)
        rgba=np.dstack([a.astype(np.uint8),np.where(m,255,0).astype(np.uint8)])
        im=Image.fromarray(rgba,'RGBA'); chk=Image.new('RGBA',im.size,(255,255,255,255)); d=ImageDraw.Draw(chk)
        for y in range(0,im.height,32):
            for x in range(0,im.width,32):
                if (x//32+y//32)%2: d.rectangle([x,y,x+31,y+31],fill=(200,200,200,255))
        compo=chk.copy(); compo.alpha_composite(im); compo.convert('RGB').save(rf"W:\.gd\_video_work\bgsub_{k}_{th}.png")
    print('done',k)
