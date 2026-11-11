# Loading artwork

The potters and dust were created with OpenAI image generation for this game. Each of the 24 whole-body poses has trousers and shoes redrawn to follow a fixed joint guide. The v2 sheets also redraw the shoulders, elbows, wrists and cloth in each pose: the boy's free arm swings between his hip and chest, while the girl's elbows absorb the stride without releasing her bowl. Torso, coat tails, waist ties and hair have separate follow-through. The user's running reference videos informed the motion only; no video frames or reference characters are included in the game.

Each character sheet contains 24 whole-body poses in six columns and four rows, read left to right and then top to bottom. The guide permanently connects the left/far and right/near hip, knee, ankle and shoe. Their phases differ by half a stride. Both trouser legs have the same cloth palette. Continuous joint paths define every guide pose, including the final-to-first transition. The final redrawn art was visually reviewed against these guides for leg identity, foot direction, frame boundaries and loop continuity. The browser displays the baked whole-body sheets, preserving animation phase when loading speed changes.

Generated source images (original PNGs preserved in the workspace; upper-body WebPs stored in `art-source/loading`):

- Girl upper body: `exec-85ca66b0-62c4-4897-85ef-45e495c37d17.png`
- Boy upper body: `exec-9317d9cc-7b37-4ae0-8a0a-4d16f99365ad.png`
- Final v2 girl sheet: `exec-90d4d875-7c9a-454f-bdfa-9956c9a1b716.png`
- Final v2 boy sheet: `exec-935e8dc3-c3e4-4648-a0cd-51a83d454b10.png`
- Trouser style reference: `exec-834df54d-c9b1-485b-8bbc-911e661dd85a.png`
- Shoe style reference: `exec-50d55b04-fad8-4ea9-b4a4-3c436093551d.png`
- Dust: `exec-8374e45e-c1b5-487c-98b8-7a2d07b7ff5b.png`

Generate the original leg pose guides with `npm run render:loading-guides` (Chromium required; optionally set `CHROMIUM_PATH`). `loading-gait.js` defines joint motion, and `loading-runner-art.js` renders these guides using the original upper-body cutouts. The guides do not reproduce the v2 arm/cloth animation. Guide PNGs go to the system temporary directory, or `LOADING_OUTPUT_DIR`; this command does not overwrite final runtime artwork. The gait tests validate the guide geometry; final artwork requires visual review after image generation.

Runtime sheets are 1536×1024 with 256px cells, encoded as WebP at quality 92 and alpha quality 100. Versioned filenames refresh previously cached artwork. Transparent margins are checked in every cell, and the whole cycle is visually reviewed for hand/pottery contact, leg order and final-to-first continuity. Dust remains separate. Workshop captions rotate every 2.6 visible seconds and stop on errors. Only startup resources contribute to progress; animation and captions never fabricate progress or delay entry once resources are ready.
