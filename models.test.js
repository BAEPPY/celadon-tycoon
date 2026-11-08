import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {MODEL_CATALOG, getModelArtifact} from './models-manifest.js';
import {SHAPES} from './domain.js';
import {COMPARISON_ARTIFACTS, OBSERVATION_ARTIFACTS, BEAUTY_ARTIFACT} from './lesson-artifacts.js';

const provenance = JSON.parse(await readFile(new URL('./assets/models/provenance.json', import.meta.url), 'utf8'));

function parseGLB(data) {
  assert.equal(data.toString('ascii', 0, 4), 'glTF');
  assert.equal(data.readUInt32LE(4), 2);
  assert.equal(data.readUInt32LE(8), data.length);
  const jsonLength = data.readUInt32LE(12);
  assert.equal(data.readUInt32LE(16), 0x4e4f534a);
  const document = JSON.parse(data.toString('utf8', 20, 20 + jsonLength));
  const binaryStart = 20 + jsonLength;
  assert.equal(data.readUInt32LE(binaryStart + 4), 0x004e4942);
  const binaryLength = data.readUInt32LE(binaryStart);
  assert.equal(binaryStart + 8 + binaryLength, data.length);
  return {document, binaryLength};
}

function imageDimensions(data) {
  if (data.toString('ascii', 1, 4) === 'PNG') return [data.readUInt32BE(16), data.readUInt32BE(20)];
  assert.equal(data.readUInt16BE(0), 0xffd8, 'classroom photos are embedded JPEG or PNG');
  let offset = 2;
  while (offset < data.length) {
    assert.equal(data[offset++], 0xff);
    while (data[offset] === 0xff) offset++;
    const marker = data[offset++], size = data.readUInt16BE(offset);
    if ([0xc0, 0xc1, 0xc2].includes(marker)) return [data.readUInt16BE(offset + 5), data.readUInt16BE(offset + 3)];
    offset += size;
  }
  throw new Error('Image has no size header');
}

test('수업 확대 자료는 실제 고해상도 사진을 내장하고 한 번에 불러올 크기를 제한한다', async () => {
  const report = JSON.parse(await readFile(new URL('./assets/lesson/provenance.json', import.meta.url), 'utf8'));
  const artifacts = [...COMPARISON_ARTIFACTS, ...OBSERVATION_ARTIFACTS, BEAUTY_ARTIFACT];
  for (const artifact of artifacts) for (const key of ['src', 'detailedSrc']) {
    if (!artifact[key]) continue;
    const path = artifact[key];
    assert.match(path, /^\/assets\/lesson\/(?:detail\/)?(?:comparison-[123]|observation-[12345]|beauty)\.glb$/, 'blind asset routes do not give away an answer');
    const data = await readFile(new URL(`.${path}`, import.meta.url));
    const record = report.assets.find(item => item.file === path.replace('/assets/lesson/', ''));
    assert.ok(record, `provenance for ${path}`);
    assert.equal(record.sha256, createHash('sha256').update(data).digest('hex'));
    assert.equal(record.bytes, data.length);
    assert.ok(data.length <= (key === 'detailedSrc' ? 10 : 8) * 1024 * 1024, `${path} stays within the single-view download budget`);
    const {document: doc, binaryLength} = parseGLB(data);
    const binary = data.subarray(28 + data.readUInt32LE(12));
    let triangles = 0;
    for (const view of doc.bufferViews) assert.ok((view.byteOffset || 0) + view.byteLength <= binaryLength);
    for (const mesh of doc.meshes) for (const primitive of mesh.primitives) {
      triangles += doc.accessors[primitive.indices].count / 3;
      const material = doc.materials[primitive.material], textureInfo = material.pbrMetallicRoughness?.baseColorTexture;
      if (!textureInfo) continue;
      assert.ok(doc.accessors[primitive.attributes[`TEXCOORD_${textureInfo.texCoord || 0}`]], 'source photograph remains connected to its matching UV set');
      const image = doc.images[doc.textures[textureInfo.index].source], view = doc.bufferViews[image.bufferView];
      assert.ok(!image.uri, 'no external image request or decoder is needed');
      const dimensions = imageDimensions(binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength));
      if (artifact.detailedSrc && doc.materials.indexOf(material) === 0) {
        assert.ok(Math.max(...dimensions) >= (key === 'detailedSrc' ? 4096 : 2048), `${path} uses the real high-resolution atlas`);
      }
    }
    assert.ok(triangles <= 350000, 'the 777k-triangle chair is not automatically loaded on Chromebooks');
  }
});

