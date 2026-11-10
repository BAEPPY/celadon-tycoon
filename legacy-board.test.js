// The PowerPoint add-in's old-engine board runs in Internet Explorer 11 (PowerPoint 2016/2019). That engine is not
// available to the browser tests, so these checks keep its code and styles to what the engine has.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {parse} from 'acorn';

const script = readFileSync('ppt-addin/legacy.js', 'utf8'), styles = readFileSync('ppt-addin/legacy.css', 'utf8'), page = readFileSync('ppt-addin/index.html', 'utf8');
const viewer = readFileSync('ppt-addin/legacy-3d.js', 'utf8');
const withoutComments = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const code = withoutComments(script), viewerCode = withoutComments(viewer);

test('the old-engine board and the block that loads it are ES5', () => {
  assert.doesNotThrow(() => parse(script, {ecmaVersion: 5}));
  assert.doesNotThrow(() => parse(viewer, {ecmaVersion: 5}));
  const loader = page.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.doesNotThrow(() => parse(loader, {ecmaVersion: 5}));
  assert.match(loader, /\/ppt-addin\/legacy\.js/); assert.match(loader, /\/ppt-addin\/legacy\.css/);
  assert.match(page, /<meta http-equiv="X-UA-Compatible" content="IE=edge">/);
  // A syntax error would stop the whole file in that engine, so newer syntax must not hide inside a string either.
  assert.throws(() => parse('var a = () => 1;', {ecmaVersion: 5}), 'the parser really rejects newer syntax');
});

test('the 3D library kept for that engine is the ES5 build of its time, with its licences', () => {
  // three.js r116 still ran in Internet Explorer 11; the site's own three.js does not. A Promise stand-in comes first.
  for (const file of ['three-r116.min.js', 'GLTFLoader-r116.js', 'promise-polyfill.min.js']) assert.doesNotThrow(() => parse(readFileSync(`ppt-addin/vendor/${file}`, 'utf8'), {ecmaVersion: 5}), file);
  assert.match(readFileSync('ppt-addin/vendor/three-r116.min.js', 'utf8'), /REVISION\s*[:=]\s*"116"|"116"/);
  const loader = readFileSync('ppt-addin/vendor/GLTFLoader-r116.js', 'utf8');
  for (const need of ['KHR_materials_unlit', 'KHR_mesh_quantization']) assert.ok(loader.includes(need), `${need} is needed by the lesson models`);
  assert.match(readFileSync('ppt-addin/vendor/LICENSE-three.txt', 'utf8'), /MIT License/);
  assert.match(readFileSync('ppt-addin/vendor/LICENSE-promise-polyfill.txt', 'utf8'), /Permission is hereby granted/);
  assert.match(script, /window\.Promise \? \[\] : \[VENDOR \+ 'promise-polyfill\.min\.js'\]/, 'the Promise stand-in loads only where Promise is missing');
  // The lesson models themselves must stay within what that library reads.
  for (const id of ['beauty', 'comparison-1', 'comparison-2', 'comparison-3', 'observation-1', 'observation-2', 'observation-3', 'observation-4', 'observation-5']) {
    const data = readFileSync(`assets/lesson/${id}.glb`), json = JSON.parse(data.subarray(20, 20 + data.readUInt32LE(12)).toString('utf8'));
    for (const name of json.extensionsRequired || []) assert.ok(['KHR_materials_unlit', 'KHR_mesh_quantization'].includes(name), `${id} requires ${name}`);
    for (const image of json.images || []) assert.ok(['image/jpeg', 'image/png'].includes(image.mimeType), `${id} uses ${image.mimeType} pictures`);
    for (const mesh of json.meshes) for (const part of mesh.primitives) assert.ok(json.accessors[part.attributes.POSITION].count <= 65535, `${id} fits 16-bit indices`);
  }
});

