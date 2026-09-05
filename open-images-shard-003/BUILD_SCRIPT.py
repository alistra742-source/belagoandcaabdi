#!/usr/bin/env python3
import csv, hashlib, os, shutil, subprocess, sys
from pathlib import Path
REPO=Path('/tmp/belagoandcaabdi'); SHARD=REPO/'open-images-shard-003'; WORK=Path('/tmp/open-images-build')
TARGET=100; PER=50

def dl(url,dest):
    if dest.exists() and dest.stat().st_size: return
    dest.parent.mkdir(parents=True,exist_ok=True)
    subprocess.run(['curl','-L','--fail','--retry','3','--silent','--show-error',url,'-o',str(dest)],check=True)

def main():
    WORK.mkdir(exist_ok=True)
    dl('https://storage.googleapis.com/openimages/2018_04/validation/validation-images-with-rotation.csv',WORK/'validation-info.csv')
    dl('https://storage.googleapis.com/openimages/v5/validation-annotations-bbox.csv',WORK/'validation-boxes.csv')
    dl('https://storage.googleapis.com/openimages/2018_04/test/test-images-with-rotation.csv',WORK/'test-info.csv')
    dl('https://storage.googleapis.com/openimages/v5/test-annotations-bbox.csv',WORK/'test-boxes.csv')
    dl('https://storage.googleapis.com/openimages/v7/oidv7-class-descriptions-boxable.csv',WORK/'classes.csv')
    dl('https://raw.githubusercontent.com/openimages/dataset/master/downloader.py',WORK/'downloader.py')
    mids={name.strip():mid for mid,name in csv.reader((WORK/'classes.csv').open(encoding='utf-8'))}
    mapped=[]
    for r in csv.DictReader((REPO/'open-images/class_map.csv').open(encoding='utf-8')):
        if r['class_name'] in mids: mapped.append((r['class_name'],r['folder_name'],mids[r['class_name']]))
    existing=set()
    for s in REPO.glob('open-images-shard-*'):
        if s==SHARD: continue
        for p in s.iterdir() if s.exists() else []:
            if p.is_dir() and any(p.iterdir()): existing.add(p.name)
    mapped=[x for x in mapped if x[1] not in existing]
    candidates={x[2]:[] for x in mapped}
    for split in ('validation','test'):
        with (WORK/f'{split}-boxes.csv').open(newline='',encoding='utf-8') as f:
            for r in csv.DictReader(f):
                if r['LabelName'] in candidates and (split,r['ImageID']) not in candidates[r['LabelName']]:
                    candidates[r['LabelName']].append((split,r['ImageID']))
    selected=[x for x in mapped if len(candidates[x[2]])>=PER][:TARGET]
    if len(selected)<TARGET: raise RuntimeError(f'Only {len(selected)} classes have {PER} images across validation/test')
    wanted={mid:candidates[mid][:PER] for _,_,mid in selected}; ids={split:{i for pairs in wanted.values() for s,i in pairs if s==split} for split in ('validation','test')}
    info={}
    for split in ('validation','test'):
        with (WORK/f'{split}-info.csv').open(newline='',encoding='utf-8') as f:
            for r in csv.DictReader(f):
                if r['ImageID'] in ids[split]: info[(split,r['ImageID'])]=r
    if SHARD.exists(): shutil.rmtree(SHARD)
    SHARD.mkdir(); (SHARD/'README.md').write_text('# Open Images shard 003\n\n100 classes with 50 images per class from the official Open Images validation and test splits. The manifest preserves source URLs, original URLs, licenses, authors, and titles. Review each source license and retain attribution before redistribution.\n',encoding='utf-8')
    lines=[f'{s}/{i}' for s in ('validation','test') for i in sorted(ids[s])]; (WORK/'ids.txt').write_text('\n'.join(lines)+'\n')
    raw=WORK/'downloaded'; shutil.rmtree(raw,ignore_errors=True)
    subprocess.run([sys.executable,str(WORK/'downloader.py'),str(WORK/'ids.txt'),f'--download_folder={raw}','--num_processes=8'],check=True)
    rows=[]
    for name,folder,mid in selected:
        d=SHARD/folder; d.mkdir();
        for split,image_id in wanted[mid]:
            src=raw/split/f'{image_id}.jpg'
            if not src.exists(): src=raw/f'{image_id}.jpg'
            if not src.exists(): raise RuntimeError(f'missing {split}/{image_id}')
            shutil.copy2(src,d/f'{image_id}.jpg'); r=info[(split,image_id)]
            rows.append({'folder':folder,'class':name,'image_id':image_id,'download_url':r.get('Thumbnail300KURL',''),'original_url':r.get('OriginalURL',''),'license':r.get('License',''),'author':r.get('Author',''),'title':r.get('Title','')})
    with (SHARD/'manifest.csv').open('w',newline='',encoding='utf-8') as f:
        fields=['folder','class','image_id','download_url','original_url','license','author','title']; w=csv.DictWriter(f,fieldnames=fields); w.writeheader(); w.writerows(rows)
    with (SHARD/'SHA256SUMS.txt').open('w') as f:
        for p in sorted(SHARD.rglob('*.jpg')): f.write(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.relative_to(SHARD)}\n')
    print(f'created {SHARD} classes={len(selected)} images={len(rows)}')
if __name__=='__main__': main()
