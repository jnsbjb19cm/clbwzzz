from pathlib import Path
import json, zipfile
out=Path(r"W:\.gd\玉米炮手_精灵图集_最终版")
readme='''玉米炮手 精灵图集（透明 PNG）
生成时间：2026-10-22

文件：
- 玉米炮手_攻击_精灵图集_透明.png：84 帧，10列 x 9行，单元 640x640，60fps，包含完整发射动作与玉米炮弹
- 玉米炮手_待机_精灵图集_透明.png：120 帧，10列 x 12行，单元 640x640，60fps，可循环
- 逐帧PNG/：每帧单独透明 PNG，统一 640x640 画布，底部中心锚点
- 预览/：透明 APNG、棋盘 GIF、逐帧索引图
- 玉米炮手_精灵图集_配置.json：帧序号、源帧、尺寸、行列、锚点、循环信息

攻击图集：
完整保留 1.60-3.00s 的 84 帧攻击动作：蓄力/瞄准 -> 玉米炮弹出现 -> 飞过主体 -> 离开画面。
同时保留完整玉米炮手主体（玉米棒、两片高叶、脚下三片叶、眼睛）和飞行中的玉米炮弹。

待机图集：
只保留玉米炮手主体，去除背景、底座/水花和场景杂物；取 7.90-9.90s 的完整左右摇摆周期（120帧）。

说明：原片 0-1.60s 为编辑器选择框/空白/青色残影，不属于角色完整攻击段，因此未纳入。
'''
(out/"使用说明.txt").write_text(readme,encoding='utf-8-sig')
p=out/"玉米炮手_精灵图集_配置.json"; d=json.loads(p.read_text(encoding='utf-8'))
d['attack']['includes_projectile']=True
d['attack']['projectile_description']='蓝色玉米炮弹'
d['attack']['notes']='完整攻击：1.60-3.00s 84帧，包含主体、蓄力/瞄准、玉米炮弹发射和飞行。'
d['idle']['notes']='只保留玉米炮手主体：脚下三片玉米叶、身上两片高叶、完整玉米棒、眼睛。'
p.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf-8')
z=Path(r"W:\.gd\玉米炮手_精灵图集_最终版.zip")
with zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as zz:
    for f in out.rglob('*'):
        if f.is_file(): zz.write(f,f.relative_to(out.parent))
print('zip',z.stat().st_size)
