p=r"D:\.丛林\battle/compose_final.py"
s=open(p,encoding='utf-8-sig').read()
s=s.replace('d=WORK/("cutouts_attack_complete/attack" if anim=="attack" else "cutouts_v13/idle")','d=WORK/("cutouts_attack_final/attack" if anim=="attack" else "cutouts_v13/idle")')
s=s.replace('攻击来源：1.00-3.00s 的 120 帧完整动作，包含角色完整出现、蓄力/瞄准、玉米炮弹发射、飞过主体并离开的全过程。','攻击来源：1.60-3.00s 的 84 帧完整攻击动作，包含蓄力/瞄准、玉米炮弹发射、飞过主体并离开的全过程。')
open(p,'w',encoding='utf-8').write(s)
print('patched')
