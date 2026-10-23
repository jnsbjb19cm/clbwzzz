from pathlib import Path
import json, zipfile
out=Path(r"W:\.gd\玉米炮手_精灵图集_最终版")
readme='''玉米炮手 精灵图集（透明 PNG）
生成时间：2026-10-22

文件：
- 玉米炮手_攻击_精灵图集_透明.png：60 帧，10列 x 6行，单元 640x640，60fps，包含发射出的玉米炮弹
- 玉米炮手_待机_精灵图集_透明.png：120 帧，10列 x 12行，单元 640x640，60fps，可循环
- 逐帧PNG/：每帧单独透明 PNG，统一 640x640 画布，底部中心锚点
- 预览/：透明 APNG、棋盘 GIF、逐帧索引图
- 玉米炮手_精灵图集_配置.json：帧序号、源帧、尺寸、行列、锚点、循环信息

抠图范围：
- 攻击图集：保留完整玉米炮手主体 + 发射出的玉米炮弹，去除背景、底座/水花和场景杂物。
- 待机图集：只保留玉米炮手主体（脚下三片玉米叶、身上两片高叶、完整玉米棒、眼睛），去除背景和场景杂物。

攻击来源：2.00-3.00s 的 60 帧发射动作（玉米炮弹从出现、飞过主体到离开）。
待机来源：7.90-9.90s 的完整左右摇摆周期（120帧）。
'''
(out/"使用说明.txt").write_text(readme,encoding='utf-8-sig')
p=out/"玉米炮手_精灵图集_配置.json"; data=json.loads(p.read_text(encoding='utf-8'))
data["attack"]["includes_projectile"]=True
data["attack"]["projectile_description"]="蓝色玉米炮弹"
data["attack"]["notes"]="攻击图集保留完整主体和发射出的玉米炮弹；待机图集仅保留主体。"
data["attack"].pop("reconstruction_note",None)
data["idle"]["notes"]="仅保留玉米炮手主体：脚下三片玉米叶、身上两片高叶、完整玉米棒、眼睛。"
p.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
z=Path(r"W:\.gd\玉米炮手_精灵图集_最终版.zip")
with zipfile.ZipFile(z,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as zz:
    for f in out.rglob('*'):
        if f.is_file(): zz.write(f,f.relative_to(out.parent))
print('zip',z.stat().st_size)
