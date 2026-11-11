import test from 'node:test';
import assert from 'node:assert/strict';
import { glazeSurfaceTreatment } from './glaze-surface.js';

test('only a completed unsuccessful dip changes raw or fired glaze', () => {
  for (const raw of [null, {}, {version:1,elapsedMs:5000}, {version:1,elapsedMs:4500}, {version:1,elapsedMs:5500}]) {
    assert.equal(glazeSurfaceTreatment(raw,'finished'),null);
  }
  for(const stage of ['clay','biscuit'])assert.equal(glazeSurfaceTreatment({version:1,elapsedMs:2000},stage),null);
  assert.equal(glazeSurfaceTreatment({version:1,elapsedMs:2000},'glazed').fired,false);
  assert.equal(glazeSurfaceTreatment({version:1,elapsedMs:2000},'finished').fired,true);
});

test('material appearance is derived from elapsed time, never a submitted outcome', () => {
  const thin=glazeSurfaceTreatment({version:1,elapsedMs:2000,outcome:'thick',success:true},'finished');
  const thick=glazeSurfaceTreatment({version:1,elapsedMs:9000,outcome:'thin'},'finished');
  assert.equal(thin.outcome,'thin');assert.equal(thick.outcome,'thick');
  assert.notEqual(thin.wash,thick.wash);
  assert.ok(thin.textureAlpha > glazeSurfaceTreatment({version:1,elapsedMs:4499},'finished').textureAlpha);
});
