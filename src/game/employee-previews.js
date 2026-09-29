import * as THREE from 'three';
import { createEmployeeFigureFactory, poseEmployee } from './employee-figure.js';

let pool;
function createPool() {
  // A single offscreen WebGL context serves the whole roster, not one per employee.
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: 'low-power',
  });
  renderer.setSize(240, 260, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(),
    camera = new THREE.OrthographicCamera(-1.2, 1.2, 1.3, -1.3, 0.1, 25);
  camera.position.set(3, 2.5, 6);
  camera.lookAt(0, 1.08, 0);
  scene.add(new THREE.HemisphereLight(0xfff5de, 0x7c8da6, 3));
  const key = new THREE.DirectionalLight(0xffefcf, 4);
  key.position.set(-3, 6, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 1.5);
  fill.position.set(4, 2, -2);
  scene.add(fill);
  const factory = createEmployeeFigureFactory(),
    entries = new Set();
  let last = 0;
  const observer = new IntersectionObserver((changes) =>
    changes.forEach((change) => {
      const entry = [...entries].find((e) => e.canvas === change.target);
      if (entry) entry.visible = change.isIntersecting;
    }),
  );
  renderer.setAnimationLoop((ms) => {
    if (document.hidden || ms - last < 40) return;
    last = ms;
    for (const entry of entries) {
      if (!entry.visible) continue;
      if (entry.reduced && entry.renderedMode === entry.mode) continue;
      if (!entry.figure) entry.figure = factory.create(entry.worker);
      const t = entry.mode === 'landing' ? (ms - entry.changedAt) / 700 : ms / 1000;
      poseEmployee(entry.figure, t, entry.mode, entry.reduced);
      scene.add(entry.figure.root);
      renderer.render(scene, camera);
      scene.remove(entry.figure.root);
      entry.context.clearRect(0, 0, 240, 260);
      entry.context.drawImage(renderer.domElement, 0, 0);
      entry.renderedMode = entry.mode;
    }
  });
  return {
    add(canvas, worker, onReady) {
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas unavailable');
      canvas.width = 240;
      canvas.height = 260;
      const entry = {
        canvas,
        context,
        worker,
        visible: false,
        mode: 'idle',
        reduced: false,
        changedAt: performance.now(),
      };
      entries.add(entry);
      observer.observe(canvas);
      onReady();
      return {
        update(mode, reduced) {
          if (entry.mode !== mode) entry.changedAt = performance.now();
          entry.mode = mode;
          if (entry.reduced !== reduced) entry.renderedMode = undefined;
          entry.reduced = reduced;
        },
        remove() {
          observer.unobserve(canvas);
          entries.delete(entry);
          entry.figure = null;
          if (!entries.size) {
            observer.disconnect();
            renderer.setAnimationLoop(null);
            factory.dispose();
            renderer.dispose();
            renderer.forceContextLoss();
            pool = null;
          }
        },
      };
    },
  };
}
export function registerEmployeePreview(canvas, worker, onReady) {
  if (!pool) pool = createPool();
  return pool.add(canvas, worker, onReady);
}
