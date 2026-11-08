# Customer walking sprites

Five original transparent walking sheets were image-generated on 2026-11-08, each using the corresponding existing `../source/{id}.png` as its strict identity, costume, and style reference. Characters were not redesigned.

Each PNG is 1774 × 887 with four equal horizontal cells, matching the aspect ratio of the original character sheets. Every pose faces right. Cells contain alternating contact and passing poses with visible foot, sleeve, and robe movement. Use discrete frame changes with a 1:2 viewport and `background-size: 400% 100%`; horizontal positions are 0%, 33.333333%, 66.666667%, and 100%. Do not interpolate sprite-sheet positions.

| Character | Generated source |
| --- | --- |
| king | exec-c87d8476-0b96-4533-a3b4-3108892ba30f.png |
| queen | exec-25c39c14-f646-47f3-8c7a-44c0759ab61d.png |
| noble | exec-25b5134d-5314-4776-ba8e-03789cf7b228.png |
| noblewoman | exec-d09c6e36-c17c-4e87-ae25-a6a38e293800.png |
| artisan | exec-91b6f8b6-9604-4fa1-a4b3-20e0a7daa55c.png |

Original generated images are preserved in the workspace's `generated_images` directory; production PNGs here retain the generator's transparent pixels unchanged.
