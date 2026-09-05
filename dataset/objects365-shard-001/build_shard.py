#!/usr/bin/env python3
"""Build a small, reproducible Objects365 image shard from saved Roboflow catalog metadata."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent
OWNER = "8IqlCQUz92pfe9BWFgXB"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; dataset-shard-builder/1.0)"}


def image_url(image: dict[str, object]) -> str:
    return f"https://transform.roboflow.com/{image['owner']}/{image['id']}/thumb.jpg"


def fetch_one(image: dict[str, object], images_dir: Path, retries: int) -> dict[str, object]:
    filename = str(image["name"])
    target = images_dir / filename
    temporary = target.with_suffix(target.suffix + ".part")
    url = image_url(image)

    if target.exists() and target.stat().st_size > 0:
        payload = target.read_bytes()
    else:
        last_error: Exception | None = None
        for attempt in range(retries):
            try:
                request = Request(url, headers=HEADERS)
                with urlopen(request, timeout=45) as response:
                    payload = response.read()
                if not payload.startswith(b"\xff\xd8\xff"):
                    raise ValueError("response is not a JPEG")
                temporary.write_bytes(payload)
                temporary.replace(target)
                break
            except (HTTPError, URLError, TimeoutError, ValueError) as error:
                last_error = error
                temporary.unlink(missing_ok=True)
                time.sleep(1.5 * (attempt + 1))
        else:
            return {"ok": False, "name": filename, "error": str(last_error), "url": url}

    return {
        "ok": True,
        "name": filename,
        "bytes": len(payload),
        "sha256": hashlib.sha256(payload).hexdigest(),
        "url": url,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", type=Path, default=ROOT / "metadata" / "source_catalog.json")
    parser.add_argument("--workers", type=int, default=12)
    parser.add_argument("--retries", type=int, default=4)
    args = parser.parse_args()

    images_dir = ROOT / "images"
    metadata_dir = ROOT / "metadata"
    images_dir.mkdir(parents=True, exist_ok=True)
    metadata_dir.mkdir(parents=True, exist_ok=True)

    catalog = json.loads(args.catalog.read_text(encoding="utf-8"))
    images = catalog["data"]["images"]
    seen_names: set[str] = set()
    for image in images:
        name = str(image["name"])
        if name in seen_names:
            raise ValueError(f"duplicate filename in source catalog: {name}")
        seen_names.add(name)
        if image.get("owner") != OWNER:
            raise ValueError(f"unexpected image owner: {image.get('owner')}")

    results: dict[str, dict[str, object]] = {}
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = [executor.submit(fetch_one, image, images_dir, args.retries) for image in images]
        for position, future in enumerate(as_completed(futures), 1):
            result = future.result()
            results[str(result["name"])] = result
            if position % 50 == 0 or position == len(images):
                print(f"processed {position}/{len(images)}", flush=True)

    failed = [result for result in results.values() if not result["ok"]]
    manifest_path = metadata_dir / "manifest.csv"
    fields = [
        "filename", "split", "classes", "source_id", "destination_id", "owner",
        "updated_unix_ms", "annotation_available", "image_url", "bytes", "sha256",
    ]
    with manifest_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for image in sorted(images, key=lambda item: str(item["name"])):
            downloaded = results[str(image["name"])]
            writer.writerow({
                "filename": image["name"],
                "split": image["split"],
                "classes": ";".join(image["classes"]),
                "source_id": image["source"],
                "destination_id": image["destination"],
                "owner": image["owner"],
                "updated_unix_ms": image["updated"],
                "annotation_available": image["annotation"],
                "image_url": downloaded["url"],
                "bytes": downloaded.get("bytes", ""),
                "sha256": downloaded.get("sha256", ""),
            })

    classes = sorted({label for image in images for label in image["classes"]})
    (metadata_dir / "classes.txt").write_text("\n".join(classes) + "\n", encoding="utf-8")
    if failed:
        (metadata_dir / "download_failures.json").write_text(
            json.dumps(failed, indent=2) + "\n", encoding="utf-8"
        )
        print(f"failed downloads: {len(failed)}", file=sys.stderr)
        return 1

    total_bytes = sum(int(result["bytes"]) for result in results.values())
    print(f"completed images: {len(images)}")
    print(f"total image bytes: {total_bytes}")
    print(f"distinct classes: {len(classes)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
