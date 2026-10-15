import test from 'node:test';
import assert from 'node:assert/strict';
import { FactoryTwin } from '../frontend/twin.js';
import { assets } from '../server/scenarios.mjs';

test('procedural mesh produces finite geometry at every overlay and rotation', () => {
  for (const layer of ['status', 'flow', 'energy']) {
    for (const angle of [-1.6, -0.58, 0, 1.5, 3]) {
      const renderer = Object.create(FactoryTwin.prototype);
      Object.assign(renderer, { width: 800, height: 390, angle, pitch: 0.63, zoom: 1, time: 1, assets, selected: 'pressure', scenarioId: 'pressure', layer });
      renderer.build();
      assert.equal(renderer.floorFaces.length, 5);
      assert.ok(renderer.faces.length > 1000);
      for (const face of [...renderer.floorFaces, ...renderer.faces]) {
        assert.ok(Number.isFinite(face.depth));
        assert.ok(face.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
      }
    }
  }
});
