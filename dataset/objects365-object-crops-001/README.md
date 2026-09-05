# Objects365 object-crop shard 001

This shard contains individual object crops generated from the official Objects365 validation annotations. Each crop is stored in the folder named for its object class, such as `Bicycle/`, `Banana/`, or `Person/`.

The crops use the official bounding boxes from validation patch 0. The manifest records the source image, annotation ID, class ID, bounding box, original dimensions, and relative crop path. A maximum of 1,500 crops is used per manageable GitHub shard; later shards can continue from the same patch.

The source dataset is Objects365, published under CC BY 4.0 according to the upstream documentation. Preserve attribution and consult the [Objects365 website](https://www.objects365.org/) before redistribution.

To reproduce the shard after downloading the official patch and annotation JSON:

```bash
python3 dataset/objects365-object-crops-001/build_crops.py
```

This is a derived object-crop dataset, not the original full-resolution image release.