test('고화질 수업 자료는 원본의 형상·UV·법선·색상을 재생성하지 않는다', async () => {
  for (const [id, name] of [['observation-1', 'celadon-pillow-reconstruction'], ['observation-4', 'celadon-ewer'], ['beauty', 'celadon-maebyeong-v2']]) {
    for (const detail of ['', 'detail/']) {
      const original = await readFile(new URL(`./assets/models/${detail}${name}.glb`, import.meta.url));
      const updated = await readFile(new URL(`./assets/lesson/${detail}${id}.glb`, import.meta.url));
      const {document: before} = parseGLB(original), {document: after} = parseGLB(updated);
      assert.deepEqual(after.accessors, before.accessors, 'mesh topology and vertex layout stay intact');
      assert.deepEqual(after.meshes, before.meshes);
      assert.deepEqual(after.materials, before.materials, 'photo, normal and roughness bindings stay intact');
      const images = new Set(before.images.map(image => image.bufferView));
      for (let index = 0; index < before.bufferViews.length; index++) {
        if (images.has(index)) continue;
        const a = before.bufferViews[index], b = after.bufferViews[index];
        const aStart = 28 + original.readUInt32LE(12) + (a.byteOffset || 0), bStart = 28 + updated.readUInt32LE(12) + (b.byteOffset || 0);
        assert.deepEqual(updated.subarray(bStart, bStart + b.byteLength), original.subarray(aStart, aStart + a.byteLength), 'geometric data remains byte-identical');
      }
    }
  }
});

test('도감은 중복 없이 확장되고 기존 제작 형태의 관찰 모델은 유지된다', () => {
  assert.ok(MODEL_CATALOG.length > SHAPES.length);
  assert.equal(new Set(MODEL_CATALOG.map(x => x.id)).size, MODEL_CATALOG.length);
  assert.equal(new Set(MODEL_CATALOG.map(x => x.src)).size, MODEL_CATALOG.length);
  for (const shape of SHAPES) assert.equal(getModelArtifact(shape.id).id, shape.id);
  assert.equal(getModelArtifact('unknown'), null);
  for (const artifact of MODEL_CATALOG) {
    assert.ok(artifact.name && artifact.clue && artifact.source && artifact.note);
    assert.equal(new URL(artifact.sourceUrl).protocol, 'https:');
  }
});

for (const artifact of MODEL_CATALOG) {
  test(artifact.name + ': 로컬 GLB, 내장 자원, 기록된 해시를 검증한다', async () => {
    const data = await readFile(new URL(artifact.src, import.meta.url));
    const record = provenance.models.find(x => x.name === artifact.src.split('/').at(-1));
    assert.ok(record, 'every artifact has a provenance record');
    assert.equal(record.bytes, data.length);
    assert.equal(record.sha256, createHash('sha256').update(data).digest('hex'));
    const {document: doc, binaryLength} = parseGLB(data);
    if (artifact.id === 'incense') {
      const textureSources = new Set();
      assert.equal(doc.meshes.length, 2, 'the incense retains its body and pierced lid');
      for (const mesh of doc.meshes) for (const primitive of mesh.primitives) {
        const material = doc.materials[primitive.material];
        const texture = doc.textures[material.pbrMetallicRoughness.baseColorTexture.index];
        assert.ok(doc.images[texture.source]?.bufferView !== undefined, 'each part has its embedded original color image');
        assert.ok(doc.accessors[primitive.attributes.TEXCOORD_0], 'each part retains the UVs that place its image');
        textureSources.add(texture.source);
      }
      assert.equal(textureSources.size, 2, 'the body and lid use their own matching photographs');
      assert.equal(artifact.referenceTint, false, 'a uniform tint must not replace the source colors');
    }
    assert.ok(doc.scenes[doc.scene ?? 0].nodes.length);
    assert.ok(doc.meshes.length);
    if (record.parts) assert.equal(doc.meshes.length, record.parts.length, 'all source parts are retained');
    assert.ok((doc.extensionsRequired || []).every(extension => extension === 'KHR_materials_unlit'), 'required features are built into the viewer, with no external decoder dependency');
    assert.equal(doc.buffers.length, 1);
    assert.ok(!doc.buffers[0].uri, 'geometry must be embedded');
    assert.ok(doc.buffers[0].byteLength <= binaryLength);
    for (const view of doc.bufferViews) {
      assert.equal(view.buffer, 0);
      assert.ok((view.byteOffset || 0) + view.byteLength <= binaryLength);
    }
    for (const image of doc.images || []) {
      assert.ok(!image.uri, 'textures must be embedded');
      assert.ok(doc.bufferViews[image.bufferView]);
    }
    for (const mesh of doc.meshes) {
      for (const primitive of mesh.primitives) {
        const position = doc.accessors[primitive.attributes.POSITION];
        assert.ok(position.count > 2);
        assert.equal(position.type, 'VEC3');
        assert.ok(position.min.every(Number.isFinite) && position.max.every(Number.isFinite));
        assert.ok(position.max.some((v, i) => v > position.min[i]));
      }
    }
    const expectedParts = {cupStand: 2, gourdPitcher: 3, bambooShootPitcher: 2, wildflowerPitcher: 3, qilinIncense: 2, qilinDecoratedIncense: 2, duckIncense: 2}[artifact.id];
    if (expectedParts) assert.equal(doc.meshes.length, expectedParts, 'all aligned parts remain one complete set');
  });
}
