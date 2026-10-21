p=r"D:\.丛林\battle\segment_v8.py"
s=open(p,encoding='utf-8').read()
s=s.replace("gate &= ~((rx>0.56)&(ry>boundary)); gate &= ~((rx>0.48)&(ry>0.94)); gate &= ~((rx<0.14)&(ry>0.88))", "gate &= ~((rx>0.56)&(ry>boundary)); gate &= ~((rx>0.48)&(ry>0.94)); gate &= ~((rx<0.14)&(ry>0.88))\n    # bottom slime beyond the three foot leaves\n    gate &= ~((ry>0.90)&(rx<0.16))\n    gate &= ~((ry>0.95)&(rx>0.50))")
s=s.replace("for name in ['f0120','f0480','f0540','f0593']:", "for name in ['f0060','f0120','f0480','f0540','f0593']:")
open(p,'w',encoding='utf-8').write(s)
print('patched')
