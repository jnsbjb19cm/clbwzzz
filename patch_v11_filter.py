p=r"D:\.丛林\battle\build_v11.py"
s=open(p,encoding='utf-8-sig').read()
old="""    alpha=core|eyemask|okeep|gap_lower
    alpha=ndi.binary_closing(alpha,np.ones((5,5),bool)); alpha=fill_small_holes(alpha,rgb,7500)"""
new="""    alpha=core|eyemask|okeep|gap_lower
    # remove dark projectile outline/tendrils near the blue projectile
    blue_strict=(B>G*1.03)&(B>R*1.35)&(S>0.35)&(V>0.18)
    if blue_strict.any():
        zone=ndi.binary_dilation(blue_strict,iterations=45)
        darkline=zone&(V<0.38)
        alpha &= ~darkline
    alpha=ndi.binary_closing(alpha,np.ones((5,5),bool)); alpha=fill_small_holes(alpha,rgb,7500)"""
assert old in s
s=s.replace(old,new)
open(p,'w',encoding='utf-8').write(s)
print('patched projectile filter')
