import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createEmployeeFigureFactory, poseEmployee } from '../src/game/employee-figure.js';

const worker = { id: 'research-specialist', department: 'research' };
function pose(figure) {
  return [figure.root, figure.head, ...figure.arms, ...figure.legs].map((part) => ({
    position: part.position.toArray(),
    rotation: part.rotation.toArray(),
    scale: part.scale.toArray(),
  }));
}

test('employee poses reset after pickup and remain still with reduced motion', () => {
  const factory = createEmployeeFigureFactory();
  try {
    const figure = factory.create(worker);
    poseEmployee(figure, 0.4, 'idle', true);
    const resting = pose(figure);
    poseEmployee(figure, 0.4, 'drag');
    assert.notDeepEqual(pose(figure), resting);
    poseEmployee(figure, 0.8, 'hover');
    const greeting = pose(figure);
    const fresh = factory.create(worker);
    poseEmployee(fresh, 0.8, 'hover');
    assert.deepEqual(
      greeting,
      pose(fresh),
      'pickup must not leave dangling leg or root transforms',
    );
    for (const mode of ['hover', 'drag', 'waiting', 'landing', 'idle']) {
      poseEmployee(figure, 20, mode, true);
      assert.deepEqual(pose(figure), resting);
    }
  } finally {
    factory.dispose();
  }
});

test('full figures fit the preview through greetings and pickup, and shared resources are released', () => {
  const factory = createEmployeeFigureFactory();
  const resources = new Set();
  for (const department of ['research', 'creative', 'engineering']) {
    const figure = factory.create({ id: department, department });
    figure.root.traverse((object) => {
      if (object.isMesh) {
        resources.add(object.geometry);
        resources.add(object.material);
      }
    });
    for (const mode of ['idle', 'hover', 'drag', 'landing']) {
      for (const time of [0, 0.3, 0.6, 1]) {
        poseEmployee(figure, time, mode);
        const bounds = new THREE.Box3().setFromObject(figure.root);
        assert.ok(bounds.min.y > -0.15 && bounds.max.y < 2.5, mode + ' fits vertically');
        assert.ok(bounds.min.x > -1.2 && bounds.max.x < 1.2, mode + ' fits horizontally');
        assert.ok(bounds.getSize(new THREE.Vector3()).y > 1.7, 'head through feet are present');
      }
    }
  }
  let disposed = 0;
  resources.forEach((resource) => resource.addEventListener('dispose', () => disposed++));
  factory.dispose();
  assert.equal(disposed, resources.size, 'each shared resource is released once');
});
