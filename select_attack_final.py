from pathlib import Path
import json, shutil
SRC=Path(r"W:\.gd\_video_work\cutouts_attack_complete\attack"); DST=Path(r"W:\.gd\_video_work\cutouts_attack_final\attack"); DST.mkdir(parents=True,exist_ok=True)
recs=json.loads((SRC/'frames.json').read_text(encoding='utf-8')); sel=[r for r in recs if 96<=r['source_frame']<=179]
for r in sel:
    shutil.copy2(SRC/f"frame_{r['source_frame']:04d}.png",DST/f"frame_{r['source_frame']:04d}.png")
(DST/'frames.json').write_text(json.dumps(sel,ensure_ascii=False,indent=2),encoding='utf-8')
print('selected',len(sel))
