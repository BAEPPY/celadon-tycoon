# Loading artwork

Original transparent potter characters and dust were created with OpenAI image generation for this game. The run sheets were revised using the user's supplied running reference, with matching blue-gray trousers on both legs. No video frames are included in the game.

Each character sheet contains eight whole-body poses in four columns and two rows, read left to right and then top to bottom. The two rows represent opposite steps. The browser advances the poses without cutting characters into body parts. Its accumulated animation phase remains continuous when loading speed changes.

Final generated sources (preserved in the workspace):

- Girl: `exec-c34e79c9-b8a4-44c6-9fc9-ae21ff98a15f.png`
- Boy: `exec-8cd7af59-413b-44e1-8c13-f056ee4b3e06.png`
- Dust: `exec-8374e45e-c1b5-487c-98b8-7a2d07b7ff5b.png`

Runtime sheets use WebP at quality 90 and alpha quality 100, with original dimensions and transparency. Dust is a separate transparent element. Only startup resources contribute to the progress value; animation speed never fabricates progress or delays entry once those resources are ready.
