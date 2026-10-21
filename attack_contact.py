from PIL import Image, ImageDraw
from pathlib import Path
files=sorted(Path(r"W:\.gd\_video_work\samples2").glob("f*.png"))
w,h=480,270
cols=4; rows=(len(files)+cols-1)//cols
sheet=Image.new('RGB',(cols*w,rows*(h+20)),(20,20,20)); d=ImageDraw.Draw(sheet)
for i,f in enumerate(files):
    im=Image.open(f).convert('RGB').resize((w,h),Image.LANCZOS)
    x=(i%cols)*w; y=(i//cols)*(h+20); sheet.paste(im,(x,y)); d.text((x+4,y+h+2),f.stem,fill='white')
sheet.save(r"W:\.gd\_video_work\attack_contact.png"); print(sheet.size,len(files))
