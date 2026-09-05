#!/usr/bin/env python3
"""Place each shard image in one deterministic primary-class folder."""
from __future__ import annotations
import csv
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
IMAGE_ROOT = ROOT / "images"
MANIFEST = ROOT / "metadata" / "manifest.csv"


def folder_name(label: str) -> str:
    # Keep class names recognizable while making valid, portable path names.
    value = re.sub(r"[^A-Za-z0-9._-]+", "-", label).strip(".-")
    return value or "unclassified"


def main() -> None:
    with MANIFEST.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
        fieldnames = list(rows[0].keys()) + ["primary_class", "relative_path"]

    for row in rows:
        labels = [label for label in row["classes"].split(";") if label]
        primary = labels[0] if labels else "unclassified"
        destination_dir = IMAGE_ROOT / folder_name(primary)
        destination_dir.mkdir(parents=True, exist_ok=True)
        source = IMAGE_ROOT / row["filename"]
        destination = destination_dir / row["filename"]
        if source.exists():
            source.replace(destination)
        elif not destination.exists():
            raise FileNotFoundError(source)
        row["primary_class"] = primary
        row["relative_path"] = str(destination.relative_to(ROOT))

    with MANIFEST.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)
    print(f"organized {len(rows)} images into {len({r['primary_class'] for r in rows})} primary-class folders")


if __name__ == "__main__":
    main()
