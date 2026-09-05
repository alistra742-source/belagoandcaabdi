# Dataset shard 001

This folder contains a balanced starter shard from the **Open Images** validation set. It is organized as one folder per class, with downloaded images and a complete `manifest.csv` containing source URLs, licenses, authors, and titles.

The upstream Open Images dataset is much larger than a GitHub repository can safely hold: approximately 9 million images across more than 20,000 classes. This shard intentionally contains a small sample so the repository remains usable. Additional numbered shards can be generated from the same metadata without mixing labels.

## Classes

- `pavement/` — Pavement (0 images)\n- `ice_cream/` — Ice cream (7 images)\n- `person/` — Person (3 images)\n- `car/` — Car (7 images)\n- `bus/` — Bus (7 images)\n- `bicycle/` — Bicycle (6 images)\n- `motorcycle/` — Motorcycle (7 images)\n- `truck/` — Truck (6 images)\n- `dog/` — Dog (6 images)\n- `cat/` — Cat (5 images)\n- `bird/` — Bird (8 images)\n- `tree/` — Tree (5 images)\n- `flower/` — Flower (5 images)\n- `house/` — House (5 images)\n- `building/` — Building (8 images)\n- `chair/` — Chair (5 images)\n- `table/` — Table (2 images)\n- `couch/` — Couch (5 images)\n- `bed/` — Bed (6 images)\n- `laptop/` — Laptop (7 images)\n- `mobile_phone/` — Mobile phone (5 images)\n- `bottle/` — Bottle (7 images)\n- `cup/` — Cup (0 images)\n- `pizza/` — Pizza (7 images)\n- `apple/` — Apple (6 images)\n- `banana/` — Banana (8 images)\n- `cake/` — Cake (6 images)\n- `backpack/` — Backpack (5 images)\n- `umbrella/` — Umbrella (8 images)\n- `book/` — Book (5 images)\n
## Source and licensing

Images are from [Open Images V7](https://storage.googleapis.com/openimages/web/index.html). Open Images images are individually licensed by their respective copyright holders; consult `manifest.csv` before redistribution and retain the listed attribution. Dataset documentation and metadata are available from the [official download page](https://storage.googleapis.com/openimages/web/download_v7.html).
