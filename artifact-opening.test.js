import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createArtifactOpening} from './artifact-opening.js';

function fixture({reducedMotion = false, grouped = false} = {}) {
  const scene = new THREE.Group(), parent = new THREE.Group();
  parent.position.set(2, 1, -3); parent.rotation.z = 0.2; parent.scale.setScalar(1.4); scene.add(parent);
  const body = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), new THREE.MeshBasicMaterial());
  const lid = new THREE.Mesh(new THREE.SphereGeometry(0.8), new THREE.MeshBasicMaterial());
  body.position.y = 1; lid.position.y = 2.6;
  const lidRoot = grouped ? new THREE.Group() : lid;
  if (grouped) lidRoot.add(lid);
  parent.add(body, lidRoot);
  const associations = new Map([[body, {meshes: 0}], [lidRoot, {meshes: 1}], [lid, {meshes: 1}]]);
  let clock = 0, nextFrame = 0;
  const callbacks = new Map(), changes = [];
  const gltf = {scene, parser: {associations}};
  const options = {THREE, onChange: state => changes.push(state), now: () => clock,
    requestFrame: callback => {callbacks.set(++nextFrame, callback); return nextFrame;},
    cancelFrame: handle => callbacks.delete(handle), reducedMotion: () => reducedMotion};
  const tick = time => {clock = time; const pending = [...callbacks.values()]; callbacks.clear(); for (const callback of pending) callback(time);};
  return {scene, body, lid, lidRoot, gltf, options, callbacks, changes, tick};
}

test('lid animation requires explicit mesh identity and preserves source geometry, material and body', () => {
  const f = fixture(), before = f.lid.position.clone(), bodyBefore = f.body.position.clone();
  const geometry = f.lid.geometry, material = f.lid.material, quaternion = f.lid.quaternion.clone();
  assert.equal(createArtifactOpening(f.gltf, undefined, f.options), null);
  assert.equal(createArtifactOpening(f.gltf, {lidMesh: 4}, f.options), null);
  const opening = createArtifactOpening(f.gltf, {lidMesh: 1}, f.options);
  const worldBefore = f.lid.getWorldPosition(new THREE.Vector3());
  opening.setOpen(true);
  assert.equal(f.changes.at(-1).state, 'opening');
  f.tick(225);
  assert.ok(opening.progress > 0 && opening.progress < 1);
  const worldDuring = f.lid.getWorldPosition(new THREE.Vector3());
  assert.ok(worldDuring.y > worldBefore.y && worldDuring.x > worldBefore.x, 'Lid rises in world space with a small sideways shift, even under a transformed parent.');
  assert.deepEqual(f.body.position, bodyBefore);
  opening.setOpen(false);
  assert.equal(f.changes.at(-1).state, 'closing');
  f.tick(450);
  assert.equal(opening.progress, 0);
  assert.equal(f.changes.at(-1).state, 'closed');
  assert.deepEqual(f.lid.position, before, 'A reversed animation restores the exact source position.');
  assert.deepEqual(f.lid.quaternion.toArray(), quaternion.toArray());
  assert.equal(f.lid.geometry, geometry);
  assert.equal(f.lid.material, material);
  assert.equal(f.callbacks.size, 0);
  opening.setOpen(true); f.tick(900);
  assert.equal(f.changes.at(-1).state, 'open');
  const actual = new THREE.Box3().setFromObject(f.scene), framed = opening.getBounds();
  assert.ok(framed.containsBox(actual), 'Opening frame bounds contain both source parts in their final pose.');
});

test('multi-primitive lid groups are moved only once', () => {
  const f = fixture({grouped: true}), childPosition = f.lid.position.clone();
  const opening = createArtifactOpening(f.gltf, {lidMesh: 1}, f.options);
  opening.setOpen(true, {animate: false});
  assert.notEqual(f.lidRoot.position.length(), 0);
  assert.deepEqual(f.lid.position, childPosition, 'Associated children keep their exact local transforms.');
});

test('reduced motion is immediate and disposing cancels all future animation work', () => {
  const reduced = fixture({reducedMotion: true});
  const instant = createArtifactOpening(reduced.gltf, {lidMesh: 1}, reduced.options);
  instant.setOpen(true);
  assert.equal(instant.progress, 1); assert.equal(reduced.changes.at(-1).state, 'open');
  assert.equal(reduced.callbacks.size, 0);
  instant.setOpen(false); assert.equal(instant.progress, 0);
  const f = fixture(), opening = createArtifactOpening(f.gltf, {lidMesh: 1}, f.options);
  opening.setOpen(true); f.tick(100);
  const lastPosition = f.lid.position.clone(), lastChanges = f.changes.length;
  opening.dispose(); assert.equal(f.callbacks.size, 0);
  f.tick(1000); opening.setOpen(false);
  assert.deepEqual(f.lid.position, lastPosition);
  assert.equal(f.changes.length, lastChanges);
});
