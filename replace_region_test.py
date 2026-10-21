# Build on ref_repair_test functions by importing it up to the test loop via exec of file until 'for name,refs'
src=open(r"D:\.丛林\battle\ref_repair_test.py",encoding='utf-8-sig').read()
idx=src.index("for name,refs in")
exec(src[:idx])

def replace_region(target, ref, out):
    a,rgb,alpha,bbox,gate=seg_frame(target); H,W=alpha.shape
    ra,rrgb,ralpha,rbbox,rgate=seg_frame(ref)
    tx0,ty0,tx1,ty1,tcx,tcy=bbox; rx0,ry0,rx1,ry1,rcx,rcy=rbbox
    dx=int(round(tcx-rcx)); dy=int(round(tcy-rcy))
    sh_a=np.zeros_like(ralpha); sh_r=np.zeros_like(rrgb)
    sy0=max(0,dy); sy1=min(H,H+dy); sx0=max(0,dx); sx1=min(W,W+dx)
    sh_a[sy0:sy1,sx0:sx1]=ralpha[sy0-dy:sy1-dy,sx0-dx:sx1-dx]
    sh_r[sy0:sy1,sx0:sx1]=rrgb[sy0-dy:sy1-dy,sx0-dx:sx1-dx]
    R,G,B=a[...,0].astype(np.float32),a[...,1].astype(np.float32),a[...,2].astype(np.float32); V=a.max(2)/255.; S=(a.max(2)-a.min(2))/np.maximum(a.max(2),1)
    blue=(B>G*1.03)&(B>R*1.35)&(S>0.35)&(V>0.18)
    ball=ndi.binary_dilation(blue,iterations=45)
    # soft weights for blending
    soft=ndi.gaussian_filter(ball.astype(np.float32),sigma=12)
    soft=np.clip((soft-0.15)/0.7,0,1)[...,None]
    alpha_f=alpha.astype(np.float32)/255.
    ref_alpha_f=sh_a.astype(np.float32)
    a_out=alpha_f*(1-soft[...,0])+ref_alpha_f*soft[...,0]
    rgb_f=rgb.astype(np.float32)*(1-soft)+sh_r.astype(np.float32)*soft
    alpha2=a_out>0.5
    rgb2=rgb_f.astype(np.uint8)
    alpha2=ndi.binary_closing(alpha2,np.ones((7,7),bool)); alpha2=fill_small_holes(alpha2,rgb2,30000)
    alab,an=ndi.label(alpha2,np.ones((3,3),bool)); seed=ndi.binary_dilation(alpha2,iterations=1); touched=np.unique(alab[seed]); touched=touched[touched>0]; keep=np.zeros_like(alpha2)
    for jj in touched: keep|=(alab==jj)
    alpha2=keep
    ys,xs=np.where(alpha2); bx0,bx1=max(0,xs.min()-20),min(W,xs.max()+21); by0,by1=max(0,ys.min()-20),min(H,ys.max()+21)
    rgba_full=np.dstack([rgb2,np.where(alpha2,255,0).astype(np.uint8)]); rgba=rgba_full[by0:by1,bx0:bx1]; crop=Image.fromarray(rgba,'RGBA'); crop.save(out.replace('.png','_rgba.png'))
    chk=Image.new('RGBA',crop.size,(255,255,255,255)); d=ImageDraw.Draw(chk)
    for y in range(0,crop.size[1],32):
        for x in range(0,crop.size[0],32):
            if (x//32+y//32)%2: d.rectangle([x,y,x+31,y+31],fill=(210,210,210,255))
    compo=chk.copy(); compo.alpha_composite(crop); compo.save(out)
    print(Path(target).name,'crop',crop.size,'dxdy',dx,dy)

replace_region(r"W:\.gd\_video_work\frames_full\frame_0158.png",r"W:\.gd\_video_work\frames_full\frame_0178.png",r"W:\.gd\_video_work\segreplace_f0158_checker.png")
replace_region(r"W:\.gd\_video_work\frames_full\frame_0148.png",r"W:\.gd\_video_work\frames_full\frame_0178.png",r"W:\.gd\_video_work\segreplace_f0148_checker.png")
replace_region(r"W:\.gd\_video_work\frames_full\frame_0148.png",r"W:\.gd\_video_work\frames_full\frame_0128.png",r"W:\.gd\_video_work\segreplace128_f0148_checker.png")

