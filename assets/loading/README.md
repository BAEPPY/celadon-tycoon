# Loading artwork

The potters and dust were created with OpenAI image generation for this game. Each of the 24 whole-body poses has trousers and shoes redrawn to follow a fixed joint guide, with modest upper-body bob and shoulder rotation. The user's reference video informed the support, heel recovery and passing phases. No video frames are included in the game.

Each character sheet contains 24 whole-body poses in six columns and four rows, read left to right and then top to bottom. The guide permanently connects the left/far and right/near hip, knee, ankle and shoe. Their phases differ by half a stride. Both trouser legs have the same cloth palette. Continuous joint paths define every guide pose, including the final-to-first transition. The final redrawn art was visually reviewed against these guides for leg identity, foot direction, frame boundaries and loop continuity. The browser displays the baked whole-body sheets, preserving animation phase when loading speed changes.

Generated source images (original PNGs preserved in the workspace; upper-body WebPs stored in `art-source/loading`):

- Girl upper body: `exec-85ca66b0-62c4-4897-85ef-45e495c37d17.png`
- Boy upper body: `exec-9317d9cc-7b37-4ae0-8a0a-4d16f99365ad.png`
- Final girl sheet: `exec-9ee7f41d-676a-450a-9c69-4ef8eea31832.png`
- Final boy sheet: `exec-12a0f3b8-3190-4af3-acdc-ce9a578f01bd.png`
- Trouser style reference: `exec-834df54d-c9b1-485b-8bbc-911e661dd85a.png`
- Shoe style reference: `exec-50d55b04-fad8-4ea9-b4a4-3c436093551d.png`
- Dust: `exec-8374e45e-c1b5-487c-98b8-7a2d07b7ff5b.png`

Generate pose guides with `npm run render:loading-guides` (Chromium required; optionally set `CHROMIUM_PATH`). `loading-gait.js` defines joint motion, and `loading-runner-art.js` renders the guides. Guide PNGs go to the system temporary directory, or `LOADING_OUTPUT_DIR`; this command does not overwrite final runtime artwork. The gait tests validate the guide geometry; final artwork requires visual review after image generation.

Runtime sheets are 1536×1024 with 256px cells, encoded as WebP at quality 92 and alpha quality 100. Dust remains separate. Workshop captions rotate every 2.6 visible seconds and stop on errors. Only startup resources contribute to progress; animation and captions never fabricate progress or delay entry once resources are ready.
