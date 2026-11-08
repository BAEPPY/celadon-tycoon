# Child apprentice fanning animation

Twenty original image-generated child poses form one downward fan stroke and one return. The blade and straight wooden handle form a rigid fan; the child moves the arm and wrist. The blue-gray/ivory clothing, simple brown-gray outlines, and restrained shading match the game artwork. All runtime layers have transparent backgrounds without text, floor, or room scenery.

## Runtime contract

- Draw `kiln-static.webp` once, then draw `fanning-01.webp` through `fanning-20.webp` over it in numeric order.
- Every layer uses the same 512 × 384 canvas and the same `object-fit: contain` box. No per-frame offsets are needed.
- The kiln remains pixel-identical throughout the animation because it is a separate static layer.
- Each whole child/stool/fan pose is uniformly scaled and translated to the same topknot anchor near `(410,16)` and feet/stool baseline near `y=367`. Every pose retains a transparent outer margin.
- Frames 1–11 move the fan down toward the firebox; frames 12–20 bring it back up. Frame 20 returns near frame 1 for a loop or repeated taps.
- Matching PNGs preserve the exported full-resolution layers. WebPs use quality 94 encoding with alpha at identical dimensions.

## Generated source and processing

All artwork was generated with the image-generation tool on 2026-11-08. The initial four-keypose sheet `fanning-sheet.png` remains unchanged as the visual source: `exec-ab3740c2-d9ab-4bbd-be4b-7dc964e40298.png`. It referenced the existing game kiln, firing tutorial, and character art.

The final twenty child poses were generated in four five-pose strips, then image-generation edits extracted the complete child/fan/stool layers. The final unchanged source strips are preserved under `source-20/`:

| File | Generated original |
| --- | --- |
| `child-phase-1.png` | `exec-57972082-0830-4327-b942-82aca7c20982.png` |
| `child-phase-2.png` | `exec-1371e031-df12-42a8-8dee-61a0b153f3df.png` |
| `child-phase-3.png` | `exec-95165cef-5591-4085-9b57-0241db344c42.png` |
| `child-phase-4.png` | `exec-f9469fdf-8742-4a8f-b115-54e6f6106e98.png` |
| `kiln-static-original.png` | `exec-03d95d6a-2544-4ca4-b2db-84f666787dba.png` |

`prepare-20-frames.py` performs only transparent-gutter crops, uniform whole-layer scaling/translation, ordering, and PNG/WebP encoding. `registration.json` records the source crop, scale, translation, and final pose order. No repainting, recoloring, isolated-body-part transformation, or duplicated frame construction is used. The kiln and child are composed by the game renderer.

Validation checks all twenty child frames have distinct decoded pixels, all twenty-one layers have identical canvas dimensions, and visible artwork stays inside the canvas. The combined scene and complete stroke were reviewed in Chromium. The generated originals also remain available in `/workspace/generated_images`.
