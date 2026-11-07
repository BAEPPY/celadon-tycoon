import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {MODEL_CATALOG, getModelArtifact} from './models-manifest.js';
import {SHAPES} from './domain.js';

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
    assert.ok(doc.scenes[doc.scene ?? 0].nodes.length);
    assert.ok(doc.meshes.length);
    assert.deepEqual(doc.extensionsRequired || [], [], 'no missing decoder dependency');
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
