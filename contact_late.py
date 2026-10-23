from PIL import Image, ImageDraw
from pathlib import Path
root=Path(r"W:\.gd\_video_work\frames_full")
for start,end,name in [(480,599,'late_480_599'),(600,735,'late_600_735'),(736,873,'late_736_873')]:
    ks=list(range(start,end+1,6)); cols=6; cw=260; ch=146; rows=(len(ks)+cols-1)//cols
    sheet=Image.new('RGB',(cols*cw,rows*(ch+18)),(255,255,255)); d=ImageDraw.Draw(sheet)
    for i,k in enumerate(ks):
        im=Image.open(root/f"frame_{k:04d}.png").convert('RGB'); im.thumbnail((cw,ch),Image.LANCZOS)
        x=(i%cols)*cw; y=(i//cols)*(ch+18); sheet.paste(im,(x,y)); d.text((x+3,y+ch+1),str(k),fill=(0,0,0))
    sheet.save(rf"W:\.gd\_video_work\contact_{name}.jpg",quality=92)
    print(name,sheet.size)
