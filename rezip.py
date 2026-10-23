from pathlib import Path
import zipfile
src=Path(r"W:\.gd\玉米炮手_精灵图集_最终版"); zpath=Path(r"W:\.gd\玉米炮手_精灵图集_最终版.zip")
with zipfile.ZipFile(zpath,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p in src.rglob('*'):
        if p.is_file(): z.write(p,p.relative_to(src.parent))
print(zpath,zpath.stat().st_size)
