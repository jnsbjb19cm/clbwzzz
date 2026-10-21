from PIL import Image
from pathlib import Path
import zipfile, json
root=Path(r"W:\.gd")
for p in sorted(root.glob("*玉米炮手*")):
    if p.suffix.lower() in {'.gif','.png','.webp'}:
        try:
            im=Image.open(p)
            n=getattr(im,'n_frames',1)
            dur=im.info.get('duration')
            print(f"{p.name}\t{im.format}\t{im.size}\t{im.mode}\tframes={n}\tduration={dur}")
        except Exception as e: print('ERR',p.name,e)
    elif p.suffix.lower()=='.zip':
        try:
            with zipfile.ZipFile(p) as z:
                infos=z.infolist(); print(f"ZIP {p.name}\tfiles={len(infos)}\tfirst={infos[0].filename}\tsize={infos[0].file_size}")
        except Exception as e: print('ERRZIP',p.name,e)
