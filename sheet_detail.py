from PIL import Image, ImageDraw
from pathlib import Path
files=sorted(Path(r"W:\.gd\_video_work\frames_full").glob("frame_*.png"))
for start,end in [(60,120),(120,180),(474,594)]:
    sel=[files[i] for i in range(start,end)]
    w,h=320,180; cols=10; rows=(len(sel)+cols-1)//cols
    sheet=Image.new('RGB',(cols*w,rows*(h+18)),(245,245,245)); d=ImageDraw.Draw(sheet)
    for k,f in enumerate(sel):
        im=Image.open(f).convert('RGB').resize((w,h),Image.LANCZOS)
        x=(k%cols)*w; y=(k//cols)*(h+18); sheet.paste(im,(x,y)); d.text((x+3,y+h+1),f.stem.replace('frame_',''),fill=(0,0,0))
    out=rf"W:\.gd\_video_work\sheet_detail_{start}_{end}.png"; sheet.save(out); print(out,sheet.size)
