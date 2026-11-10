# Libraries kept for PowerPoint 2016/2019

PowerPoint 2016/2019 show add-ins with Internet Explorer 11. The site's own three.js (bundled from `node_modules`)
needs a current engine, so the add-in's old-engine board (`../legacy.js`, `../legacy-3d.js`) loads these instead.
They are served as they were published; nothing here is used by the rest of the site.

| File | From | Licence |
| --- | --- | --- |
| `three-r116.min.js` | npm `three@0.116.1`, `build/three.min.js` (ES5 build, the era that still ran in Internet Explorer 11) | MIT, `LICENSE-three.txt` |
| `GLTFLoader-r116.js` | npm `three@0.116.1`, `examples/js/loaders/GLTFLoader.js` | MIT, `LICENSE-three.txt` |
| `promise-polyfill.min.js` | npm `promise-polyfill@8.3.0`, `dist/polyfill.min.js` (loaded only where `Promise` is missing) | MIT, `LICENSE-promise-polyfill.txt` |

`legacy-board.test.js` checks that these files parse as ES5 and that the lesson models stay within what this
loader reads (JPEG/PNG pictures, `KHR_materials_unlit`, `KHR_mesh_quantization`, 16-bit indices).
