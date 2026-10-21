p=r"D:\.丛林\battle\compose_final.py"
s=open(p,encoding='utf-8-sig').read()
s=s.replace("d=WORK/\"cutouts_half\"/anim", "d=(WORK/\"cutouts_half_fix\"/anim) if anim=='idle' else (WORK/\"cutouts_half\"/anim)")
open(p,'w',encoding='utf-8').write(s)
print('patched compose')
