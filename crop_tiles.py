from PIL import Image
im=Image.open(r"W:\.gd\_video_work\attack_contact.png").convert('RGB')
w,h=480,270
for i in [0,1,2,3,4,5]:
    x=(i%4)*w; y=(i//4)*(h+20)
    im.crop((x,y,x+w,y+h)).save(fr"W:\.gd\_video_work\tile_{i}.png")
