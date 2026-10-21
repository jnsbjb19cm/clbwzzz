from PIL import Image
im=Image.open(r"W:\.gd\_video_work\attack_contact.png").convert('RGB')
w,h=480,270
for i in range(13):
    x=(i%4)*w; y=(i//4)*(h+20)
    crop=im.crop((x,y,x+w,y+h))
    print(i, crop.getextrema(), sum(crop.resize((1,1)).getpixel((0,0))))
