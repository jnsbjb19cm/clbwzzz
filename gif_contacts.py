from PIL import Image, ImageDraw
from pathlib import Path
files=[r"W:\.gd\玉米炮手_攻击_原视频精确预览.gif", r"W:\.gd\玉米炮手_待机_原视频精确预览.gif"]
for f in files:
    im=Image.open(f); n=im.n_frames; step=max(1,n//40)
    frames=[]
    for i in range(0,n,step):
        im.seek(i); frames.append((i,im.convert('RGBA').copy()))
    w,h=frames[0][1].size
    cols=8; rows=(len(frames)+cols-1)//cols
    out=Image.new('RGB',(cols*w,rows*(h+16)),(20,20,20)); d=ImageDraw.Draw(out)
    for k,(idx,fr) in enumerate(frames):
        x=(k%cols)*w; y=(k//cols)*(h+16); out.paste(fr,(x,y),fr); d.text((x+2,y+h+1),str(idx),fill='white')
    out.save(Path(f).with_name(Path(f).stem+'_contact.png'))
    print(f,n,len(frames),out.size)
