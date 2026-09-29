import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { findRoute, PLACES } from './navigation.js';

export function createOfficeWorld(host, callbacks) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#e8e3da');
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: 'low-power',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.23;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute(
    'aria-label',
    'Interactive block-built office. Click Scout, Quinn, or the boss’s chamber. Drag to rotate; scroll to zoom.',
  );
  const camera = new THREE.OrthographicCamera(-18, 18, 13, -13, 0.1, 240);
  camera.position.set(46, 56, 60);
  camera.lookAt(0, 0, -12);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, -12);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = true;
  controls.minZoom = 0.65;
  controls.maxZoom = 2;
  controls.minPolarAngle = 0.25;
  controls.maxPolarAngle = Math.PI * 0.39;
  controls.minAzimuthAngle = -0.2;
  controls.maxAzimuthAngle = 1.3;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };
  scene.add(new THREE.HemisphereLight(0xfff8ee, 0x79889b, 2.6));
  const sun = new THREE.DirectionalLight(0xfff0d7, 4);
  sun.position.set(-12, 25, 15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -22,
    right: 22,
    top: 22,
    bottom: -22,
    near: 1,
    far: 70,
  });
  sun.shadow.normalBias = 0.04;
  sun.shadow.bias = -0.0003;
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xc5d1ff, 1);
  fill.position.set(14, 12, -10);
  scene.add(fill);
  const materials = new Map(),
    geometries = new Map(),
    textures = [];
  function mat(color, extra = {}) {
    const key = color + JSON.stringify(extra);
    if (!materials.has(key))
      materials.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.65, ...extra }));
    return materials.get(key);
  }
  function geometry(w, h, d) {
    const key = `${w}/${h}/${d}`;
    if (!geometries.has(key)) geometries.set(key, new THREE.BoxGeometry(w, h, d));
    return geometries.get(key);
  }
  function box(parent, x, y, z, w, h, d, color, extra = {}) {
    const m = new THREE.Mesh(geometry(w, h, d), mat(color, extra));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function cylinder(parent, x, y, z, r, h, color, segments = 12) {
    const g = new THREE.CylinderGeometry(r, r, h, segments);
    geometries.set(`c${geometries.size}`, g);
    const m = new THREE.Mesh(g, mat(color));
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function group(x = 0, y = 0, z = 0) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    scene.add(g);
    return g;
  }
  function canvasTexture(text, bg = '#2d3449', fg = '#fcf4d9', width = 512, height = 160) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = fg;
    ctx.font = `bold ${height * 0.33}px -apple-system,Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, width / 2, height / 2, width - 35);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.push(texture);
    return texture;
  }
  function sign(parent, text, x, y, z, w = 3, h = 0.75, bg, fg) {
    const m = box(parent, x, y, z, w, h, 0.08, bg || '#2d3449');
    const front = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.95, h * 0.9),
      new THREE.MeshBasicMaterial({ map: canvasTexture(text, bg, fg) }),
    );
    front.position.z = 0.046;
    m.add(front);
    return m;
  }
  const interactives = [];
  function selectable(object, id) {
    object.userData.select = id;
    interactives.push(object);
  }
  function plant(x, z, scale = 1) {
    const p = group(x, 0, z);
    p.scale.setScalar(scale);
    cylinder(p, 0, 0.3, 0, 0.33, 0.6, '#d99b73');
    cylinder(p, 0, 0.62, 0, 0.28, 0.1, '#725144');
    box(p, 0, 1, 0, 0.08, 0.9, 0.08, '#55764e');
    for (let i = 0; i < 5; i++) {
      const a = i * 2.4;
      const leaf = box(
        p,
        Math.cos(a) * 0.23,
        1 + i * 0.14,
        Math.sin(a) * 0.23,
        0.52,
        0.12,
        0.32,
        i % 2 ? '#91ab67' : '#648454',
      );
      leaf.rotation.z = Math.cos(a) * 0.55;
      leaf.rotation.y = a;
    }
  }
  function mug(parent, x, y, z, color = '#f8ead2') {
    cylinder(parent, x, y + 0.16, z, 0.15, 0.3, color);
    cylinder(parent, x, y + 0.316, z, 0.115, 0.008, '#644734');
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.04, 6, 12), mat(color));
    ring.position.set(x + 0.16, y + 0.16, z);
    parent.add(ring);
    geometries.set(`ring${geometries.size}`, ring.geometry);
  }
  function papers(parent, x, y, z) {
    for (let i = 0; i < 3; i++) {
      const p = box(parent, x + i * 0.025, y + i * 0.04, z, 0.53, 0.025, 0.65, '#fff6d9');
      p.rotation.y = -0.1 + i * 0.08;
    }
    box(parent, x, y + 0.14, z - 0.1, 0.35, 0.012, 0.035, '#c5b99d');
    box(parent, x, y + 0.14, z + 0.02, 0.35, 0.012, 0.035, '#c5b99d');
  }
  const root = group();
  // The office is a cutaway toy building on a studded baseplate.
  box(root, 0, -0.5, 0, 25, 0.65, 18, '#8b9d91');
  box(root, 0, -0.15, 0, 24, 0.18, 17, '#c3b69b');
  const studGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.08, 8);
  geometries.set('studs', studGeo);
  const positions = [];
  for (let x = -12; x <= 12; x += 0.65)
    for (let z = -8.6; z <= 8.6; z += 0.65)
      if (Math.abs(x) > 11.8 || Math.abs(z) > 8.05) positions.push([x, -0.105, z]);
  const studs = new THREE.InstancedMesh(studGeo, mat('#9eafa0'), positions.length);
  const matrix = new THREE.Matrix4();
  positions.forEach((p, i) => {
    matrix.setPosition(...p);
    studs.setMatrixAt(i, matrix);
  });
  root.add(studs);
  // Individual floor tiles give the room its buildable, miniature character.
  const tileSets = new Map();
  for (let x = -11.5; x <= 11.5; x += 1)
    for (let z = -7.5; z <= 7.5; z += 1) {
      const color =
        x > 3 && z < 1
          ? (x + z) % 2 === 0
            ? '#b7c4cc'
            : '#bdc9d0'
          : z > 3
            ? '#dbcaad'
            : Math.round(x + z) % 3 === 0
              ? '#eee6d3'
              : '#e8dfca';
      if (!tileSets.has(color)) tileSets.set(color, []);
      tileSets.get(color).push([x, -0.01, z]);
    }
  for (const [color, tiles] of tileSets) {
    const mesh = new THREE.InstancedMesh(geometry(0.987, 0.1, 0.987), mat(color), tiles.length);
    tiles.forEach((p, i) => {
      matrix.setPosition(...p);
      mesh.setMatrixAt(i, matrix);
    });
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  box(root, 0, 1.7, -8.2, 24.4, 3.5, 0.35, '#b1bdcc');
  box(root, -12.1, 1.7, 0, 0.35, 3.5, 16.4, '#c7ced4');
  box(root, 0, 3.49, -8.2, 24.5, 0.15, 0.47, '#7e8d9f');
  box(root, -12.1, 3.49, 0, 0.47, 0.15, 16.4, '#8e9caf');
  box(root, 0, 0.14, 8.2, 24.4, 0.3, 0.3, '#c4b99d');
  box(root, 12.1, 0.14, 0, 0.3, 0.3, 16.4, '#c4b99d');
  // Blue sky windows, frame grids, and daylight strips.
  for (const x of [-8, -2, 7]) {
    box(root, x, 2, -7.99, 3.7, 2.3, 0.06, '#b6d5e6', {
      emissive: '#aac8e4',
      emissiveIntensity: 0.15,
    });
    box(root, x, 2, -7.9, 0.1, 2.4, 0.12, '#eef1ec');
    box(root, x, 2, -7.9, 3.8, 0.1, 0.12, '#eef1ec');
    box(root, x, 0.78, -7.87, 4, 0.18, 0.48, '#e7e6dc');
  }
  sign(root, 'BUTLER & CO.', -8, 3, -7.83, 3, 0.62, '#344b61', '#fff4d5');
  // Boss's chamber: a glass partition with a real doorway opening.
  box(root, 3, 1.15, -4.9, 0.12, 2.3, 6.2, '#b5c7cd', {
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
  });
  for (const z of [-8, -5, -1.8]) box(root, 3, 1.3, z, 0.13, 2.6, 0.13, '#748798');
  box(root, 3, 2.58, -4.9, 0.15, 0.14, 6.4, '#748798');
  for (const x of [6, 9, 11.9]) box(root, x, 1.05, 1, 0.12, 2.1, 0.12, '#7f909d');
  box(root, 9, 1.05, 1, 5.9, 2.1, 0.06, '#bbd0d6', {
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  box(root, 9, 2.15, 1, 6, 0.12, 0.15, '#8b9aa7');
  sign(root, 'THE BOSS', 7, 3, -7.86, 2.8, 0.58, '#384b62', '#f5d997');
  // Monitors show the actual worker's task, not a fake publishing success.
  const monitors = {};
  function desk(x, z, id, color) {
    const d = group(x, 0, z);
    box(d, 0, 1.17, 0, 3.6, 0.23, 1.65, color);
    for (const a of [-1.45, 1.45]) box(d, a, 0.56, 0.05, 0.2, 1.12, 1.25, '#536270');
    box(d, -0.5, 1.72, -0.25, 1.45, 0.95, 0.16, '#313849');
    box(d, -0.5, 1.3, -0.25, 0.12, 0.25, 0.13, '#606575');
    box(d, -0.5, 1.3, -0.22, 0.65, 0.055, 0.4, '#647080');
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 320;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.push(texture);
    const monitor = new THREE.Mesh(
      new THREE.PlaneGeometry(1.3, 0.77),
      new THREE.MeshBasicMaterial({ map: texture }),
    );
    monitor.position.set(-0.5, 1.73, -0.159);
    d.add(monitor);
    monitors[id] = { canvas, texture, last: '' };
    box(d, -0.5, 1.31, 0.46, 1.15, 0.065, 0.35, '#e6e8e2');
    for (let i = 0; i < 8; i++) box(d, -0.95 + i * 0.13, 1.35, 0.47, 0.075, 0.009, 0.2, '#afbbc1');
    box(d, 0.4, 1.3, 0.4, 0.18, 0.06, 0.27, '#d4d9d8');
    papers(d, 1.13, 1.31, -0.12);
    mug(d, 1.25, 1.29, 0.48);
    selectable(d, id);
    return d;
  }
  desk(-7, -3, 'researcher', '#d4ad79');
  desk(-1, -4.5, 'manager', '#d4ad79');
  desk(7, -5, 'boss', '#b98c59');
  function chair(x, z, color) {
    const c = group(x, 0, z);
    cylinder(c, 0, 0.12, 0, 0.5, 0.09, '#525e6d');
    box(c, 0, 0.45, 0, 0.1, 0.65, 0.1, '#566273');
    box(c, 0, 0.74, 0, 0.85, 0.17, 0.8, color);
    box(c, 0, 1.17, -0.37, 0.86, 0.8, 0.15, color);
    for (const a of [-0.48, 0.48]) box(c, a, 0.96, 0, 0.09, 0.1, 0.55, '#657084');
    return c;
  }
  chair(-7, -1.45, '#698397').rotation.y = Math.PI;
  chair(-1, -2.8, '#a18aa8').rotation.y = Math.PI;
  chair(7, -6.5, '#4c5d78');
  // Research pinboard and filing storage.
  const board = group(-11.87, 0, -3.8);
  box(board, 0, 1.85, 0, 0.13, 1.65, 2.3, '#b6a583');
  for (let i = 0; i < 6; i++)
    box(
      board,
      0.08,
      1.42 + Math.floor(i / 3) * 0.62,
      -0.7 + (i % 3) * 0.67,
      0.015,
      0.45,
      0.46,
      ['#fae5a6', '#dbe7d4', '#f1c3b0'][i % 3],
    );
  for (const x of [-10.8, -9.6]) {
    box(root, x, 0.68, -6.5, 1.05, 1.35, 1, '#889897');
    for (let i = 0; i < 3; i++) {
      box(root, x, 0.24 + i * 0.43, -5.99, 0.9, 0.37, 0.04, '#a3b0a9');
      box(root, x, 0.26 + i * 0.43, -5.95, 0.28, 0.06, 0.03, '#ece9db');
    }
  }
  // A coffee nook with cupboards, espresso machine, mugs and a wall clock.
  const kitchen = group(-10.7, 0, 4.7);
  box(kitchen, 0, 0.6, 0, 1.35, 1.2, 4.1, '#8b9c8f');
  box(kitchen, 0, 1.24, 0, 1.55, 0.14, 4.3, '#f1e5cc');
  for (const z of [-1.3, 0, 1.3]) {
    box(kitchen, 0.71, 0.68, z, 0.04, 0.9, 1.14, '#a7b6a2');
    box(kitchen, 0.745, 0.83, z, 0.05, 0.08, 0.29, '#dcdbcc');
  }
  box(kitchen, 0, 1.77, -0.9, 0.95, 1, 0.8, '#3d4752');
  box(kitchen, 0.49, 1.88, -0.9, 0.035, 0.32, 0.45, '#b8c9c9');
  box(kitchen, 0.5, 1.47, -0.9, 0.06, 0.07, 0.74, '#788c90');
  cylinder(kitchen, 0, 2.3, -0.9, 0.31, 0.2, '#554330');
  mug(kitchen, 0.4, 1.33, 0.6);
  mug(kitchen, 0.15, 1.33, 1.4, '#dba079');
  sign(root, 'COFFEE CLUB', -10.1, 2.7, 6.8, 2.4, 0.6, '#617264', '#fff2d5').rotation.y =
    Math.PI * 0.5;
  const clock = group(-11.87, 2.7, 2);
  const dial = cylinder(clock, 0, 0, 0, 0.42, 0.1, '#f5edd7');
  dial.rotation.z = Math.PI / 2;
  box(clock, 0.07, 0, 0, 0.035, 0.47, 0.035, '#45556a');
  box(clock, 0.075, -0.08, 0.1, 0.04, 0.04, 0.28, '#45556a');
  // Break area, couch and a little communal table.
  box(root, -1, 0.07, 5.5, 5.8, 0.06, 4, '#bdafa6');
  const sofa = group(-1.5, 0, 6.9);
  box(sofa, 0, 0.44, 0, 3.4, 0.75, 1.1, '#c7977b');
  box(sofa, 0, 1, -0.45, 3.4, 0.8, 0.3, '#d3a487');
  for (const x of [-1.62, 1.62]) box(sofa, x, 0.76, 0, 0.25, 1, 0.95, '#bb8f77');
  for (const x of [-0.9, 0, 0.9]) box(sofa, x, 0.86, 0.05, 0.84, 0.15, 0.75, '#dab29a');
  box(root, -1.2, 0.6, 4.6, 2.4, 0.18, 1.25, '#eed9b0');
  for (const x of [-2.1, -0.3]) box(root, x, 0.28, 4.6, 0.13, 0.6, 0.85, '#ac957d');
  papers(root, -1, 0.72, 4.5);
  mug(root, -2, 0.72, 4.8);
  // Boss's bookshelf, awards and visitor seats.
  const shelf = group(10.7, 0, -5);
  box(shelf, 0, 1.15, 0, 1.5, 2.3, 1, '#d2ad79');
  for (const y of [0.16, 0.9, 1.64]) {
    box(shelf, 0, y, 0, 1.4, 0.12, 1.1, '#8d775c');
    for (let i = 0; i < 5; i++)
      box(
        shelf,
        -0.55 + i * 0.22,
        y + 0.35,
        0.1,
        0.14,
        0.54,
        0.57,
        ['#597582', '#da956b', '#e4cc8e', '#889279', '#b09bae'][i],
      );
  }
  cylinder(root, 10.7, 2.62, -5, 0.19, 0.6, '#dbb350');
  box(root, 10.7, 2.32, -5, 0.6, 0.12, 0.5, '#596476');
  plant(-10.5, -7.1, 1.25);
  plant(10.7, -7.1, 1.05);
  plant(10.7, 0, 1.2);
  plant(2, 6.7, 1.3);
  plant(-10.5, 7, 1);
  // Delivery counter: a visible place to exchange the research folder.
  box(root, -3.45, 0.72, 0.3, 1.1, 1.4, 0.8, '#829598');
  box(root, -3.45, 1.46, 0.3, 1.2, 0.1, 0.86, '#bbc9be');
  papers(root, -3.45, 1.54, 0.3);
  sign(root, 'RESEARCH', -7, 2.85, -7.84, 2.3, 0.49, '#4f6a81', '#f2eddc');
  sign(root, 'SOCIAL STUDIO', -1, 2.9, -7.83, 3.2, 0.5, '#786581', '#f8eadb');
  function minifigure(id, color, hair) {
    const person = new THREE.Group();
    scene.add(person);
    const body = box(person, 0, 1.03, 0, 0.64, 0.65, 0.39, color);
    box(person, 0, 1.12, 0.205, 0.14, 0.34, 0.018, '#f2e5c8');
    box(person, 0, 0.97, 0.22, 0.065, 0.26, 0.02, id === 'boss' ? '#9f7358' : '#496273');
    const head = new THREE.Group();
    head.position.y = 1.62;
    person.add(head);
    cylinder(head, 0, 0, 0, 0.285, 0.43, '#f1c956', 16);
    cylinder(head, 0, 0.26, 0, 0.15, 0.1, '#edc34e');
    for (const x of [-0.1, 0.1]) box(head, x, 0.035, 0.274, 0.038, 0.045, 0.012, '#414048');
    box(head, 0, -0.095, 0.283, 0.12, 0.024, 0.018, '#644b39');
    box(head, -0.071, -0.073, 0.276, 0.021, 0.035, 0.015, '#644b39');
    box(head, 0.071, -0.073, 0.276, 0.021, 0.035, 0.015, '#644b39');
    box(head, 0, 0.21, -0.03, 0.56, 0.15, 0.49, hair);
    box(head, -0.19, 0.14, 0.17, 0.22, 0.17, 0.18, hair);
    box(head, 0.19, 0.13, -0.16, 0.18, 0.22, 0.25, hair);
    if (id === 'manager') {
      box(head, -0.27, -0.035, -0.05, 0.13, 0.42, 0.44, hair);
      box(head, 0.27, -0.035, -0.05, 0.13, 0.42, 0.44, hair);
      box(head, 0, -0.08, -0.24, 0.52, 0.42, 0.1, hair);
    }
    const arms = [],
      legs = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(side * 0.43, 1.29, 0);
      person.add(arm);
      box(arm, 0, -0.22, 0, 0.22, 0.48, 0.25, color);
      cylinder(arm, 0, -0.53, 0.01, 0.115, 0.2, '#f1c956');
      arms.push(arm);
      const leg = new THREE.Group();
      leg.position.set(side * 0.175, 0.7, 0);
      person.add(leg);
      box(leg, 0, -0.26, 0, 0.28, 0.52, 0.29, '#445266');
      box(leg, 0, -0.51, 0.06, 0.29, 0.13, 0.44, '#3b4353');
      legs.push(leg);
    }
    const folder = new THREE.Group();
    arms[1].add(folder);
    box(folder, 0.1, -0.48, 0.2, 0.57, 0.64, 0.095, '#ebbc58');
    box(folder, 0.04, -0.13, 0.2, 0.32, 0.09, 0.1, '#e7b24b');
    box(folder, 0.1, -0.43, 0.258, 0.37, 0.43, 0.015, '#fff2d3');
    box(folder, 0.1, -0.32, 0.27, 0.22, 0.024, 0.01, '#b9ae90');
    box(folder, 0.1, -0.42, 0.27, 0.22, 0.024, 0.01, '#b9ae90');
    folder.rotation.z = -0.17;
    folder.visible = false;
    const cup = new THREE.Group();
    arms[0].add(cup);
    mug(cup, 0, -0.54, 0.19);
    cup.visible = false;
    selectable(person, id);
    const label = document.createElement('button');
    label.className = `world-person-label person-${id}`;
    label.type = 'button';
    label.innerHTML = `<span class="person-dot"></span><strong>${id === 'researcher' ? 'Scout' : id === 'manager' ? 'Quinn' : 'You'}</strong><small></small>`;
    label.setAttribute(
      'aria-label',
      id === 'boss' ? 'Open boss chamber' : `Talk to ${id === 'researcher' ? 'Scout' : 'Quinn'}`,
    );
    label.onclick = () => callbacks.onSelect(id);
    host.appendChild(label);
    return {
      id,
      object: person,
      head,
      arms,
      legs,
      folder,
      cup,
      label,
      path: [],
      destination: '',
      mode: 'idle',
      timer: 0,
      pose: 0,
      job: false,
    };
  }
  const actors = {
    researcher: minifigure('researcher', '#7392b7', '#9e6841'),
    manager: minifigure('manager', '#ad8dad', '#493b43'),
    boss: minifigure('boss', '#46647d', '#625246'),
  };
  actors.researcher.object.position.set(-7, 0, -1.7);
  actors.manager.object.position.set(-1, 0, -3);
  actors.boss.object.position.set(7, 0.16, -6.45);
  for (const id of ['researcher', 'manager']) {
    actors[id].object.visible = false;
    actors[id].label.style.display = 'none';
  }
  const labels = [];
  for (const [text, x, z, action] of [
    ['YOUR CHAMBER', 7, -4, 'boss'],
    ['RESEARCH DESK', -7, -3, 'researcher'],
    ['SOCIAL STUDIO', -1, -4.5, 'manager'],
    ['THE COFFEE CLUB', -8.7, 5, 'coffee'],
  ]) {
    const el = document.createElement('button');
    el.className = 'room-world-label';
    el.textContent = text;
    el.onclick = () => callbacks.onSelect(action);
    host.appendChild(el);
    labels.push({ el, position: new THREE.Vector3(x, 0.12, z + 2) });
  }
  // Department wings use lightweight, shared geometry. Only deployed employees
  // occupy desks; the reserve lounge represents benched staff without crowding the floor.
  const departments = new Map(),
    staff = new Map();
  function updateCampus(next) {
    (next.departments || []).forEach((dept, index) => {
      let room = departments.get(dept.id);
      if (!room) {
        const x = ((index % 4) - 1.5) * 14,
          z = -18 - Math.floor(index / 4) * 16;
        const floor = group(x, 0, z);
        box(floor, 0, -0.3, 0, 13, 0.5, 14, '#a3aa99');
        box(floor, 0, 0, 0, 12.6, 0.13, 13.6, '#e4ddca');
        box(floor, 0, 0.48, -6.5, 12.5, 0.85, 0.22, dept.color);
        box(floor, -6.2, 0.48, 0, 0.22, 0.85, 13, dept.color);
        box(floor, 6.2, 0.48, 0, 0.22, 0.85, 13, dept.color);
        // A shared discussion table and whiteboard make each wing usable even
        // before the CEO deploys its specialist team.
        box(floor, 0, 0.72, 3.5, 5.2, 0.18, 1.5, '#b59a75');
        box(floor, -1.8, 0.34, 3.5, 0.18, 0.7, 0.7, '#777b70');
        box(floor, 1.8, 0.34, 3.5, 0.18, 0.7, 0.7, '#777b70');
        for (const cx of [-1.6, 0, 1.6])
          for (const cz of [2.2, 4.8]) {
            box(floor, cx, 0.42, cz, 0.7, 0.18, 0.65, dept.color);
            box(floor, cx, 0.8, cz + (cz > 3 ? 0.3 : -0.3), 0.7, 0.75, 0.12, dept.color);
          }
        box(floor, 0, 1.4, -6.2, 4.4, 1.5, 0.13, '#f6f1df');
        for (let line = 0; line < 3; line++)
          box(floor, -0.5, 1.8 - line * 0.34, -6.11, 2.5 - line * 0.4, 0.07, 0.02, dept.color);
        const el = document.createElement('button');
        el.className = 'room-world-label department-world-label';
        const name = document.createElement('strong'),
          count = document.createElement('small');
        name.textContent = dept.name;
        el.append(name, count);
        el.onclick = () => callbacks.onSelect(`department:${dept.id}`);
        host.appendChild(el);
        labels.push({ el, position: new THREE.Vector3(x, 0.4, z + 6.2) });
        room = { x, z, floor, el, count };
        departments.set(dept.id, room);
      }
      const employees = (next.workers || []).filter((w) => w.department === dept.id);
      const deployed = employees.filter((w) => w.deployment === 'deployed');
      room.count.textContent = `${deployed.length} in office · ${employees.filter((w) => w.deployment === 'bench').length} on bench`;
      deployed
        .filter((w) => !['researcher', 'manager'].includes(w.id))
        .forEach((worker, slot) => {
          let person = staff.get(worker.id);
          if (!person) {
            const object = group();
            const deskTop = box(object, 0, 0.7, -0.65, 1.35, 0.12, 0.65, '#ba9872');
            box(object, 0, 0.96, -0.72, 0.65, 0.46, 0.09, '#405066');
            box(object, 0, 0.82, 0.18, 0.48, 0.62, 0.34, dept.color);
            cylinder(object, 0, 1.38, 0.18, 0.23, 0.4, '#f1c956');
            box(object, 0, 1.62, 0.18, 0.46, 0.12, 0.4, '#6c5340');
            box(object, -0.15, 0.32, 0.18, 0.19, 0.4, 0.24, '#42516a');
            box(object, 0.15, 0.32, 0.18, 0.19, 0.4, 0.24, '#42516a');
            selectable(object, `worker:${worker.id}`);
            person = { object, deskTop };
            staff.set(worker.id, person);
          }
          person.object.position.set(
            room.x + ((slot % 6) - 2.5) * 1.95,
            0,
            room.z - 4.7 + Math.floor(slot / 6) * 1.9,
          );
          person.object.visible = true;
          person.deskTop.material = mat(
            worker.activity.status === 'working' ? '#94b995' : '#ba9872',
          );
        });
    });
    const deployedIds = new Set(
      (next.workers || []).filter((w) => w.deployment === 'deployed').map((w) => w.id),
    );
    for (const [id, person] of staff) person.object.visible = deployedIds.has(id);
    for (const id of ['researcher', 'manager']) {
      const worker = next.workers?.find((w) => w.id === id);
      actors[id].object.visible = !worker || worker.deployment === 'deployed';
      actors[id].label.style.display = actors[id].object.visible ? '' : 'none';
    }
    reserveCount.textContent = `${(next.workers || []).filter((w) => w.deployment === 'bench').length} employees ready to redeploy`;
  }
  const reserve = group(20, 0, 4);
  box(reserve, 0, -0.3, 0, 13, 0.5, 9, '#a3aa99');
  box(reserve, 0, 0, 0, 12.6, 0.13, 8.6, '#ddcfb4');
  for (const z of [-2, 1]) {
    box(reserve, 0, 0.45, z, 8, 0.35, 0.9, '#b18f6a');
    box(reserve, 0, 0.95, z - 0.4, 8, 0.8, 0.15, '#a08263');
  }
  const reserveLabel = document.createElement('button'),
    reserveCount = document.createElement('small');
  reserveLabel.className = 'room-world-label department-world-label';
  reserveLabel.textContent = 'THE BENCH · RESERVE TEAM';
  reserveLabel.append(reserveCount);
  reserveLabel.onclick = () => callbacks.onSelect('workers');
  host.appendChild(reserveLabel);
  labels.push({ el: reserveLabel, position: new THREE.Vector3(20, 0.2, 8) });
  let state = null,
    lastScene = 0,
    initialized = false,
    queue = [],
    routine = null,
    activeApproval = null,
    disposed = false,
    mutedMotion = false,
    frameTime = 0,
    lastRender = 0,
    lastReport = 0,
    previousBossState = '';
  const move = (id, destination, mode = 'walking', carry = false) => {
    const a = actors[id];
    a.path = findRoute([a.object.position.x, a.object.position.z], destination);
    a.destination = destination;
    a.mode = mode;
    a.folder.visible = carry;
    a.cup.visible = false;
  };
  const at = (id) => actors[id].path.length === 0;
  const setRoutine = (steps, title) => {
    routine = { steps, index: 0, started: false, wait: 0, title };
  };
  function stepsFor(event) {
    if (event.action === 'handoff')
      return [
        {
          move: 'researcher',
          to: 'leftHandoff',
          carry: true,
          text: 'Taking the research file to Quinn',
        },
        { move: 'manager', to: 'rightHandoff', text: 'Meeting Scout for the handoff' },
        { wait: 1.8, mode: 'handoff' },
        { move: 'researcher', to: 'scout', text: 'Research delivered' },
        { move: 'manager', to: 'quinn', carry: true, text: 'Taking the file to the writing desk' },
        { wait: 2.2, mode: 'writing' },
      ];
    if (event.action === 'approval' || event.action === 'attention')
      return [
        {
          move: 'manager',
          to: 'boss',
          carry: true,
          text:
            event.action === 'attention'
              ? 'Something needs your attention, boss'
              : 'The draft is ready. Visiting the boss',
        },
        { wait: 1, mode: 'approval', draftId: event.draftId },
      ];
    if (event.action === 'approved' || event.action === 'publish')
      return [
        {
          move: 'manager',
          to: 'quinn',
          carry: true,
          text: 'Approved! Back to the publishing computer',
        },
        { wait: 2.8, mode: 'publishing' },
      ];
    if (event.action === 'rewrite')
      return [
        { move: 'manager', to: 'quinn', carry: true, text: 'Working on your editorial feedback' },
        { wait: 1, mode: 'writing' },
      ];
    if (event.action === 'published')
      return [
        { move: 'manager', to: 'quinn', text: 'Post published. Receipt saved' },
        { wait: 2, mode: 'celebrating' },
      ];
    if (event.action === 'research')
      return [
        { move: 'researcher', to: 'scout', text: 'Opening the latest source announcements' },
        { wait: 0.5, mode: 'researching', actor: 'researcher' },
      ];
    return [];
  }
  function update(next) {
    state = next;
    updateCampus(next);
    if (!initialized) {
      lastScene = next.scenes?.at(-1)?.id || 0;
      initialized = true;
      const review = next.drafts.find((d) =>
        ['review', 'attention', 'approved'].includes(d.status),
      );
      if (review) queue.push({ action: 'approval', draftId: review.id, title: review.title });
    } else
      for (const event of next.scenes || [])
        if (event.id > lastScene) {
          queue.push(event);
          lastScene = event.id;
        }
    // A response clears the waiting visitor even if the action was performed in another tab.
    if (
      activeApproval &&
      !next.drafts.some(
        (d) => d.id === activeApproval && ['review', 'attention'].includes(d.status),
      )
    ) {
      activeApproval = null;
    }
    for (const id of ['researcher', 'manager']) {
      const a = actors[id];
      a.job = next.agents[id]?.status === 'working';
    }
  }
  function monitor(id, text) {
    const m = monitors[id];
    if (m.last === text) return;
    m.last = text;
    const c = m.canvas.getContext('2d');
    c.fillStyle = '#243449';
    c.fillRect(0, 0, 512, 320);
    c.fillStyle = '#344860';
    c.fillRect(0, 0, 512, 40);
    ['#d58b7b', '#dfbc70', '#94b39b'].forEach((color, i) => {
      c.fillStyle = color;
      c.beginPath();
      c.arc(22 + i * 22, 20, 6, 0, Math.PI * 2);
      c.fill();
    });
    c.fillStyle = '#e9eadb';
    c.font = 'bold 28px Arial';
    c.fillText(
      id === 'researcher'
        ? 'SCOUT / RESEARCH'
        : id === 'manager'
          ? 'QUINN / SOCIAL'
          : 'THE BOSS’S OFFICE',
      24,
      91,
    );
    c.fillStyle = '#b4cbbb';
    c.font = '22px Arial';
    c.fillText(text.slice(0, 33), 24, 134);
    if (id === 'manager') {
      c.fillStyle = '#8aabd4';
      c.fillRect(26, 167, 150, 45);
      c.fillStyle = '#182638';
      c.font = 'bold 22px Arial';
      c.fillText('in  LinkedIn', 37, 197);
      c.fillStyle = '#d4d0df';
      c.fillRect(194, 167, 105, 45);
      c.fillStyle = '#273445';
      c.fillText('X', 234, 197);
    }
    for (let i = 0; i < 3; i++) {
      c.fillStyle = i === 0 ? '#8caab3' : '#5c7183';
      c.fillRect(26, 239 + i * 20, 300 - i * 51, 7);
    }
    m.texture.needsUpdate = true;
  }
  function runRoutine(dt) {
    if (!routine && queue.length) {
      const event = queue.shift();
      if (
        ['approval', 'attention'].includes(event.action) &&
        !state?.drafts.some(
          (d) => d.id === event.draftId && ['review', 'attention'].includes(d.status),
        )
      )
        return;
      activeApproval = null;
      setRoutine(stepsFor(event), event.title);
    }
    if (!routine) return;
    const step = routine.steps[routine.index];
    if (!step) {
      routine = null;
      return;
    }
    if (!routine.started) {
      routine.started = true;
      if (step.move) {
        move(step.move, step.to, 'walking', step.carry);
        actors[step.move].message = step.text;
      } else {
        routine.wait = step.wait;
        if (step.mode === 'handoff') {
          actors.researcher.folder.visible = false;
          actors.manager.folder.visible = true;
          actors.researcher.mode = 'handoff';
          actors.manager.mode = 'handoff';
          actors.researcher.object.rotation.y = Math.PI / 2;
          actors.manager.object.rotation.y = -Math.PI / 2;
        } else {
          const worker = actors[step.actor || 'manager'];
          worker.mode = step.mode;
          worker.message =
            step.mode === 'researching'
              ? 'Reading the latest source announcements'
              : step.mode === 'approval'
                ? 'Boss, could you review this?'
                : step.mode === 'publishing'
                  ? 'Checking the publishing queue…'
                  : 'Polishing the story';
          if (step.mode === 'approval') {
            activeApproval = step.draftId;
            callbacks.onApproval?.(step.draftId);
          }
        }
      }
    }
    if (step.move ? at(step.move) : (routine.wait -= dt) <= 0) {
      routine.index++;
      routine.started = false;
    }
  }
  function idle(a, dt) {
    if (routine || queue.length) return;
    if (a.id === 'manager' && activeApproval) {
      a.mode = 'approval';
      a.message = 'Waiting for your decision';
      a.folder.visible = true;
      return;
    }
    if (a.job) {
      const destination = a.id === 'researcher' ? 'scout' : 'quinn';
      if (a.destination !== destination) move(a.id, destination);
      if (at(a.id)) {
        a.mode = state?.agents[a.id]?.phase || 'working';
        a.message =
          a.id === 'researcher' ? 'Researching the latest news' : 'Writing & checking sources';
        a.folder.visible = false;
      }
      return;
    }
    if (!a.path.length && ['scout', 'quinn'].includes(a.destination)) {
      a.mode = 'idle';
      a.message = 'At my desk · ready for work';
      a.folder.visible = false;
    }
    a.timer -= dt;
    if (a.path.length || a.timer > 0) return;
    if (['coffee', 'lounge', 'window'].includes(a.destination)) {
      move(a.id, a.id === 'researcher' ? 'scout' : 'quinn');
      a.message = 'Back to my desk';
      a.timer = 12 + Math.random() * 9;
    } else {
      const dest =
        a.id === 'researcher'
          ? Math.random() > 0.45
            ? 'coffee'
            : 'window'
          : Math.random() > 0.5
            ? 'lounge'
            : 'coffee';
      move(a.id, dest);
      a.message =
        dest === 'coffee'
          ? 'A well-earned coffee break'
          : dest === 'lounge'
            ? 'Taking five in the lounge'
            : 'Stretching my legs';
      a.timer = 16 + Math.random() * 8;
    }
  }
  actors.researcher.timer = 5;
  actors.manager.timer = 11;
  function animateActor(a, t, dt) {
    const moving = a.path.length > 0;
    if (moving) {
      const [x, z] = a.path[0],
        dx = x - a.object.position.x,
        dz = z - a.object.position.z,
        len = Math.hypot(dx, dz),
        step = Math.min(len, dt * 3.2);
      if (len < 0.055) a.path.shift();
      else {
        a.object.position.x += (dx / len) * step;
        a.object.position.z += (dz / len) * step;
        a.object.rotation.y = Math.atan2(dx, dz);
      }
    } else if (['scout', 'quinn'].includes(a.destination)) a.object.rotation.y = Math.PI;
    else if (a.destination === 'boss') a.object.rotation.y = Math.PI;
    a.object.position.y = moving && !mutedMotion ? Math.abs(Math.sin(t * 10)) * 0.045 : 0;
    const walk = moving && !mutedMotion ? Math.sin(t * 10) * 0.55 : 0;
    a.legs[0].rotation.x = walk;
    a.legs[1].rotation.x = -walk;
    a.arms[0].rotation.x = -walk * 0.7;
    a.arms[1].rotation.x = a.folder.visible ? -0.48 : walk * 0.7;
    if (!moving && a.destination === 'coffee') {
      a.cup.visible = true;
      a.arms[0].rotation.x = -0.9 + Math.sin(t * 1.2) * 0.24;
      a.mode = 'coffee';
    } else a.cup.visible = false;
    if (!moving && a.mode === 'walking') {
      a.mode =
        a.destination === 'coffee'
          ? 'coffee'
          : a.destination === 'lounge'
            ? 'on a break'
            : a.job
              ? state?.agents[a.id]?.phase || 'working'
              : 'idle';
    }
    if (!moving && ['researching', 'writing', 'publishing', 'working'].includes(a.mode)) {
      a.arms[0].rotation.x = -0.85 + Math.sin(t * 9) * 0.1;
      a.arms[1].rotation.x = -0.8 - Math.sin(t * 9) * 0.1;
    }
    if (a.mode === 'celebrating') {
      a.arms[0].rotation.z = 1.7;
      a.arms[1].rotation.z = -1.7;
    } else {
      a.arms[0].rotation.z = 0.06;
      a.arms[1].rotation.z = -0.06;
    }
    a.head.rotation.y = mutedMotion ? 0 : Math.sin(t * 0.7 + (a.id === 'manager' ? 2 : 0)) * 0.075;
  }
  const v = new THREE.Vector3();
  function project(el, position) {
    v.copy(position).project(camera);
    const width = host.clientWidth,
      height = host.clientHeight;
    el.style.transform = `translate(-50%,-100%) translate(${(v.x * 0.5 + 0.5) * width}px,${(-v.y * 0.5 + 0.5) * height}px)`;
    el.style.visibility = Math.abs(v.x) > 1.12 || Math.abs(v.y) > 1.1 ? 'hidden' : 'visible';
  }
  let pointerStart;
  const raycaster = new THREE.Raycaster();
  function pointerDown(e) {
    pointerStart = { x: e.clientX, y: e.clientY };
  }
  function pointerUp(e) {
    if (!pointerStart || Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y) > 5)
      return;
    const r = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - r.left) / r.width) * 2 - 1,
        (-(e.clientY - r.top) / r.height) * 2 + 1,
      ),
      camera,
    );
    const hit = raycaster.intersectObjects(
      interactives.filter((object) => object.visible),
      true,
    )[0];
    if (hit) {
      let o = hit.object;
      while (o && !o.userData.select) o = o.parent;
      if (o) callbacks.onSelect(o.userData.select);
    }
  }
  renderer.domElement.addEventListener('pointerdown', pointerDown);
  renderer.domElement.addEventListener('pointerup', pointerUp);
  function resize() {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    const view = Math.max(47, (82 * h) / w);
    camera.left = (-view * w) / h / 2;
    camera.right = (view * w) / h / 2;
    camera.top = view / 2;
    camera.bottom = -view / 2;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  function tick(ms) {
    if (disposed) return;
    if (document.hidden) {
      frameTime = ms;
      return;
    }
    if (ms - lastRender < 32) return;
    const dt = Math.min((ms - (frameTime || ms)) / 1000, 0.08);
    frameTime = ms;
    lastRender = ms;
    const t = ms / 1000;
    runRoutine(dt);
    for (const id of ['researcher', 'manager']) {
      idle(actors[id], dt);
      animateActor(actors[id], t, dt);
    }
    actors.boss.head.rotation.y = mutedMotion ? 0 : Math.sin(t * 0.5) * 0.08;
    controls.update();
    for (const a of Object.values(actors)) {
      project(a.label, a.object.position.clone().add(new THREE.Vector3(0, 2.2, 0)));
      const mode = a.id === 'boss' ? 'THE BOSS' : a.path.length ? 'walking' : a.mode;
      const small = a.label.querySelector('small');
      if (small.textContent !== mode) small.textContent = mode;
    }
    for (const l of labels) project(l.el, l.position);
    monitor('researcher', actors.researcher.job ? 'Reading source articles' : 'Workspace ready');
    monitor(
      'manager',
      actors.manager.mode === 'publishing'
        ? 'Publishing / checking receipts'
        : actors.manager.job
          ? 'Writing & reviewing drafts'
          : 'Editorial workspace',
    );
    monitor('boss', activeApproval ? 'A draft needs your approval' : 'You call the shots');
    renderer.render(scene, camera);
    if (ms - lastReport > 500) {
      lastReport = ms;
      callbacks.onActivity({
        researcher: actors.researcher.message || 'Ready for your next assignment',
        manager: actors.manager.message || 'Waiting for Scout’s next discovery',
        scene: routine?.title || null,
        approval: activeApproval,
      });
    }
  }
  renderer.setAnimationLoop(tick);
  return {
    update,
    resetCamera() {
      camera.position.set(46, 56, 60);
      controls.target.set(0, 0, -12);
      camera.zoom = 1;
      camera.updateProjectionMatrix();
      controls.update();
    },
    zoom(delta) {
      camera.zoom = THREE.MathUtils.clamp(camera.zoom + delta, 0.65, 2);
      camera.updateProjectionMatrix();
    },
    setReducedMotion(v) {
      mutedMotion = v;
    },
    replay() {
      queue.push({
        action: 'handoff',
        title: 'Replaying the file handoff · no new work or posts are created',
      });
      const pending = state?.drafts.find((d) => ['review', 'attention'].includes(d.status));
      if (pending) queue.push({ action: 'approval', draftId: pending.id, title: pending.title });
    },
    dispose() {
      disposed = true;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      renderer.dispose();
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) {
          for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
        }
      });
      textures.forEach((t) => t.dispose());
      host.replaceChildren();
    },
  };
}
