import json
from pathlib import Path
for anim in ['attack','idle']:
    recs=json.loads((Path(r"W:\.gd\_video_work\cutouts_half")/anim/"frames.json").read_text(encoding='utf-8'))
    xs0=min(r['crop_box'][0] for r in recs); ys0=min(r['crop_box'][1] for r in recs); xs1=max(r['crop_box'][2] for r in recs); ys1=max(r['crop_box'][3] for r in recs)
    print(anim,'union',xs0,ys0,xs1,ys1,'size',xs1-xs0+1,ys1-ys0+1,'n',len(recs))
    # extra bbox extents variation
    print(' minmax widths',min(r['width'] for r in recs),max(r['width'] for r in recs),'heights',min(r['height'] for r in recs),max(r['height'] for r in recs))
