# Objects365 shard 001

This shard contains **1,000 train-split images** from [Roboflow Universe’s Objects 365 Dataset, version 1](https://universe.roboflow.com/objects-365-consortium/objects-365/dataset/1). The source project declares the dataset under **CC BY 4.0**. The images in this shard are the 640×640 JPEG preview/transforms exposed by the source dataset, not the original full-resolution Objects365 release and not a complete training corpus.

## Contents

| Path | Description |
| --- | --- |
| `images/<primary-class>/` | 1,000 JPEG images organized into 70 primary-class folders. |
| `metadata/manifest.csv` | One record per image: source IDs, split, all class labels, primary class folder, relative path, direct source URL, byte count, and SHA-256 checksum. |
| `metadata/source_catalog.json` | Unmodified catalog response used to select the shard. |
| `metadata/classes.txt` | Distinct labels present in the shard. |
| `build_shard.py` | Reproducible downloader and manifest generator. |

## Provenance and attribution

The source dataset is credited to the **Objects 365 Consortium** on Roboflow Universe. The catalog response reports 1,802,891 images for dataset version 1, with a `train` split. Each manifest entry retains the Roboflow source and destination identifiers, the assigned labels, and the exact transformed-image URL used for this shard.

> Objects365: Shao et al., “Objects365: A Large-Scale, High-Quality Dataset for Object Detection,” ICCV 2019. The original dataset is available from [Objects365](https://www.objects365.org/).

The full release is approximately 712 GB when downloaded and extracted, so this repository intentionally uses independently committed, manageable image shards. Add later shards beside this directory rather than replacing this one.

## Rebuilding the shard

The checked-in images and manifest are authoritative. To rebuild them from the saved catalog metadata, run:

```bash
python3 dataset/objects365-shard-001/build_shard.py
python3 dataset/objects365-shard-001/organize_by_class.py
```

The downloader makes bounded concurrent requests, retries transient failures, verifies JPEG responses, and records SHA-256 hashes in `metadata/manifest.csv`. The organizer uses the first source label as the deterministic primary folder. Because object-detection images can contain multiple object classes, the remaining labels stay in the manifest rather than creating duplicate image copies.

## License

The source dataset page declares [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Preserve this attribution, the source links, and the manifest when redistributing this shard. Review the upstream license and dataset documentation for any use beyond this sample.
