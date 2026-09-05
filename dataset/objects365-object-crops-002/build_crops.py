#!/usr/bin/env python3
"""Build a larger Objects365 crop shard with a minimum target per class."""
from __future__ import annotations
import csv, json, re
from pathlib import Path
from PIL import Image

PATCH_ROOT = Path('/home/ubuntu/objects365-patches')
ANNOTATIONS = PATCH_ROOT / 'zhiyuan_objv2_val.json'
ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'images'
TARGET_PER_CLASS = 100
MAX_CROPS = 50000


def safe(s: str) -> str:
    return re.sub(r'[^A-Za-z0-9._-]+', '-', s).strip('.-') or 'unclassified'


def main() -> None:
    data = json.loads(ANNOTATIONS.read_text(encoding='utf-8'))
    cats = {int(c['id']): c['name'] for c in data['categories']}
    by_image = {}
    for ann in data['annotations']:
        by_image.setdefault(int(ann['image_id']), []).append(ann)
    sources = {}
    for patch in sorted(PATCH_ROOT.glob('patch[0-9]')):
        for image in patch.rglob('*.jpg'):
            sources.setdefault(image.name, image)
    existing = {}
    prior = Path('/home/ubuntu/belagoandcaabdi/dataset/objects365-object-crops-001/metadata/manifest.csv')
    if prior.exists():
        with prior.open(encoding='utf-8') as h:
            for row in csv.DictReader(h): existing[row['class']] = existing.get(row['class'], 0) + 1
    counts = dict(existing)
    rows, seen = [], set()
    for image in data['images']:
        source = sources.get(Path(image['file_name']).name)
        if source is None: continue
        anns = by_image.get(int(image['id']), [])
        try:
            with Image.open(source) as original:
                original = original.convert('RGB'); width, height = original.size
                for ann in anns:
                    label = cats[int(ann['category_id'])]
                    if counts.get(label, 0) >= TARGET_PER_CLASS: continue
                    key = int(ann['id'])
                    if key in seen: continue
                    x,y,w,h = map(float, ann['bbox'])
                    box=(max(0,int(x)), max(0,int(y)), min(width,int(x+w)), min(height,int(y+h)))
                    if box[2] <= box[0] or box[3] <= box[1]: continue
                    outdir = OUT / safe(label); outdir.mkdir(parents=True, exist_ok=True)
                    name=f'{source.stem}_object-{key:07d}.jpg'; out=outdir/name
                    original.crop(box).save(out, 'JPEG', quality=88, optimize=True)
                    rows.append({'filename':name,'relative_path':str(out.relative_to(ROOT)),'class':label,'source_image':source.name,'source_image_id':image['id'],'annotation_id':ann['id'],'category_id':ann['category_id'],'bbox_x':x,'bbox_y':y,'bbox_width':w,'bbox_height':h,'source_width':width,'source_height':height})
                    seen.add(key); counts[label]=counts.get(label,0)+1
                    if len(rows) >= MAX_CROPS: break
        except Exception:
            continue
        if len(rows) >= MAX_CROPS: break
    meta=ROOT/'metadata'; meta.mkdir(parents=True, exist_ok=True)
    with (meta/'manifest.csv').open('w',newline='',encoding='utf-8') as h:
        fields=list(rows[0]) if rows else ['filename']; w=csv.DictWriter(h,fieldnames=fields); w.writeheader(); w.writerows(rows)
    (meta/'source.txt').write_text('Objects365 official validation patches 0-9 and zhiyuan_objv2_val.json\nhttps://www.objects365.org/\nLicense: CC BY 4.0 per source documentation.\n',encoding='utf-8')
    short=sorted((n,c) for n,c in counts.items() if c<TARGET_PER_CLASS)
    (meta/'class_counts.csv').write_text('class,count\n'+'\n'.join(f'{n},{c}' for n,c in sorted(counts.items()))+'\n',encoding='utf-8')
    print(f'new_crops={len(rows)} total_with_previous={sum(counts.values())} classes={len(counts)} below_target={len(short)} min={min(counts.values()) if counts else 0} max={max(counts.values()) if counts else 0}')

if __name__ == '__main__': main()
