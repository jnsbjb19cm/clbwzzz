from PIL import Image, ImageDraw
from pathlib import Path
files=sorted(Path(r"W:\.gd\_video_work\samples").glob("sample_*.png"), key=lambda p:float(p.stem.split('_')[1]+'.'+p.stem.split('_')[2]))
w,h=480,270
cols=5; rows=(len(files)+cols-1)//cols
sheet=Image.new('RGB',(cols*w,rows*(h+24)),(25,25,25))
d=ImageDraw.Draw(sheet)
for i,f in enumerate(files):
    im=Image.open(f).convert('RGB').resize((w,h),Image.LANCZOS)
    x=(i%cols)*w; y=(i//cols)*(h+24)
    sheet.paste(im,(x,y))
    d.text((x+5,y+h+3),f.stem,fill='white')
sheet.save(r"W:\.gd\_video_work\samples_contact.png")
print(sheet.size,len(files))
