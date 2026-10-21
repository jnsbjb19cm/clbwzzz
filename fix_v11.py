p=r"D:\.丛林\battle\build_v11.py"
s=open(p,encoding='utf-8-sig').read()
old='''    # save checker crop
    ys,xs=np.where(alpha); bx0,bx1,by0,by1=xs.min(),xs.max(),ys.min(),ys.max(); rgba=np.dstack([rgb_clean,alpha_u])[by0:by1+1,bx0:bx1+1]
    imout=Image.fromarray(rgba,'RGBA'); chk=Image.new('RGBA',imout.size,(255,255,255,255)); d=ImageDraw.Draw(chk)
    for y in range(0,imout.height,32):
        for x in range(0,imout.width,32):
            if (x//32+y//32)%2: d.rectangle([x,y,x+31,y+31],fill=(200,200,200,255))
    compo=chk.copy(); compo.alpha_composite(imout); compo.convert('RGB').save(out)
    print(Path(p).name,'out',imout.size,'cob_top',cob_top,'gap',int(gap_lower.sum()))'''
new='''    ys,xs=np.where(alpha); bx0,bx1,by0,by1=xs.min(),xs.max(),ys.min(),ys.max(); rgba=np.dstack([rgb_clean,alpha_u])[by0:by1+1,bx0:bx1+1]
    return rgba,(int(bx0),int(by0),int(bx1),int(by1)),int(gap_lower.sum()),cob_top'''
assert old in s
s=s.replace(old,new)
open(p,'w',encoding='utf-8').write(s)
print('fixed')
