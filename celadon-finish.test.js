import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {applyCeladonFinish} from './celadon-finish.js';
import {OBSERVATION_ARTIFACTS, COMPARISON_ARTIFACTS, BEAUTY_ARTIFACT} from './lesson-artifacts.js';

test('glaze changes only the five observation displays, not comparative artifacts', () => {
  assert.equal(OBSERVATION_ARTIFACTS.length, 5);
  for (const artifact of OBSERVATION_ARTIFACTS) {
    assert.ok(artifact.ceramicFinish.roughness > .2 && artifact.ceramicFinish.roughness < .5);
    assert.ok(artifact.ceramicFinish.clearcoat > 0 && artifact.ceramicFinish.clearcoat < .6);
  }
  for (const artifact of [...COMPARISON_ARTIFACTS, BEAUTY_ARTIFACT]) assert.equal(artifact.ceramicFinish, undefined);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  const original = mesh.material;
  applyCeladonFinish(mesh, THREE);
  assert.equal(mesh.material, original);
});

test('glazing preserves photographs, UV channels, scans and vertex colours and releases replaced materials once', () => {
  const photo = new THREE.Texture(); photo.channel = 2;
  const normal = new THREE.Texture(), roughness = new THREE.Texture();
  const source = new THREE.MeshStandardMaterial({map: photo, normalMap: normal, roughnessMap: roughness, vertexColors: true, color: 0xc0d0ba, side: THREE.DoubleSide});
  source.normalScale.set(.3, .6);
  const group = new THREE.Group(), geometry = new THREE.BoxGeometry();
  const a = new THREE.Mesh(geometry, source), b = new THREE.Mesh(geometry, source);
  group.add(a, b);
  let disposed = 0, photoDisposed = 0;
  source.addEventListener('dispose', () => disposed++);
  photo.addEventListener('dispose', () => photoDisposed++);
  const profile = OBSERVATION_ARTIFACTS[0].ceramicFinish;
  applyCeladonFinish(group, THREE, profile);
  assert.equal(a.geometry, geometry); assert.equal(b.geometry, geometry);
  assert.equal(a.material, b.material); assert.ok(a.material.isMeshPhysicalMaterial);
  assert.equal(a.material.map, photo); assert.equal(photo.channel, 2);
  assert.equal(a.material.normalMap, normal); assert.equal(a.material.roughnessMap, roughness);
  assert.deepEqual(a.material.normalScale.toArray(), [.3, .6]);
  assert.equal(a.material.vertexColors, true); assert.ok(a.material.color.equals(source.color));
  assert.equal(a.material.side, THREE.DoubleSide); assert.equal(a.material.metalness, 0);
  assert.equal(disposed, 1); assert.equal(photoDisposed, 0);
});

test('unlit photographs receive a dielectric glaze while the pillow underside stays matte', () => {
  const photo = new THREE.Texture();
  const surface = new THREE.MeshBasicMaterial({map: photo, color: 0xc3d2bf});
  const base = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), [surface, base]);
  applyCeladonFinish(mesh, THREE, OBSERVATION_ARTIFACTS[0].ceramicFinish);
  assert.equal(mesh.material[0].map, photo); assert.ok(mesh.material[0].color.equals(surface.color));
  assert.equal(mesh.material[0].toneMapped, true);
  assert.ok(mesh.material[0].clearcoat > mesh.material[1].clearcoat);
  assert.ok(mesh.material[1].roughness > .6);
});
