# Counter props

`desk-books.webp` and `desk-ink.webp` are transparent original hand-drawn props generated with the existing counter scene as a style reference. The books are generic stitched old paper volumes and a scroll, not a facsimile of Jikji or another specific historical book. The writing tools include an inkstone, ink stick, brush and brush rest, and celadon water dropper.

Original PNGs are retained under `source/desk-*.png`. `desk-props-manifest.json` records generation provenance, original/runtime dimensions, alpha crop bounds and SHA-256 hashes. Runtime images are deterministic alpha-bound crops and WebP conversions of those originals.

## Replacement arrangement (revision 2)

The user asked for new drawings with an orderly **left** calligraphy set and a **single right** reference book. `desk-ink-tidy.webp` and `desk-reference-book.webp` are newly generated original illustrations; the earlier props remain preserved but are no longer used at runtime. The book was regenerated at a lower viewing angle so it lies on the table. Its title area was generated blank, then labeled with self-hosted UnGungseo text in the application. No duplicate book, scroll, extra instruction label, or loose ink stick is rendered. Source PNGs and SHA-256 hashes are in `desk-props-v2-manifest.json`.
