# Customer expressions

Five original Goryeo workshop characters each have three newly generated half-body expressions: `happy`, `uncertain`, and `angry`. The reference for every sheet is its existing four-view character source under `../source/`.

Original generated transparent PNG strips are retained in `source/`; each strip has three equal cells from left to right: happy, uncertain, angry. Runtime WebP portraits are extracted from those cells, uniformly fitted to 512 × 768 transparent canvases with a common bottom baseline. This is deterministic asset packing, with no replacement of the original four-view sheets.

`manifest.json` records original/runtime hashes, source cells and extraction bounds. The images are creative illustrations for the game, not documented portraits of historical individuals.
