p=r"D:\.丛林\battle\build_v11.py"
s=open(p,encoding='utf-8-sig').read()
old="""    for y in range(max(0,y0-20),int(y0+bh*0.60)):
        rr=[r for r in runs(g[y]) if r[1]-r[0]>=8]
        left=[r for r in rr if r[1]<central]; right=[r for r in rr if r[0]>central]
        if left and right:
            le=max(r[1] for r in left); rs=min(r[0] for r in right)
            if 20<=rs-le<=450: gap[y,max(0,le-3):min(W,rs+4)]=True
    gap=ndi.binary_closing(gap,np.ones((5,5),bool)); gap=ndi.binary_fill_holes(gap)
    if cob_top is not None:
        gap_lower=gap&(yy>=cob_top+int(bh*0.10))
    else:
        gap_lower=gap&(yy>=y0)"""
new="""    for y in range(max(0,y0-20),int(y0+bh*0.60)):
        rr=[r for r in runs(g[y]) if r[1]-r[0]>=8]
        left=[r for r in rr if r[1]<central]; right=[r for r in rr if r[0]>central]
        if left and right:
            le=max(r[1] for r in left); rs=min(r[0] for r in right)
            if 20<=rs-le<=450:
                L=max(0,le-3); R=min(W-1,rs+4)
                if cob_top is not None:
                    ts=cob_top+0.04*bh; tf=cob_top+0.30*bh
                    t=max(0.0,min(1.0,(y-ts)/max(1.0,tf-ts)))
                else:
                    t=max(0.0,min(1.0,(y-y0)/max(1.0,0.30*bh)))
                if t>0:
                    c=(L+R)/2; half=(R-L)/2*t; L=int(round(c-half)); R=int(round(c+half))
                    gap[y,L:R+1]=True
    gap=ndi.binary_closing(gap,np.ones((5,5),bool)); gap=ndi.binary_fill_holes(gap)
    gap_lower=gap&(yy>=y0-5)"""
assert old in s
s=s.replace(old,new)
open(p,'w',encoding='utf-8').write(s)
print('patched taper')
