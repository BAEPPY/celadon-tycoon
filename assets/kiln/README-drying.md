# Drying fan animation

Eight transparent fan-only frames for drying the student’s pottery directly on the workbench.

- Generated with `image_gen` on 2026-11-08 editing the upright `drying-fan-03.png` canonical fan, originally based on `assets/kiln/fanning-01.png`.
- Original generated sheet: `/workspace/generated_images/exec-f8e5364c-f550-49b3-a997-98742472fc74.png`, retained unchanged as `drying-fan-sheet.png`.
- Original SHA-256: `c5c475aeca810811bd67537a6a3f953d6c657f77075576b689ba45b9ed1d8caf`.
- Runtime frames: `drying-fan-01.webp` through `drying-fan-08.webp`, 448 × 448 RGBA, quality 94. PNGs retain the registered frame originals.
- Correction: the paper face, ribs, hub and wooden handle form one rigid piece. The entire handle tilts with the fan face; there is no hinge or bend at the hub. The eight generated poses swing the whole fan around the grip.
- Processing: mechanical crop of the four-column/two-row generated sheet, with transparent margins, uniform 90% export sizing to keep every edge inside the frame, followed by translation to register the handle grip. No redrawn or synthesized animation frames.
- Grip anchor: `(224, 416)` in every 448 × 448 frame; for canvas drawing, position the handle at the pointer using normalized anchor `(0.5, 0.928571)`.
- Playback: frames 1 → 8 loop with a gentle side-to-side stroke. Intended display size about 90–130 px, play while moving the fan or using the keyboard action. Stop on frame 3 when idle if desired.
- Colors: pale ivory paper, muted bamboo ribs and handle, warm gray-brown outline; transparent background with no scene or lettering.

Each runtime frame was decoded and checked for dimensions, transparency, and distinct image content. Preview contact sheet during development: `/tmp/drying-fan-rigid-contact.jpg`.
