from pathlib import Path
import json
out=Path(r"W:\.gd\玉米炮手_精灵图集_最终版")
readme='''玉米炮手 精灵图集（透明 PNG，完整性修正版）

文件：
- 玉米炮手_攻击_精灵图集_透明.png：60 帧，10列 x 6行，单元 640x640，60fps
- 玉米炮手_待机_精灵图集_透明.png：120 帧，10列 x 12行，单元 640x640，60fps，可循环
- 逐帧PNG/：每帧单独透明 PNG，统一 640x640 画布，底部中心锚点
- 预览/：透明 APNG、棋盘 GIF、逐帧索引图
- 玉米炮手_精灵图集_配置.json：帧序号、源帧、尺寸、行列、锚点、循环信息

抠图范围：
保留完整主体：脚下三片玉米叶、身上两片高叶、完整玉米棒（含叶间下沿）、眼睛。
去除背景、青绿色底座/水花、炮弹及场景杂物。

完整性处理：
- 玉米棒不采用简单色块裁切，使用两片高叶之间的叶间区域补齐下沿，避免出现悬空/缺半截。
- 攻击段 2.70-3.00s 中炮弹牵引线遮挡主体的帧，按提供的标准静态图按主体锚点重建透明帧，保证玉米棒和上方叶子完整。
- 待机取 7.90-9.90s 的完整左右摇摆周期（120帧）。
'''
(out/"使用说明.txt").write_text(readme,encoding='utf-8-sig')
p=out/"玉米炮手_精灵图集_配置.json"
data=json.loads(p.read_text(encoding='utf-8'))
data["attack"]["reconstruction_note"]="2.70-3.00s 受炮弹/牵引线遮挡的帧，按给定标准静态图和主体锚点重建透明帧，保证玉米棒和上方叶子完整。"
data["attack"]["completeness"]="玉米棒及其叶间下沿完整保留；不裁掉两片高叶。"
data["idle"]["completeness"]="玉米棒及其叶间下沿完整保留；不裁掉两片高叶。"
p.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
print('patched')
