p=r"D:\.丛林\battle/compose_final.py"
s=open(p,encoding='utf-8-sig').read()
s=s.replace('d=WORK/"cutouts_v13_refrepair"/anim','d=WORK/("cutouts_fire3/attack" if anim=="attack" else "cutouts_v13/idle")')
# update readme block if present
old='''攻击来源：1.60-3.00s 中主体无遮挡的帧；其中 2.70-3.00s 炮弹牵引线遮挡区域按给定标准图按主体锚点重建为完整透明帧。'''
new='''攻击来源：2.00-3.00s 的 60 帧完整发射动作，包含玉米炮弹（蓝色炮弹）从出现、飞过主体到离开的完整过程。'''
s=s.replace(old,new)
old2='''攻击来源：1.60-3.00s 中主体无遮挡的帧（原片 0-1.60s 是编辑器/空白/残影，2.30-2.70s 炮弹遮挡主体，均未纳入）。'''
s=s.replace(old2,new)
# metadata note replace strings
s=s.replace('"仅保留主体：脚下三片玉米叶、身上两片高叶、玉米果实、眼睛；去除背景、青绿色底座/水花、炮弹和场景杂物。"','"攻击图集保留主体与玉米炮弹；待机图集仅保留主体。去除背景、底座/水花和场景杂物。"')
open(p,'w',encoding='utf-8').write(s)
print('patched compose fire')
