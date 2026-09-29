import * as THREE from 'three';

export function employeeAppearance(worker) {
  let seed = 2166136261;
  for (const char of worker.id) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const colors = {
    research: '#729cc5',
    marketing: '#d9a358',
    creative: '#b693be',
    analytics: '#73a999',
    engineering: '#647fa3',
    operations: '#ae8d72',
    compliance: '#af7d86',
    personal: '#97a566',
  };
  return {
    color: colors[worker.department] || '#729cc5',
    hair: ['#4c332c', '#98603e', '#292b37', '#bd9157', '#715448'][seed % 5],
    style: seed % 3,
    glasses: worker.department === 'research' || seed % 4 === 0,
    headset: worker.department === 'engineering',
    seed,
  };
}

// One factory owns shared geometry/materials for all of its figures.
export function createEmployeeFigureFactory() {
  const geometries = new Map(),
    materials = new Map();
  function geometry(key, make) {
    if (!geometries.has(key)) geometries.set(key, make());
    return geometries.get(key);
  }
  function material(color) {
    if (!materials.has(color))
      materials.set(
        color,
        new THREE.MeshStandardMaterial({ color, roughness: 0.36, metalness: 0.02 }),
      );
    return materials.get(color);
  }
  function mesh(parent, geo, color, x, y, z) {
    const m = new THREE.Mesh(geo, material(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  function box(parent, x, y, z, w, h, d, color) {
    return mesh(
      parent,
      geometry([w, h, d].join('/'), () => new THREE.BoxGeometry(w, h, d)),
      color,
      x,
      y,
      z,
    );
  }
  function cylinder(parent, x, y, z, r, h, color) {
    return mesh(
      parent,
      geometry('c' + r + '/' + h, () => new THREE.CylinderGeometry(r, r, h, 24)),
      color,
      x,
      y,
      z,
    );
  }
  function ring(parent, x, y, z, r, tube, color, start = Math.PI * 2) {
    return mesh(
      parent,
      geometry(
        'r' + r + '/' + tube + '/' + start,
        () => new THREE.TorusGeometry(r, tube, 8, 24, start),
      ),
      color,
      x,
      y,
      z,
    );
  }
  return {
    create(worker) {
      const look = employeeAppearance(worker),
        root = new THREE.Group(),
        head = new THREE.Group(),
        arms = [],
        legs = [];
      const bodyGeo = geometry('torso', () => {
        const shape = new THREE.Shape();
        shape.moveTo(-0.34, 0);
        shape.lineTo(0.34, 0);
        shape.lineTo(0.26, 0.65);
        shape.lineTo(-0.26, 0.65);
        shape.closePath();
        const g = new THREE.ExtrudeGeometry(shape, {
          depth: 0.4,
          bevelEnabled: true,
          bevelSize: 0.025,
          bevelThickness: 0.025,
          bevelSegments: 1,
          steps: 1,
        });
        g.translate(0, 0, -0.2);
        return g;
      });
      mesh(root, bodyGeo, look.color, 0, 0.76, 0);
      box(root, 0, 1.31, 0.227, 0.18, 0.12, 0.024, '#f4e8c9');
      box(root, 0, 1.07, 0.228, 0.028, 0.36, 0.024, '#42566b');
      box(root, 0.19, 1.13, 0.232, 0.13, 0.17, 0.025, '#eee8d6');
      box(root, 0.19, 1.14, 0.25, 0.08, 0.035, 0.01, look.color);
      cylinder(root, 0, 1.46, 0, 0.115, 0.13, '#f5c94f');
      root.add(head);
      head.position.y = 1.73;
      cylinder(head, 0, 0, 0, 0.29, 0.45, '#f5c94f');
      cylinder(head, 0, 0.27, 0, 0.14, 0.12, '#f5c94f');
      box(head, 0, 0.24, -0.025, 0.59, 0.12, 0.53, look.hair);
      if (look.style === 0) {
        box(head, -0.18, 0.17, 0.19, 0.25, 0.16, 0.18, look.hair);
        box(head, 0.22, 0.06, -0.04, 0.1, 0.3, 0.4, look.hair);
      } else if (look.style === 1) {
        box(head, 0, 0.05, -0.24, 0.57, 0.4, 0.14, look.hair);
        box(head, -0.27, 0.01, -0.07, 0.1, 0.46, 0.37, look.hair);
        box(head, 0.27, 0.01, -0.07, 0.1, 0.46, 0.37, look.hair);
      } else {
        box(head, 0.13, 0.2, 0.17, 0.35, 0.15, 0.24, look.hair);
        box(head, -0.23, 0.15, -0.01, 0.13, 0.17, 0.44, look.hair);
      }
      for (const x of [-0.1, 0.1]) {
        const eye = cylinder(head, x, 0.04, 0.285, 0.027, 0.018, '#2d3038');
        eye.rotation.x = Math.PI / 2;
      }
      const smile = ring(head, 0, -0.035, 0.284, 0.102, 0.013, '#71513b', Math.PI);
      smile.rotation.z = Math.PI;
      if (look.glasses) {
        for (const x of [-0.108, 0.108]) ring(head, x, 0.045, 0.302, 0.075, 0.015, '#3e4654');
        box(head, 0, 0.045, 0.311, 0.06, 0.018, 0.012, '#3e4654');
      }
      if (look.headset) {
        box(head, -0.32, 0.03, 0, 0.09, 0.2, 0.18, '#334555');
        box(head, -0.28, -0.07, 0.23, 0.06, 0.05, 0.3, '#334555');
      }
      box(root, 0, 0.69, 0, 0.64, 0.16, 0.38, '#354358');
      for (const side of [-1, 1]) {
        const arm = new THREE.Group();
        arm.position.set(side * 0.37, 1.29, 0);
        root.add(arm);
        const sleeve = box(arm, side * 0.035, -0.18, 0, 0.23, 0.4, 0.3, look.color);
        sleeve.rotation.z = side * 0.1;
        cylinder(arm, 0, -0.42, 0, 0.085, 0.14, '#f5c94f');
        const hand = ring(arm, 0, -0.53, 0.015, 0.092, 0.043, '#f5c94f', Math.PI * 1.55);
        hand.rotation.z = -Math.PI * 0.28;
        arms.push(arm);
        const leg = new THREE.Group();
        leg.position.set(side * 0.17, 0.65, 0);
        root.add(leg);
        box(leg, 0, -0.25, 0, 0.27, 0.5, 0.34, '#354358');
        box(leg, 0, -0.53, 0.085, 0.29, 0.15, 0.5, '#354358');
        legs.push(leg);
      }
      return { root, head, arms, legs, look };
    },
    dispose() {
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      geometries.clear();
      materials.clear();
    },
  };
}

export function poseEmployee(figure, time, mode = 'idle', reducedMotion = false) {
  const { root, head, arms, legs } = figure;
  root.position.y = 0;
  root.rotation.set(0, 0, 0);
  root.scale.setScalar(1);
  head.rotation.set(0, 0, 0);
  arms.forEach((a, i) => a.rotation.set(0, 0, i === 0 ? 0.06 : -0.06));
  legs.forEach((l) => l.rotation.set(0, 0, 0));
  if (reducedMotion) return;
  if (mode === 'drag' || mode === 'waiting') {
    root.position.y = 0.12;
    root.rotation.z = Math.sin(time * 5) * 0.1;
    root.rotation.y = Math.sin(time * 2) * 0.18;
    arms[0].rotation.z = -2.55;
    arms[1].rotation.z = 2.55;
    legs[0].rotation.x = Math.sin(time * 8) * 0.35;
    legs[1].rotation.x = -Math.sin(time * 8) * 0.35;
    head.rotation.z = -root.rotation.z * 0.5;
  } else if (mode === 'hover') {
    root.rotation.y = Math.sin(time * 1.8) * 0.18;
    root.position.y = Math.abs(Math.sin(time * 3)) * 0.045;
    arms[1].rotation.z = 2.1 + Math.sin(time * 8) * 0.22;
    arms[1].rotation.x = -0.3;
    head.rotation.z = -0.08;
    legs[0].rotation.x = Math.sin(time * 3) * 0.045;
  } else if (mode === 'landing') {
    const progress = Math.min(1, Math.max(0, time));
    root.position.y = Math.sin(progress * Math.PI) * 0.32;
    root.scale.set(
      1 + Math.sin(progress * Math.PI) * 0.08,
      1 - Math.sin(progress * Math.PI) * 0.08,
      1,
    );
    arms[0].rotation.z = -0.5;
    arms[1].rotation.z = 0.5;
  } else {
    head.rotation.y = Math.sin(time * 0.85 + (figure.look.seed % 7)) * 0.08;
    arms[0].rotation.x = Math.sin(time * 1.4) * 0.035;
    arms[1].rotation.x = -arms[0].rotation.x;
  }
}
