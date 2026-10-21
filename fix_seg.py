p=r"D:\.丛林\battle\segment_v8.py"
s=open(p,encoding='utf-8').read()
old="    rgb=ori_rgb[by0:by1,bx0:bx1]; rgba=np.dstack([rgb,np.where(alpha,255,0).astype(np.uint8)])[by0:by1,bx0:bx1]\n    crop=Image.fromarray(rgba,'RGBA')"
new="    rgba_full=np.dstack([ori_rgb,np.where(alpha,255,0).astype(np.uint8)])\n    rgba=rgba_full[by0:by1,bx0:bx1]\n    crop=Image.fromarray(rgba,'RGBA')"
assert old in s
open(p,'w',encoding='utf-8').write(s.replace(old,new))
print('fixed')
