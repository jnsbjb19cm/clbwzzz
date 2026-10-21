from PIL import Image, ImageDraw
from pathlib import Path
for anim in ['idle']:
    root=Path(rf"W:\.gd\_video_work\cutouts_half\{anim}")
    files=sorted(root.glob("frame_*.png"))
    cell=240; cols=10; rows=(len(files)+cols-1)//cols
    sheet=Image.new('RGBA',(cols*cell,rows*(cell+18)),(30,30,30,255))
    d=ImageDraw.Draw(sheet)
    for y in range(0,sheet.height,32):
        for x in range(0,sheet.width,32):
            if (x//32+y//32)%2: d.rectangle([x,y,x+31,y+31],fill=(210,210,210,255))
    for i,f in enumerate(files):
        im=Image.open(f).convert('RGBA'); im.thumbnail((cell-8,cell-8),Image.LANCZOS)
        x=(i%cols)*cell+(cell-im.width)//2; y=(i//cols)*(cell+18)+(cell-im.height)//2
        sheet.alpha_composite(im,(x,y)); d.text(((i%cols)*cell+4,(i//cols)*(cell+18)+cell+2),f.stem.replace('frame_',''),fill=(0,0,0,255))
    out=rf"W:\.gd\_video_work\{anim}_cutouts_contact.png"; sheet.convert('RGB').save(out); print(out,sheet.size,len(files))
