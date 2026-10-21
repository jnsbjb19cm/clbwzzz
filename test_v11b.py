from PIL import Image, ImageDraw
from pathlib import Path
src=open(r"D:\.丛林\battle\build_v11.py",encoding='utf-8-sig').read(); idx=src.index("\nfrom pathlib import Path\nimport json,time\nSRC="); exec(src[:idx])
for k in [168,100,524,540]:
    rgba,bbox,gap,cobtop=segment_and_save(rf"W:\.gd\_video_work\frames_full\frame_{k:04d}.png")
    im=Image.fromarray(rgba,'RGBA'); chk=Image.new('RGBA',im.size,(255,255,255,255)); d=ImageDraw.Draw(chk)
    for y in range(0,im.height,32):
        for x in range(0,im.width,32):
            if (x//32+y//32)%2: d.rectangle([x,y,x+31,y+31],fill=(200,200,200,255))
    compo=chk.copy(); compo.alpha_composite(im); compo.convert('RGB').save(rf"W:\.gd\_video_work\v11b_{k}.png")
    print(k,im.size,gap)
