from PIL import Image
import numpy as np, colorsys
im=Image.open(r"W:\.gd\_video_work\samples2\f0180.png").convert('RGB'); a=np.array(im)
pts={
'body_left':(1500,1200),'body_right':(2100,1200),'body_center':(1800,1700),
'left_leaf':(1250,1900),'right_leaf':(2350,1700),'front_leaf':(1750,2050),
'puddle_a':(2300,1900),'puddle_b':(2350,2050),'puddle_c':(2500,1950),'puddle_d':(2200,2080),
'orange_hand':(2450,1500),'bg_top':(1800,600),'bg_right':(2700,1000)
}
for name,(x,y) in pts.items():
    r,g,b=map(int,a[y,x]); h,s,v=colorsys.rgb_to_hsv(r/255,g/255,b/255)
    print(name,(x,y),(r,g,b),'H',round(h*360,1),'S',round(s,2),'V',round(v,2))
