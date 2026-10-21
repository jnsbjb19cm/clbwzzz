from PIL import Image, ImageDraw
from pathlib import Path
root=Path(r"W:\.gd\_video_work\frames_full")
files=sorted(root.glob("frame_*.png"))
for start,end in [(0,60),(60,120),(120,180)]:
    sel=[files[i] for i in range(start,min(end,len(files)),2)]
    w,h=384,216; cols=8; rows=(len(sel)+cols-1)//cols
    sheet=Image.new('RGB',(cols*w,rows*(h+20)),(245,245,245)); d=ImageDraw.Draw(sheet)
    for k,f in enumerate(sel):
        im=Image.open(f).convert('RGB').resize((w,h),Image.LANCZOS)
        x=(k%cols)*w; y=(k//cols)*(h+20); sheet.paste(im,(x,y)); d.text((x+3,y+h+2),f.stem.replace('frame_',''),fill=(0,0,0))
    out=rf"W:\.gd\_video_work\sheet_attack_{start}_{end}.png"; sheet.save(out); print(out,sheet.size)
