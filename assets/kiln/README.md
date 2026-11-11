# Child apprentice fanning animation

Twenty original image-generated child poses form one downward fan stroke and one return. The blade and straight wooden handle form a rigid fan; the child moves the arm and wrist. The blue-gray/ivory clothing, simple brown-gray outlines, and restrained shading match the game artwork. All runtime layers have transparent backgrounds without text, floor, or room scenery.

## Runtime contract

- Draw `kiln-static.webp` once, then reuse `fanning-01.webp` for two complementary CSS-clipped layers: fixed child/body/stool and moving hand/fan.
- The source images remain unchanged. The wrist is the pivot; blade and handle rotate as one rigid piece. The scene preserves the source 4:3 aspect ratio so both masks stay aligned on smaller screens.
- `kiln-game.js` interpolates twenty angular poses across a 0.56-second stroke. A tap during a stroke queues one more stroke instead of snapping back to the first pose. Pausing freezes the pose; resuming continues it.
- This replaces swapping the original twenty whole-child frames, which moved the supposedly stationary body/stool between frames. Those generated frames and their provenance remain here as source artwork.

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
