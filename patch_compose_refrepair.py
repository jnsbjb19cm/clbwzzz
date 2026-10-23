p=r"D:\.丛林\battle/compose_final.py"
s=open(p,encoding='utf-8-sig').read()
s=s.replace('d=WORK/"cutouts_v13"/anim','d=WORK/"cutouts_v13_refrepair"/anim')
s=s.replace('攻击来源：1.60-3.00s 中主体无遮挡的帧（原片 0-1.60s 是编辑器/空白/残影，2.30-2.70s 炮弹遮挡主体，均未纳入）。','攻击来源：1.60-3.00s 中主体无遮挡的帧；其中 2.70-3.00s 炮弹牵引线遮挡区域按给定标准图按主体锚点重建为完整透明帧。')
open(p,'w',encoding='utf-8').write(s)
print('patched')
