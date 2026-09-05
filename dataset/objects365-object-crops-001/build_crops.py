#!/usr/bin/env python3
"""Generate labeled object crops from an official Objects365 validation patch."""
from __future__ import annotations
import csv
import json
import re
from pathlib import Path
from PIL import Image

SOURCE = Path('/home/ubuntu/objects365-patches/patch0')
ANNOTATIONS = Path('/home/ubuntu/objects365-patches/zhiyuan_objv2_val.json')
ROOT = Path(__file__).resolve().parent
CROP_ROOT = ROOT / 'images'
MAX_CROPS = 1500
JPEG_QUALITY = 90


def safe(value: str) -> str:
    return re.sub(r'[^A-Za-z0-9._-]+', '-', value).strip('.-') or 'unclassified'


def main() -> None:
    data = json.loads(ANNOTATIONS.read_text(encoding='utf-8'))
    cats = {int(c['id']): c['name'] for c in data['categories']}
    by_image: dict[int, list[dict]] = {}
    for ann in data['annotations']:
        by_image.setdefault(int(ann['image_id']), []).append(ann)
    source_names = {p.name: p for p in SOURCE.rglob('*.jpg')}
    rows = []
    failures = []
    crop_number = 0
    for image in data['images']:
        source_name = Path(image['file_name']).name
        source = source_names.get(source_name)
        if source is None:
            continue
        try:
            with Image.open(source) as original:
                original = original.convert('RGB')
                width, height = original.size
                for ann in by_image.get(int(image['id']), []):
                    if crop_number >= MAX_CROPS:
                        break
                    x, y, w, h = [float(v) for v in ann['bbox']]
                    left, top = max(0, int(x)), max(0, int(y))
                    right, bottom = min(width, int(x + w)), min(height, int(y + h))
                    if right <= left or bottom <= top:
                        continue
                    label = cats[int(ann['category_id'])]
                    output_dir = CROP_ROOT / safe(label)
                    output_dir.mkdir(parents=True, exist_ok=True)
                    filename = f'{source.stem}_object-{int(ann["id"]):07d}.jpg'
                    output = output_dir / filename
                    original.crop((left, top, right, bottom)).save(output, 'JPEG', quality=JPEG_QUALITY, optimize=True)
                    rows.append({
                        'filename': filename,
                        'relative_path': str(output.relative_to(ROOT)),
                        'class': label,
                        'source_image': source_name,
                        'source_image_id': image['id'],
                        'annotation_id': ann['id'],
                        'category_id': ann['category_id'],
                        'bbox_x': x, 'bbox_y': y, 'bbox_width': w, 'bbox_height': h,
                        'source_width': width, 'source_height': height,
                    })
                    crop_number += 1
        except Exception as exc:
            failures.append({'image': source_name, 'error': str(exc)})
        if crop_number >= MAX_CROPS:
            break
    metadata = ROOT / 'metadata'
    metadata.mkdir(parents=True, exist_ok=True)
    with (metadata / 'manifest.csv').open('w', newline='', encoding='utf-8') as handle:
        fields = list(rows[0].keys()) if rows else []
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader(); writer.writerows(rows)
    (metadata / 'source.txt').write_text(
        'Objects365 official validation patch 0 and zhiyuan_objv2_val.json\n'
        'https://www.objects365.org/\nLicense: CC BY 4.0 (per source documentation)\n', encoding='utf-8')
    if failures:
        (metadata / 'failures.json').write_text(json.dumps(failures, indent=2) + '\n', encoding='utf-8')
    print(f'crops={len(rows)} classes={len({r["class"] for r in rows})} failures={len(failures)}')


if __name__ == '__main__':
    main()
