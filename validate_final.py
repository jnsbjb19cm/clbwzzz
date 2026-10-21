from PIL import Image
from pathlib import Path
import json
out=Path(r"W:\.gd\玉米炮手_精灵图集_最终版")
for p in [out/"玉米炮手_攻击_精灵图集_透明.png",out/"玉米炮手_待机_精灵图集_透明.png"]:
    im=Image.open(p); print(p.name,im.format,im.size,im.mode,im.getextrema(), 'n_frames',getattr(im,'n_frames',1))
for p in [out/"预览"/"玉米炮手_攻击_透明动态预览.apng.png",out/"预览"/"玉米炮手_待机_透明动态预览.apng.png",out/"预览"/"玉米炮手_攻击_棋盘预览.gif",out/"预览"/"玉米炮手_待机_棋盘预览.gif"]:
    im=Image.open(p); print(p.name,im.format,im.size,im.mode,'frames',getattr(im,'n_frames',1),'duration',im.info.get('duration'),'loop',im.info.get('loop'))
# alpha stats on sheet corners and transparency
for p in [out/"玉米炮手_攻击_精灵图集_透明.png",out/"玉米炮手_待机_精灵图集_透明.png"]:
    im=Image.open(p).convert('RGBA'); a=im.getchannel('A'); import numpy as np; arr=np.array(a); print('alpha',p.name,'zero%',round((arr==0).mean()*100,2),'full%',round((arr==255).mean()*100,2),'semi',int(((arr>0)&(arr<255)).sum()))
# files
for p in sorted(out.rglob('*')):
    if p.is_file(): print(str(p.relative_to(out)),p.stat().st_size)
print('counts',len(list((out/'逐帧PNG').glob('*.png'))))