test('the old-engine board uses nothing Internet Explorer 11 lacks', () => {
  const missing = ['Promise', 'fetch', 'URLSearchParams', 'Symbol', 'WeakMap', 'Proxy', 'Reflect', 'AbortController', 'structuredClone', 'requestIdleCallback', 'IntersectionObserver', 'ResizeObserver', 'CustomEvent', 'TextEncoder'];
  for (const name of ['URL', 'Map', 'Set']) assert.ok(!new RegExp(`\\bnew ${name}\\b|\\b${name}\\.`).test(code), `${name} is not available`);
  const calls = ['includes', 'startsWith', 'endsWith', 'padStart', 'padEnd', 'repeat', 'find', 'findIndex', 'fill', 'flat', 'flatMap', 'at', 'closest', 'matches', 'remove', 'append', 'prepend', 'replaceWith', 'before', 'after',
    'toggleAttribute', 'replaceAll', 'matchAll', 'trimStart', 'trimEnd', 'forEach', 'entries', 'values', 'assign', 'from', 'of', 'isFinite', 'isInteger', 'isNaN', 'toggle'];
  for (const [label, source] of [['board', code], ['3D viewer', viewerCode]]) {
    for (const name of missing) assert.ok(!new RegExp(`\\b${name}\\b`).test(source.replace(/window\.Promise \?/, '')), `${label}: ${name} is not available`);
    for (const name of calls) assert.ok(!new RegExp(`\\.${name}\\(`).test(source), `${label}: .${name}() is not available (or differs) in that engine`);
    assert.ok(!/classList/.test(source), `${label}: classList differs in that engine; class names are written whole`);
  }
  assert.ok(!/responseType/.test(code), 'answers are read as text');
  assert.match(code, /new XMLHttpRequest\(\)/);
  assert.match(code, /'&_=' \+ new Date\(\)\.getTime\(\)/, 'every GET is made unique because that engine keeps GET answers');
});

test('the old-engine styles use nothing Internet Explorer 11 lacks', () => {
  const rules = styles.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const [pattern, name] of [[/var\(/, 'custom properties'], [/display:\s*(inline-)?grid/, 'grid'], [/display:\s*(inline-)?flex/, 'flexbox'], [/\bgap:/, 'gap'], [/clamp\(|\bmin\(|\bmax\(/, 'clamp/min/max'],
    [/aspect-ratio/, 'aspect-ratio'], [/:has\(|:is\(|:where\(/, 'newer selectors'], [/\binset:/, 'inset'], [/place-(items|content)/, 'place-*'], [/object-fit/, 'object-fit'], [/position:\s*sticky/, 'sticky']])
    assert.ok(!pattern.test(rules), `${name} is not available`);
  for (const colour of rules.match(/#[0-9a-fA-F]+\b/g) || []) assert.ok([4, 7].includes(colour.length), `${colour}: only #rgb and #rrggbb colours`);
});

test('every model the board can show has its sheet of turning pictures', () => {
  const models = script.match(/var MODELS = \[([^\]]+)\]/)[1].split(',').map(text => text.trim().replace(/'/g, ''));
  assert.equal(models.length, 9);
  for (const id of models) {
    const file = `assets/lesson/turntable/${id}.jpg`;
    assert.ok(existsSync(file), file);
    const data = readFileSync(file);
    assert.deepEqual([...data.subarray(0, 3)], [0xff, 0xd8, 0xff], `${file} is a JPEG`);
    // The first start-of-frame marker holds the size: six columns by four rows of 480-pixel views.
    let at = 2, size = null;
    while (at < data.length - 9 && !size) {
      const marker = data[at + 1], length = data.readUInt16BE(at + 2);
      if (marker >= 0xc0 && marker <= 0xc2) size = [data.readUInt16BE(at + 7), data.readUInt16BE(at + 5)]; else at += 2 + length;
    }
    assert.deepEqual(size, [2880, 1920], `${file} is 2880x1920`);
    assert.ok(data.length < 600 * 1024, `${file} stays light`);
  }
  assert.match(script, /FRAMES = 24, COLUMNS = 6, ROWS = 4/);
});
