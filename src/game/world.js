import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createEmployeeFigureFactory, poseEmployee } from './employee-figure.js';
import {
  RING,
  SEGMENTS,
  SEGMENT_ANGLE,
  segmentAngle,
  segmentIndex,
  polar,
  toPolar,
  facing,
  tables,
  seats,
  route,
  spots,
  loungeSeats,
  ceoWaitSpot,
  segmentAt,
  TABLE_RADIUS,
} from './campus.js';

const merge = (list) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));
const COLORS = {
  floor: '#F1EEE8',
  stone: '#E9E4DA',
  oak: '#D9B98C',
  oakDark: '#B8956A',
  white: '#F7F7F5',
  alu: '#C7CBD1',
  glass: '#CFE6F2',
  grass: '#A9CB8A',
  grassOuter: '#B7D39E',
  water: '#8EC5E8',
};

export function createOfficeWorld(host, callbacks = {}) {
  const factory = createEmployeeFigureFactory();
  const disposables = [];
  const keep = (x) => (disposables.push(x), x);
  const scene = new THREE.Scene();
  // Soft iOS-style sky: gradient background + matching fog.
  {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#CFE3FA');
    grad.addColorStop(0.55, '#EAF2FA');
    grad.addColorStop(1, '#F6F4EF');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
    const bg = keep(new THREE.CanvasTexture(c));
    bg.colorSpace = THREE.SRGBColorSpace;
    scene.background = bg;
  }
  scene.fog = new THREE.Fog('#EEF2F6', 150, 330);
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  host.appendChild(renderer.domElement);
  renderer.domElement.setAttribute(
    'aria-label',
    'Interactive 3D ring campus. Click an employee or a studio. Drag to rotate, scroll to zoom, right-drag to pan.',
  );
  const camera = new THREE.PerspectiveCamera(30, 1, 0.5, 700);
  const HOME = { target: new THREE.Vector3(0, 0, 4), position: new THREE.Vector3(46, 60, 68) };
  camera.position.copy(HOME.position);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(HOME.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.minDistance = 12;
  controls.maxDistance = 170;
  controls.maxPolarAngle = 1.2;
  controls.minPolarAngle = 0.12;
  controls.screenSpacePanning = false;
  controls.zoomSpeed = 0.9;
  controls.rotateSpeed = 0.55;

  scene.add(new THREE.HemisphereLight('#F4F8FF', '#C8D3BE', 1.9));
  const sun = new THREE.DirectionalLight('#FFF6E8', 2.6);
  sun.position.set(-40, 70, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -44,
    right: 44,
    top: 44,
    bottom: -44,
    near: 10,
    far: 180,
  });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.05;
  scene.add(sun);
  const fill = new THREE.DirectionalLight('#DCE8FF', 0.6);
  fill.position.set(40, 30, -40);
  scene.add(fill);

  const materials = new Map();
  function mat(color, extra = {}) {
    const key = color + JSON.stringify(extra);
    if (!materials.has(key))
      materials.set(
        key,
        keep(new THREE.MeshStandardMaterial({ color, roughness: 0.62, ...extra })),
      );
    return materials.get(key);
  }
  const glassMaterial = keep(
    new THREE.MeshStandardMaterial({
      color: COLORS.glass,
      transparent: true,
      opacity: 0.2,
      roughness: 0.05,
      metalness: 0.1,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  function add(
    geometry,
    material,
    x = 0,
    y = 0,
    z = 0,
    { shadow = true, receive = true, ry = 0 } = {},
  ) {
    keep(geometry);
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.rotation.y = ry;
    m.castShadow = shadow;
    m.receiveShadow = receive;
    scene.add(m);
    return m;
  }
  // Annular sector as a flat mesh lying on the floor.
  function sector(r0, r1, a0, a1, color, y = 0.02, opacity = 1) {
    // RingGeometry angle θ maps to polar angle −θ once rotated flat, so start at −a1.
    const g = new THREE.RingGeometry(
      r0,
      r1,
      Math.max(8, Math.ceil(((a1 - a0) / Math.PI) * 64)),
      1,
      -a1,
      a1 - a0,
    );
    g.rotateX(-Math.PI / 2);
    return add(
      g,
      opacity < 1
        ? keep(
            new THREE.MeshStandardMaterial({
              color,
              transparent: true,
              opacity,
              roughness: 0.9,
              depthWrite: false,
            }),
          )
        : mat(color, { roughness: 0.9 }),
      0,
      y,
      0,
      { shadow: false },
    );
  }
  function instanced(geometry, material, transforms, { shadow = true, colors = null } = {}) {
    keep(geometry);
    const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
    const m = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      s = new THREE.Vector3();
    transforms.forEach((t, i) => {
      q.setFromEuler(new THREE.Euler(0, t.ry || 0, 0));
      s.set(t.sx || 1, t.sy || 1, t.sz || 1);
      m.compose(new THREE.Vector3(t.x, t.y || 0, t.z), q, s);
      mesh.setMatrixAt(i, m);
      if (colors) mesh.setColorAt(i, new THREE.Color(colors[i]));
    });
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }

  // ---------------------------------------------------------------- landscape
  add(
    new THREE.CircleGeometry(260, 64).rotateX(-Math.PI / 2),
    mat(COLORS.grassOuter, { roughness: 1 }),
    0,
    -0.05,
    0,
    { shadow: false },
  );
  add(
    new THREE.CircleGeometry(RING.inner, 96).rotateX(-Math.PI / 2),
    mat(COLORS.grass, { roughness: 1 }),
    0,
    0.0,
    0,
    { shadow: false },
  );
  // Paths: plaza, ring walk and a spoke to every door.
  add(
    new THREE.CircleGeometry(8.2, 64).rotateX(-Math.PI / 2),
    mat(COLORS.stone, { roughness: 0.95 }),
    0,
    0.012,
    0,
    { shadow: false },
  );
  sector(12.6, 13.8, 0, Math.PI * 2, COLORS.stone, 0.012);
  for (let i = 0; i < 12; i++) {
    const a = segmentAngle(i);
    const g = new THREE.PlaneGeometry(RING.inner - 8, 1.5).rotateX(-Math.PI / 2);
    const p = polar((RING.inner + 8) / 2, a);
    add(g, mat(COLORS.stone, { roughness: 0.95 }), p.x, 0.014, p.z, { shadow: false, ry: -a });
  }
  // Pond
  {
    const p = polar(16.4, segmentAngle(7.5));
    const pond = add(
      new THREE.CircleGeometry(3.1, 48).rotateX(-Math.PI / 2),
      mat(COLORS.water, { roughness: 0.15, metalness: 0.1 }),
      p.x,
      0.03,
      p.z,
      { shadow: false },
    );
    pond.scale.set(1.35, 1, 0.8);
    pond.rotation.y = -segmentAngle(7.5) + Math.PI / 2;
    const rim = add(
      new THREE.RingGeometry(3.1, 3.45, 48).rotateX(-Math.PI / 2),
      mat(COLORS.stone),
      p.x,
      0.025,
      p.z,
      { shadow: false },
    );
    rim.scale.copy(pond.scale);
    rim.rotation.y = pond.rotation.y;
  }
  // Trees: an orchard in the courtyard and a woodland around the ring.
  {
    const trunks = [],
      crowns = [],
      crownColors = [];
    const greens = ['#7FAE63', '#6E9F58', '#8DBB6C', '#A2C57B', '#76A866'];
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pondAt = polar(16.4, segmentAngle(7.5));
    const tree = (x, z, scale) => {
      trunks.push({ x, y: 0.55 * scale, z, sx: scale, sy: scale, sz: scale });
      crowns.push({
        x,
        y: 1.7 * scale,
        z,
        sx: scale * (0.9 + rand() * 0.3),
        sy: scale * (0.85 + rand() * 0.3),
        sz: scale * (0.9 + rand() * 0.3),
        ry: rand() * 6,
      });
      crownColors.push(greens[Math.floor(rand() * greens.length)]);
    };
    for (let r = 9.6; r < 20.8; r += 2.4)
      for (let a = 0; a < Math.PI * 2; a += 2.4 / r) {
        const jitter = a + (rand() - 0.5) * 0.08;
        const toDoor = Math.abs(Math.atan2(Math.sin(jitter * 6), Math.cos(jitter * 6)));
        if (toDoor < (1.4 / r) * 6) continue; // keep door spokes clear
        if (Math.abs(r - 13.2) < 1.3) continue; // ring path
        const p = polar(r + (rand() - 0.5) * 0.6, jitter);
        if (Math.hypot(p.x - pondAt.x, p.z - pondAt.z) < 5.2) continue;
        tree(p.x, p.z, 0.7 + rand() * 0.25);
      }
    for (let i = 0; i < 150; i++) {
      const r = 41 + rand() * 36,
        a = rand() * Math.PI * 2;
      const p = polar(r, a);
      tree(p.x, p.z, 1 + rand() * 0.9);
    }
    instanced(new THREE.CylinderGeometry(0.12, 0.17, 1.1, 7), mat('#8C6A4F'), trunks);
    instanced(
      new THREE.IcosahedronGeometry(0.95, 1),
      mat('#ffffff', { roughness: 0.85, flatShading: true }),
      crowns,
      { colors: crownColors },
    );
  }

  // ---------------------------------------------------------------- the ring
  add(
    new THREE.RingGeometry(RING.inner, RING.outer, 160).rotateX(-Math.PI / 2),
    mat(COLORS.floor, { roughness: 0.55 }),
    0,
    0.02,
    0,
    { shadow: false },
  );
  {
    // Slab edges give the building a crisp plinth.
    const edge = (r) => {
      const g = new THREE.CylinderGeometry(r, r, 0.3, 160, 1, true);
      add(g, mat('#E4E0D8', { side: THREE.DoubleSide }), 0, -0.13, 0, { shadow: false });
    };
    edge(RING.inner);
    edge(RING.outer);
  }
  // Studio rugs in department colours.
  const departmentColors = {};
  const rugs = new Set();
  function paintRugs(departments) {
    for (const d of departments) departmentColors[d.id] = d.color;
    SEGMENTS.forEach((s, i) => {
      if (s.kind !== 'dept' || rugs.has(s.id) || !departmentColors[s.id]) return;
      rugs.add(s.id);
      const color = new THREE.Color(departmentColors[s.id]).lerp(new THREE.Color('#ffffff'), 0.72);
      const a = segmentAngle(i);
      sector(
        RING.tableStart - 0.6,
        RING.tableEnd + 0.9,
        a - 0.24,
        a + 0.24,
        '#' + color.getHexString(),
        0.03,
      );
    });
  }
  // Curved glass façades with doors at every segment centre, plus mullions.
  function glassArc(r, a0, a1, height = RING.height) {
    // CylinderGeometry uses x = r·sin θc, z = r·cos θc, so θc = π/2 − θ.
    const g = new THREE.CylinderGeometry(
      r,
      r,
      height,
      Math.max(4, Math.ceil((a1 - a0) * 30)),
      1,
      true,
      Math.PI / 2 - a1,
      a1 - a0,
    );
    return add(g, glassMaterial, 0, height / 2, 0, { shadow: false, receive: false });
  }
  for (let i = 0; i < 12; i++) {
    const a = segmentAngle(i);
    glassArc(RING.inner, a + 0.045, a + SEGMENT_ANGLE - 0.045);
    glassArc(RING.outer, a - SEGMENT_ANGLE / 2, a + SEGMENT_ANGLE / 2);
  }
  {
    const mullions = [];
    for (let i = 0; i < 180; i++) {
      const a = (i / 180) * Math.PI * 2;
      const p = polar(RING.outer, a);
      mullions.push({ ...p, y: RING.height / 2, ry: -a });
    }
    for (let i = 0; i < 120; i++) {
      const a = (i / 120) * Math.PI * 2;
      const near = Math.abs(Math.atan2(Math.sin(a * 6), Math.cos(a * 6)));
      if (near < 0.3) continue;
      const p = polar(RING.inner, a);
      mullions.push({ ...p, y: RING.height / 2, ry: -a });
    }
    instanced(
      new THREE.BoxGeometry(0.06, RING.height, 0.06),
      mat(COLORS.alu, { metalness: 0.6, roughness: 0.3 }),
      mullions,
      { shadow: false },
    );
  }
  // Radial glass partitions between studios (open at the corridor).
  for (let i = 0; i < 12; i++) {
    const a = segmentAngle(i) + SEGMENT_ANGLE / 2;
    const r0 = RING.corridor + 1.0,
      r1 = RING.outer;
    const p = polar((r0 + r1) / 2, a);
    add(
      new THREE.BoxGeometry(r1 - r0, RING.height * 0.8, 0.05),
      glassMaterial,
      p.x,
      RING.height * 0.4,
      p.z,
      { shadow: false, ry: -a },
    );
    const f = polar(r0, a);
    add(
      new THREE.BoxGeometry(0.08, RING.height * 0.8, 0.08),
      mat(COLORS.alu, { metalness: 0.6, roughness: 0.3 }),
      f.x,
      RING.height * 0.4,
      f.z,
      { shadow: false },
    );
  }
  // White roof lips: the famous thin canopy edge, leaving the interior visible.
  {
    const lip = (r0, r1) => {
      const g = new THREE.RingGeometry(r0, r1, 160).rotateX(-Math.PI / 2);
      add(
        g,
        mat(COLORS.white, { roughness: 0.4, side: THREE.DoubleSide }),
        0,
        RING.height + 0.02,
        0,
        { shadow: true, receive: false },
      );
      for (const r of [r0, r1]) {
        const band = new THREE.CylinderGeometry(r, r, 0.16, 160, 1, true);
        add(
          band,
          mat(COLORS.white, { roughness: 0.4, side: THREE.DoubleSide }),
          0,
          RING.height - 0.06,
          0,
          { shadow: false },
        );
      }
    };
    lip(RING.inner - 1.6, RING.inner + 0.35);
    lip(RING.outer - 0.35, RING.outer + 2.2);
  }

  // ---------------------------------------------------------------- studios
  const deptSegments = SEGMENTS.map((s, i) => ({ ...s, index: i })).filter(
    (s) => s.kind === 'dept',
  );
  const seatTable = new Map(); // dept id -> seats
  const tableTops = [],
    tableLegs = [],
    chairs = [],
    monitors = [],
    screens = [],
    keyboards = [];
  for (const s of deptSegments) {
    const list = seats(s.index);
    seatTable.set(s.id, list);
    for (const t of tables(s.index)) {
      tableTops.push({ x: t.center.x, y: 0.92, z: t.center.z, ry: -t.angle });
      for (const d of [-3.2, 3.2]) {
        const p = polar(TABLE_RADIUS + d, t.angle);
        tableLegs.push({ x: p.x, y: 0.45, z: p.z, ry: -t.angle });
      }
    }
    for (const seat of list) {
      chairs.push({ x: seat.x, z: seat.z, ry: seat.heading });
      monitors.push({ x: seat.monitor.x, z: seat.monitor.z, y: 0.95, ry: seat.monitorHeading });
      screens.push({ x: seat.monitor.x, z: seat.monitor.z, y: 0.95, ry: seat.monitorHeading });
      const k = {
        x: seat.monitor.x + (seat.x - seat.monitor.x) * 0.45,
        z: seat.monitor.z + (seat.z - seat.monitor.z) * 0.45,
      };
      keyboards.push({ x: k.x, y: 0.955, z: k.z, ry: seat.monitorHeading });
    }
  }
  instanced(
    new RoundedBoxGeometry(7.6, 0.07, 1.45, 2, 0.03),
    mat(COLORS.oak, { roughness: 0.55 }),
    tableTops,
  );
  instanced(
    new THREE.BoxGeometry(0.08, 0.9, 1.25),
    mat(COLORS.alu, { metalness: 0.5, roughness: 0.35 }),
    tableLegs,
  );
  const chairGeometry = merge([
    new RoundedBoxGeometry(0.62, 0.08, 0.6, 2, 0.03).translate(0, 0.5, 0),
    new RoundedBoxGeometry(0.62, 0.6, 0.07, 2, 0.03).translate(0, 0.84, -0.3),
    new THREE.CylinderGeometry(0.04, 0.04, 0.42, 8).translate(0, 0.25, 0),
    new THREE.CylinderGeometry(0.28, 0.3, 0.04, 16).translate(0, 0.03, 0),
  ]);
  instanced(chairGeometry, mat(COLORS.white, { roughness: 0.45 }), chairs);
  const monitorGeometry = merge([
    new RoundedBoxGeometry(0.92, 0.6, 0.04, 2, 0.015).translate(0, 0.5, 0),
    new THREE.BoxGeometry(0.18, 0.34, 0.03).translate(0, 0.18, -0.06),
    new THREE.BoxGeometry(0.3, 0.015, 0.22).translate(0, 0.008, -0.03),
  ]);
  instanced(monitorGeometry, mat(COLORS.alu, { metalness: 0.55, roughness: 0.3 }), monitors);
  instanced(
    new RoundedBoxGeometry(0.62, 0.02, 0.2, 1, 0.008),
    mat('#F2F2F4', { roughness: 0.4 }),
    keyboards,
    { shadow: false },
  );
  // Screens: one shared "app window" texture, tinted per seat by state.
  const screenTexture = (() => {
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 84;
    const g = c.getContext('2d');
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, 128, 84);
    g.fillStyle = '#d9dde3';
    g.fillRect(0, 0, 128, 12);
    g.fillStyle = '#c3c8cf';
    g.fillRect(0, 12, 34, 72);
    g.fillStyle = '#aeb5bf';
    for (let i = 0; i < 6; i++) g.fillRect(42, 20 + i * 10, 70 - (i % 3) * 14, 4);
    ['#ff5f57', '#febc2e', '#28c840'].forEach((color, i) => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(7 + i * 8, 6, 2.3, 0, Math.PI * 2);
      g.fill();
    });
    const t = keep(new THREE.CanvasTexture(c));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const screenMesh = instanced(
    new THREE.PlaneGeometry(0.86, 0.54).translate(0, 0.5, 0.022),
    keep(new THREE.MeshBasicMaterial({ map: screenTexture, toneMapped: false })),
    screens,
    { shadow: false, colors: screens.map(() => '#2A2A2E') },
  );
  const screenIndex = new Map(); // `${dept}:${seat}` -> instance index
  {
    let i = 0;
    for (const s of deptSegments) for (let k = 0; k < 18; k++) screenIndex.set(`${s.id}:${k}`, i++);
  }

  // ---------------------------------------------------------------- special rooms
  const at = (id) => segmentAngle(segmentIndex(id));
  // Café: curved counter, espresso machine, bar tables and stools.
  {
    const a = at('cafe');
    for (let k = -2; k <= 2; k++) {
      const p = polar(33.0, a + k * 0.055);
      add(new THREE.BoxGeometry(1.9, 0.95, 0.8), mat(COLORS.oakDark), p.x, 0.475, p.z, {
        ry: -(a + k * 0.055) + Math.PI / 2,
      });
      add(
        new RoundedBoxGeometry(1.95, 0.06, 0.9, 1, 0.02),
        mat('#FAFAF8', { roughness: 0.25 }),
        p.x,
        0.98,
        p.z,
        { ry: -(a + k * 0.055) + Math.PI / 2 },
      );
    }
    const m = polar(33.2, a + 0.04);
    add(
      new RoundedBoxGeometry(0.7, 0.55, 0.45, 2, 0.05),
      mat('#2C2C2E', { metalness: 0.4, roughness: 0.3 }),
      m.x,
      1.29,
      m.z,
      { ry: -a + Math.PI / 2 },
    );
    for (const [r, da] of [
      [27.4, 0],
      [29.6, 0.055],
      [25.9, -0.1],
    ]) {
      const p = polar(r, a + da);
      add(
        new THREE.CylinderGeometry(0.62, 0.62, 0.05, 28),
        mat('#FAFAF8', { roughness: 0.3 }),
        p.x,
        1.02,
        p.z,
      );
      add(
        new THREE.CylinderGeometry(0.05, 0.05, 1.0, 10),
        mat(COLORS.alu, { metalness: 0.6 }),
        p.x,
        0.5,
        p.z,
      );
    }
    for (let k = -3; k <= 3; k++) {
      const p = polar(31.9, a + k * 0.045);
      add(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 16), mat(COLORS.oak), p.x, 0.72, p.z);
      add(
        new THREE.CylinderGeometry(0.03, 0.03, 0.7, 8),
        mat(COLORS.alu, { metalness: 0.6 }),
        p.x,
        0.36,
        p.z,
      );
    }
  }
  // Forum: oak tiers facing a live video wall.
  let wall;
  {
    const a = at('forum');
    [
      [27.1, 28.6, 0.32],
      [28.6, 30.2, 0.64],
      [30.2, 31.8, 0.96],
    ].forEach(([r0, r1, h]) => {
      const shape = new THREE.Shape();
      const n = 24,
        a0 = a - 0.2,
        a1 = a + 0.2;
      for (let i = 0; i <= n; i++) {
        const p = polar(r1, a0 + ((a1 - a0) * i) / n);
        i ? shape.lineTo(p.x, -p.z) : shape.moveTo(p.x, -p.z);
      }
      for (let i = n; i >= 0; i--) {
        const p = polar(r0 - 0.01, a0 + ((a1 - a0) * i) / n);
        shape.lineTo(p.x, -p.z);
      }
      const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false }).rotateX(
        -Math.PI / 2,
      );
      add(g, mat(COLORS.oak, { roughness: 0.6 }), 0, 0, 0);
    });
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 320;
    const texture = keep(new THREE.CanvasTexture(c));
    texture.colorSpace = THREE.SRGBColorSpace;
    const p = polar(25.2, a);
    const screen = add(
      new THREE.PlaneGeometry(7.4, 2.3),
      keep(new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })),
      p.x,
      1.55,
      p.z,
      { shadow: false },
    );
    screen.rotation.y = facing(p, polar(40, a));
    const frame = add(
      new RoundedBoxGeometry(7.7, 2.6, 0.12, 2, 0.05),
      mat('#1C1C1E', { roughness: 0.3 }),
      p.x,
      1.55,
      p.z,
      { shadow: true },
    );
    frame.rotation.y = screen.rotation.y;
    frame.position.add(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(-0.08));
    wall = { canvas: c, texture, last: '' };
  }
  // Library: shelves along the façade and a long reading table.
  {
    const a = at('library');
    const books = [],
      bookColors = [];
    const palette = [
      '#E8543C',
      '#F5A623',
      '#4A90E2',
      '#50B37A',
      '#9B6FD6',
      '#ECECEC',
      '#2E2E30',
      '#E07AA0',
    ];
    for (let k = -3; k <= 3; k++) {
      const ang = a + k * 0.06;
      const p = polar(33.6, ang);
      add(
        new THREE.BoxGeometry(1.9, 2.2, 0.5),
        mat(COLORS.white, { roughness: 0.5 }),
        p.x,
        1.1,
        p.z,
        { ry: -ang + Math.PI / 2 },
      );
      for (let row = 0; row < 4; row++)
        for (let b = 0; b < 9; b++) {
          const q = polar(33.35, ang + (b - 4) * 0.0055);
          books.push({
            x: q.x,
            y: 0.35 + row * 0.5,
            z: q.z,
            ry: -ang + Math.PI / 2,
            sy: 0.8 + ((b * 7 + row) % 4) * 0.08,
          });
          bookColors.push(palette[(b * 3 + row * 5 + k) & 7]);
        }
    }
    instanced(new THREE.BoxGeometry(0.16, 0.4, 0.34), mat('#ffffff'), books, {
      colors: bookColors,
      shadow: false,
    });
    const t = polar(28.4, a);
    add(new RoundedBoxGeometry(1.2, 0.07, 6.2, 2, 0.03), mat(COLORS.oak), t.x, 0.92, t.z, {
      ry: -a,
    });
    for (const d of [-2.6, 2.6]) {
      const q = polar(28.4, a + d / 28.4);
      add(
        new THREE.BoxGeometry(1.0, 0.9, 0.08),
        mat(COLORS.alu, { metalness: 0.5 }),
        q.x,
        0.45,
        q.z,
        { ry: -a },
      );
    }
  }
  // Talent lounge: sofas for the reserve team.
  {
    const a = at('lounge');
    for (const r of [26.3, 28.6, 30.9]) {
      for (const side of [-1, 1]) {
        const p = polar(r + 0.45, a + side * 0.1);
        add(
          new RoundedBoxGeometry(2.6, 0.45, 0.9, 2, 0.12),
          mat('#D8D2C8', { roughness: 0.9 }),
          p.x,
          0.3,
          p.z,
          { ry: -a - side * 0.1 + Math.PI / 2 },
        );
        const b = polar(r + 0.95, a + side * 0.1);
        add(
          new RoundedBoxGeometry(2.6, 0.8, 0.28, 2, 0.12),
          mat('#CFC8BD', { roughness: 0.9 }),
          b.x,
          0.62,
          b.z,
          { ry: -a - side * 0.1 + Math.PI / 2 },
        );
      }
    }
  }
  // Plants dotted around the studios.
  {
    const pots = [],
      leaves = [];
    for (let i = 0; i < 12; i++) {
      for (const [r, off] of [
        [33.9, 0.2],
        [24.2, -0.2],
      ]) {
        const p = polar(r, segmentAngle(i) + off);
        pots.push({ x: p.x, y: 0.3, z: p.z });
        leaves.push({ x: p.x, y: 1.05, z: p.z, sx: 0.8, sy: 1.2, sz: 0.8, ry: i });
      }
    }
    instanced(new THREE.CylinderGeometry(0.3, 0.24, 0.6, 14), mat('#F4F2EE'), pots);
    instanced(
      new THREE.IcosahedronGeometry(0.55, 0),
      mat('#5E9A55', { flatShading: true, roughness: 0.8 }),
      leaves,
    );
  }

  // ---------------------------------------------------------------- CEO pavilion
  const ceoDesk = polar(1.6, Math.PI / 2 + 0.4);
  {
    const g = new THREE.CylinderGeometry(RING.pavilion, RING.pavilion, RING.height, 96, 1, true);
    add(g, glassMaterial, 0, RING.height / 2, 0, { shadow: false, receive: false });
    add(
      new THREE.CylinderGeometry(RING.pavilion + 0.25, RING.pavilion + 0.25, 0.14, 96),
      mat('#F0EDE7', { roughness: 0.5 }),
      0,
      0.03,
      0,
      { shadow: false },
    );
    const lip = new THREE.RingGeometry(RING.pavilion - 0.6, RING.pavilion + 0.9, 96).rotateX(
      -Math.PI / 2,
    );
    add(
      lip,
      mat(COLORS.white, { roughness: 0.35, side: THREE.DoubleSide }),
      0,
      RING.height + 0.03,
      0,
    );
    add(
      new THREE.CylinderGeometry(RING.pavilion + 0.9, RING.pavilion + 0.9, 0.14, 96, 1, true),
      mat(COLORS.white, { side: THREE.DoubleSide }),
      0,
      RING.height - 0.04,
      0,
      { shadow: false },
    );
    const d = add(
      new RoundedBoxGeometry(2.6, 0.08, 1.2, 2, 0.04),
      mat(COLORS.white, { roughness: 0.3 }),
      ceoDesk.x,
      0.92,
      ceoDesk.z,
    );
    d.rotation.y = facing(ceoDesk, { x: 0, z: 0 });
    for (const s of [-1, 1]) {
      const leg = add(
        new THREE.BoxGeometry(0.06, 0.9, 1.0),
        mat(COLORS.alu, { metalness: 0.5 }),
        0,
        0.45,
        0,
      );
      leg.position.set(ceoDesk.x, 0.45, ceoDesk.z);
      leg.rotation.y = d.rotation.y;
      leg.translateX(s * 1.1);
    }
    const mon = add(
      monitorGeometry.clone(),
      mat(COLORS.alu, { metalness: 0.55, roughness: 0.3 }),
      ceoDesk.x,
      0.95,
      ceoDesk.z,
    );
    mon.rotation.y = d.rotation.y + Math.PI;
    mon.translateZ(-0.3);
    const ceoSeat = polar(2.65, Math.PI / 2 + 0.4);
    add(chairGeometry.clone(), mat('#1D1D1F', { roughness: 0.5 }), ceoSeat.x, 0, ceoSeat.z, {
      ry: facing(ceoSeat, ceoDesk),
    });
    // Sofa for visitors.
    const sofa = polar(2.6, -Math.PI / 2 - 0.3);
    add(
      new RoundedBoxGeometry(2.4, 0.45, 0.9, 2, 0.12),
      mat('#2C3E57', { roughness: 0.9 }),
      sofa.x,
      0.3,
      sofa.z,
      { ry: facing(sofa, { x: 0, z: 0 }) },
    );
    const plantPot = polar(3.6, 0.8);
    add(
      new THREE.CylinderGeometry(0.34, 0.26, 0.66, 14),
      mat('#F4F2EE'),
      plantPot.x,
      0.33,
      plantPot.z,
    );
    add(
      new THREE.IcosahedronGeometry(0.7, 0),
      mat('#5E9A55', { flatShading: true }),
      plantPot.x,
      1.2,
      plantPot.z,
    );
  }
  // Approval tray: one folder per pending decision.
  const trayFolders = [];
  {
    const base = new THREE.Vector3(ceoDesk.x, 0.97, ceoDesk.z);
    const dir = new THREE.Vector3(-ceoDesk.z, 0, ceoDesk.x).normalize();
    for (let i = 0; i < 10; i++) {
      const m = add(
        new THREE.BoxGeometry(0.34, 0.035, 0.44),
        mat(i % 2 ? '#0A84FF' : '#FF9F0A'),
        0,
        0,
        0,
        { shadow: false },
      );
      m.position.copy(base).addScaledVector(dir, 0.85);
      m.position.y += i * 0.04;
      m.rotation.y = i * 0.07;
      m.visible = false;
      trayFolders.push(m);
    }
  }

  renderer.shadowMap.needsUpdate = true;

  // ---------------------------------------------------------------- overlays
  const overlay = document.createElement('div');
  overlay.className = 'world-overlay';
  host.appendChild(overlay);
  const labels = [];
  function label(text, position, onClick, className = 'studio-label') {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = className;
    const strong = document.createElement('strong');
    strong.textContent = text;
    const small = document.createElement('small');
    el.append(strong, small);
    el.onclick = onClick;
    overlay.appendChild(el);
    const entry = { el, strong, small, position };
    labels.push(entry);
    return entry;
  }
  const studioLabels = new Map();
  SEGMENTS.forEach((s, i) => {
    const p = polar(RING.outer + 3.2, segmentAngle(i));
    const entry = label(
      s.label || s.id,
      new THREE.Vector3(p.x, 3.4, p.z),
      () => callbacks.onSelect?.(s.kind === 'dept' ? `department:${s.id}` : `room:${s.id}`),
      `studio-label ${s.kind}`,
    );
    studioLabels.set(s.id, entry);
  });
  const ceoLabel = label(
    'Your office',
    new THREE.Vector3(0, 3.6, 0),
    () => callbacks.onSelect?.('ceo'),
    'studio-label ceo',
  );

  // ---------------------------------------------------------------- actors
  const actors = new Map();
  const hitProxies = [];
  const proxyGeometry = keep(new THREE.BoxGeometry(0.95, 2.3, 0.95).translate(0, 1.1, 0));
  const proxyMaterial = keep(new THREE.MeshBasicMaterial({ visible: false }));
  const folderGeometry = keep(new THREE.BoxGeometry(0.46, 0.56, 0.06));
  const folderMaterial = mat('#0A84FF', { roughness: 0.4 });
  const cupGeometry = keep(new THREE.CylinderGeometry(0.1, 0.08, 0.2, 12));
  const cupMaterial = mat('#FAFAF8');
  const MAX_ACTORS = 140;
  const shadowMesh = new THREE.InstancedMesh(
    keep(new THREE.CircleGeometry(0.62, 20).rotateX(-Math.PI / 2)),
    keep(
      new THREE.MeshBasicMaterial({
        color: '#000000',
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      }),
    ),
    MAX_ACTORS,
  );
  shadowMesh.frustumCulled = false;
  scene.add(shadowMesh);
  const ringMesh = new THREE.InstancedMesh(
    keep(new THREE.RingGeometry(0.62, 0.8, 32).rotateX(-Math.PI / 2)),
    keep(
      new THREE.MeshBasicMaterial({
        color: '#ffffff',
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
        toneMapped: false,
      }),
    ),
    MAX_ACTORS,
  );
  ringMesh.frustumCulled = false;
  for (let i = 0; i < MAX_ACTORS; i++) ringMesh.setColorAt(i, new THREE.Color('#ffffff'));
  scene.add(ringMesh);
  const selectionRing = add(
    new THREE.RingGeometry(0.9, 1.08, 40).rotateX(-Math.PI / 2),
    keep(
      new THREE.MeshBasicMaterial({
        color: '#0A84FF',
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        toneMapped: false,
      }),
    ),
    0,
    0.045,
    0,
    { shadow: false, receive: false },
  );
  selectionRing.visible = false;

  const STATUS_COLORS = { working: '#34C759', queued: '#FF9F0A', approval: '#0A84FF' };
  const allSpots = spots();
  const lounge = loungeSeats();
  const occupied = new Set();
  let state = null,
    reduced = false,
    selectedId = null,
    followId = null,
    hoveredId = null,
    lastScene = null,
    wanderers = 0,
    paused = false,
    disposed = false;
  const nowSec = () => performance.now() / 1000;

  function createActor(worker) {
    const group = new THREE.Group();
    const figure = factory.create(worker);
    group.add(figure.root);
    const proxy = new THREE.Mesh(proxyGeometry, proxyMaterial);
    proxy.userData.actorId = worker.id;
    proxy.layers.set(1);
    group.add(proxy);
    hitProxies.push(proxy);
    const folder = new THREE.Mesh(folderGeometry, folderMaterial);
    folder.position.set(0.05, -0.5, 0.25);
    folder.rotation.x = 0.5;
    folder.visible = false;
    figure.arms[1].add(folder);
    const cup = new THREE.Mesh(cupGeometry, cupMaterial);
    cup.position.set(0, -0.58, 0.18);
    cup.visible = false;
    figure.arms[0].add(cup);
    scene.add(group);
    return {
      id: worker.id,
      worker,
      group,
      figure,
      folder,
      cup,
      pos: { x: 0, z: 0 },
      y: 0,
      heading: 0,
      path: [],
      target: null,
      plan: null,
      pose: 'idle',
      arrivePose: 'sit',
      nextWander: nowSec() + 8 + Math.random() * 40,
      wanderUntil: 0,
      spot: null,
      celebrateUntil: 0,
      landingAt: 0,
      index: actors.size,
    };
  }
  function place(actor, point) {
    actor.pos = { x: point.x, z: point.z };
    actor.heading = point.heading ?? actor.heading;
    actor.group.position.set(point.x, point.y || 0, point.z);
  }
  function goTo(actor, target, { fromSeat = null } = {}) {
    actor.target = target;
    actor.path = route(actor.pos, target, {
      fromAisle: fromSeat
        ? fromSeat.aisle
        : actor.currentSeat?.aisle && actor.atSeat
          ? actor.currentSeat.aisle
          : null,
      toAisle: target.aisle || null,
    });
    actor.atSeat = false;
    actor.arrivePose = target.pose || 'sit';
  }
  function releaseSpot(actor) {
    if (actor.spot) occupied.delete(actor.spot);
    actor.spot = null;
  }

  // Seat assignment: heads first at the centre table, then roster order.
  function deskFor(worker, deptOrder) {
    const list = seatTable.get(worker.department);
    if (!list) return null;
    const order = deptOrder.get(worker.department) || [];
    const k = order.indexOf(worker.id);
    return k >= 0 && k < list.length ? { ...list[k], seatKey: `${worker.department}:${k}` } : null;
  }
  let ceoActor = null;
  let pendingCreate = [];
  function update(next) {
    state = next;
    paintRugs(next.departments || []);
    const workers = next.workers || [];
    const deptOrder = new Map();
    for (const w of workers.filter((x) => x.deployment === 'deployed')) {
      if (!deptOrder.has(w.department)) deptOrder.set(w.department, []);
      deptOrder.get(w.department).push(w);
    }
    for (const [dept, list] of deptOrder)
      deptOrder.set(
        dept,
        list.sort((a, b) => Number(b.head) - Number(a.head)).map((w) => w.id),
      );
    // Studio labels
    for (const s of SEGMENTS) {
      const entry = studioLabels.get(s.id);
      if (s.kind === 'dept') {
        const d = next.departments?.find((x) => x.id === s.id);
        if (d && entry.strong.textContent !== d.name) entry.strong.textContent = d.name;
        const members = workers.filter((w) => w.department === s.id && w.deployment === 'deployed');
        const busy = members.filter((w) => w.activity?.status === 'working').length;
        entry.small.textContent = `${members.length} here${busy ? ` · ${busy} working` : ''}`;
        entry.el.style.setProperty('--dept', d?.color || '#8E8E93');
      } else if (s.kind === 'lounge') {
        entry.small.textContent = `${workers.filter((w) => w.deployment === 'bench').length} on the bench`;
      } else if (s.kind === 'library') {
        entry.small.textContent = `${next.deliverables?.length || 0} deliverables`;
      } else if (s.kind === 'cafe') entry.small.textContent = 'Coffee & breaks';
      else if (s.kind === 'forum') entry.small.textContent = 'Live office board';
    }
    const pending =
      (next.approvals || []).filter((a) => a.status === 'pending').length +
      (next.drafts || []).filter((d) => ['review', 'attention'].includes(d.status)).length;
    ceoLabel.small.textContent = pending ? `${pending} waiting for you` : 'All clear';
    ceoLabel.el.classList.toggle('attention', pending > 0);
    trayFolders.forEach((f, i) => (f.visible = i < Math.min(pending, trayFolders.length)));
    // CEO
    if (next.company && !ceoActor) {
      ceoActor = createActor({
        id: 'ceo',
        ceo: true,
        avatar: next.company.ceo?.avatar,
        department: null,
      });
      const seat = { ...polar(2.65, Math.PI / 2 + 0.4) };
      place(ceoActor, { ...seat, heading: facing(seat, ceoDesk) });
      ceoActor.pose = 'type';
      ceoActor.static = true;
      actors.set('ceo', ceoActor);
    }
    // Actors for deployed and benched employees; stagger creation for smooth frames.
    const present = new Set();
    let benchIndex = 0;
    for (const worker of workers) {
      if (worker.deployment === 'undeployed') continue;
      present.add(worker.id);
      let actor = actors.get(worker.id);
      if (!actor) {
        if (!pendingCreate.some((w) => w.id === worker.id)) pendingCreate.push(worker);
        continue;
      }
      actor.worker = worker;
      actor.group.visible = true;
      const status = worker.deployment === 'bench' ? 'bench' : worker.activity?.status || 'idle';
      actor.status = status;
      if (worker.deployment === 'bench') {
        const seat = lounge[benchIndex++ % lounge.length];
        actor.desk = null;
        setPlan(actor, 'bench', seat);
      } else {
        actor.desk = deskFor(worker, deptOrder);
        if (status === 'approval') setPlan(actor, 'ceo');
        else if (status === 'working' || status === 'queued') setPlan(actor, 'desk');
        else if (actor.plan !== 'wander') setPlan(actor, 'desk');
      }
    }
    for (const [id, actor] of actors)
      if (id !== 'ceo' && !present.has(id)) {
        actor.group.visible = false;
        releaseSpot(actor);
        actor.plan = null;
      }
    // Scenes: celebrations and hand-offs.
    const scenes = next.scenes || [];
    if (lastScene === null) lastScene = scenes.at(-1)?.id || 0;
    for (const scene of scenes)
      if (scene.id > lastScene) {
        lastScene = scene.id;
        const actor = actors.get(
          scene.workerId || (scene.action === 'handoff' ? 'researcher' : ''),
        );
        if (!actor) continue;
        if (scene.action === 'delivered') actor.celebrateUntil = nowSec() + 2.6;
        if (scene.action === 'handoff') {
          const quinn = actors.get('manager');
          if (quinn?.desk) actor.errand = { to: quinn.desk, until: 0 };
        }
      }
    drawWall(next);
    updateScreens();
  }
  function setPlan(actor, plan, benchSeat) {
    if (actor.plan === 'wander' && plan !== 'wander') {
      wanderers = Math.max(0, wanderers - 1);
      actor.plan = null;
    }
    if (plan === 'desk') {
      const desk = actor.desk;
      if (!desk) return;
      if (actor.plan === 'desk' && actor.target?.seatKey === desk.seatKey) return;
      releaseSpot(actor);
      actor.plan = 'desk';
      if (!actor.placed) {
        place(actor, desk);
        actor.placed = true;
        actor.atSeat = true;
        actor.currentSeat = desk;
        actor.target = { ...desk, pose: 'sit' };
        return;
      }
      goTo(actor, { ...desk, pose: 'sit' });
      actor.currentSeat = desk;
    } else if (plan === 'ceo') {
      if (actor.plan === 'ceo') return;
      const waiting = [...actors.values()].filter((a) => a.plan === 'ceo').length;
      if (waiting >= 10 || !actor.desk) return setPlan(actor, 'desk');
      releaseSpot(actor);
      actor.plan = 'ceo';
      const seg = segmentIndex(actor.worker.department);
      const spot = ceoWaitSpot(
        seg,
        [...actors.values()].filter(
          (a) => a.plan === 'ceo' && a.worker.department === actor.worker.department,
        ).length - 1,
      );
      if (!actor.placed) {
        place(actor, actor.desk);
        actor.placed = true;
        actor.atSeat = true;
        actor.currentSeat = actor.desk;
      }
      goTo(actor, spot);
    } else if (plan === 'bench') {
      if (actor.plan === 'bench' && actor.target === benchSeat) return;
      releaseSpot(actor);
      actor.plan = 'bench';
      if (!actor.placed) {
        place(actor, benchSeat);
        actor.placed = true;
        actor.target = benchSeat;
        return;
      }
      goTo(actor, benchSeat);
    }
  }
  function maybeWander(actor, t, forceZone = null) {
    if (actor.plan !== 'desk' || actor.status !== 'idle' || actor.path.length) return;
    if (!forceZone && (reduced || t < actor.nextWander || wanderers >= 12)) return;
    const zoneRoll = Math.random();
    const zone =
      forceZone ||
      (zoneRoll < 0.4
        ? 'cafe'
        : zoneRoll < 0.65
          ? 'forum'
          : zoneRoll < 0.85
            ? 'orchard'
            : 'library');
    const free = allSpots.filter((s) => s.zone === zone && !occupied.has(s));
    if (!free.length) {
      actor.nextWander = t + 10;
      return;
    }
    const spot = free[Math.floor(Math.random() * free.length)];
    occupied.add(spot);
    actor.spot = spot;
    actor.plan = 'wander';
    actor.wanderUntil = 0;
    wanderers++;
    goTo(actor, spot);
  }
  function finishWander(actor, t) {
    if (actor.plan !== 'wander') return;
    if (!actor.path.length && actor.wanderUntil && t > actor.wanderUntil) {
      wanderers = Math.max(0, wanderers - 1);
      releaseSpot(actor);
      actor.plan = null;
      actor.nextWander = t + 30 + Math.random() * 70;
      setPlan(actor, 'desk');
    }
  }

  function drawWall(next) {
    const workers = next.workers || [];
    const deployed = workers.filter((w) => w.deployment === 'deployed');
    const working = deployed.filter((w) => w.activity?.status === 'working').length;
    const queued = deployed.filter((w) => w.activity?.status === 'queued').length;
    const pending = (next.approvals || []).filter((a) => a.status === 'pending').length;
    const key = [
      next.company?.companyName,
      deployed.length,
      working,
      queued,
      pending,
      next.deliverables?.length,
    ].join('|');
    if (key === wall.last) return;
    wall.last = key;
    const g = wall.canvas.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 1024, 320);
    grad.addColorStop(0, '#0B1E3F');
    grad.addColorStop(1, '#2A1B4A');
    g.fillStyle = grad;
    g.fillRect(0, 0, 1024, 320);
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.font = '600 24px -apple-system, "SF Pro Display", Helvetica, Arial';
    g.fillText('LIVE · OFFICE BOARD', 48, 58);
    g.fillStyle = '#ffffff';
    g.font = '700 54px -apple-system, "SF Pro Display", Helvetica, Arial';
    g.fillText(next.company?.companyName || 'Your company', 48, 122);
    const tiles = [
      ['Team', deployed.length, '#64D2FF'],
      ['Working', working, '#30D158'],
      ['Queued', queued, '#FF9F0A'],
      ['Awaiting you', pending, '#0A84FF'],
      ['Delivered', next.deliverables?.length || 0, '#BF5AF2'],
    ];
    tiles.forEach(([name, value, color], i) => {
      const x = 48 + i * 192;
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.beginPath();
      g.roundRect(x, 160, 172, 124, 22);
      g.fill();
      g.fillStyle = color;
      g.font = '700 58px -apple-system, "SF Pro Display", Helvetica, Arial';
      g.fillText(String(value), x + 20, 232);
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.font = '500 22px -apple-system, "SF Pro Display", Helvetica, Arial';
      g.fillText(name, x + 20, 266);
    });
    wall.texture.needsUpdate = true;
  }
  const screenColor = new THREE.Color();
  function updateScreens() {
    const used = new Map();
    for (const actor of actors.values()) {
      if (!actor.desk || actor.worker?.deployment !== 'deployed') continue;
      used.set(actor.desk.seatKey, actor.status);
    }
    for (const [key, index] of screenIndex) {
      const status = used.get(key);
      screenColor.set(
        status === 'working'
          ? '#F4F8FF'
          : status === 'queued'
            ? '#FFE7B8'
            : status === 'approval'
              ? '#CFE4FF'
              : status
                ? '#9DB9E6'
                : '#27272B',
      );
      screenMesh.setColorAt(index, screenColor);
    }
    screenMesh.instanceColor.needsUpdate = true;
  }

  // ---------------------------------------------------------------- bubbles
  const bubbles = new Map();
  function setBubbles(list) {
    const keepIds = new Set(list.map((b) => b.id));
    for (const [id, b] of bubbles)
      if (!keepIds.has(id)) {
        b.el.classList.add('leaving');
        setTimeout(() => b.el.remove(), 350);
        bubbles.delete(id);
      }
    for (const item of list) {
      let b = bubbles.get(item.id);
      if (!b) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'thought-bubble';
        el.onclick = () => callbacks.onSelect?.(`worker:${item.id}`);
        const name = document.createElement('small');
        const text = document.createElement('span');
        el.append(name, text);
        overlay.appendChild(el);
        b = { el, name, text };
        bubbles.set(item.id, b);
      }
      if (b.text.textContent !== item.text) b.text.textContent = item.text;
      if (b.name.textContent !== item.name) b.name.textContent = item.name || '';
      b.el.dataset.tone = item.tone || 'idle';
    }
  }
  const nameTag = document.createElement('div');
  nameTag.className = 'name-tag';
  overlay.appendChild(nameTag);

  // ---------------------------------------------------------------- input
  const raycaster = new THREE.Raycaster();
  raycaster.layers.set(1);
  const pointer = new THREE.Vector2();
  const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let pointerStart = null,
    lastHover = 0;
  function pick(event) {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - r.left) / r.width) * 2 - 1,
      (-(event.clientY - r.top) / r.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(
      hitProxies.filter((p) => p.parent?.visible),
      false,
    )[0];
    if (hit) return { actor: hit.object.userData.actorId };
    const point = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(floorPlane, point))
      return { floor: segmentAt({ x: point.x, z: point.z }) };
    return {};
  }
  function onPointerDown(e) {
    pointerStart = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp(e) {
    if (!pointerStart || Math.hypot(e.clientX - pointerStart.x, e.clientY - pointerStart.y) > 6)
      return;
    const result = pick(e);
    if (result.actor) {
      if (result.actor === 'ceo') callbacks.onSelect?.('ceo');
      else callbacks.onSelect?.(`worker:${result.actor}`);
    } else if (result.floor?.zone === 'segment') {
      const s = result.floor.segment;
      callbacks.onSelect?.(s.kind === 'dept' ? `department:${s.id}` : `room:${s.id}`);
    } else if (result.floor?.zone === 'ceo') callbacks.onSelect?.('ceo');
    else callbacks.onSelect?.(null);
  }
  function onPointerMove(e) {
    const t = performance.now();
    if (t - lastHover < 70) return;
    lastHover = t;
    const result = pick(e);
    hoveredId = result.actor || null;
    renderer.domElement.style.cursor =
      hoveredId || result.floor?.zone === 'segment' || result.floor?.zone === 'ceo'
        ? 'pointer'
        : '';
  }
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  let userInteracting = false;
  controls.addEventListener('start', () => {
    userInteracting = true;
    fly = null;
    followId = null;
  });
  controls.addEventListener('end', () => (userInteracting = false));

  // ---------------------------------------------------------------- camera
  let fly = null;
  function flyTo(target, distance, polarAngle = 0.9, azimuth = null) {
    const offset = camera.position.clone().sub(controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.radius = distance;
    spherical.phi = polarAngle;
    if (azimuth !== null) spherical.theta = azimuth;
    const endPos = new THREE.Vector3().setFromSpherical(spherical).add(target);
    fly = {
      t: 0,
      fromTarget: controls.target.clone(),
      toTarget: target.clone(),
      fromPos: camera.position.clone(),
      toPos: endPos,
    };
  }
  function focusDepartment(id) {
    const i = segmentIndex(id);
    if (i < 0) return;
    const a = segmentAngle(i);
    const p = polar(29, a);
    // Look from outside the ring toward the centre so the studio fills the view.
    flyTo(new THREE.Vector3(p.x, 0, p.z), 34, 0.92, Math.atan2(Math.cos(a), Math.sin(a)));
  }
  function focusEmployee(id) {
    const actor = actors.get(id);
    if (!actor) return;
    followId = id;
    const p = actor.group.position;
    const { a } = toPolar(p);
    flyTo(new THREE.Vector3(p.x, 0.8, p.z), 17, 0.95, Math.atan2(Math.cos(a), Math.sin(a)));
  }
  function focusCeo() {
    flyTo(new THREE.Vector3(0, 0.5, 0), 26, 0.85);
  }

  // ---------------------------------------------------------------- loop
  const size = { w: 0, h: 0 };
  function resize() {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h) return;
    size.w = w;
    size.h = h;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  const v = new THREE.Vector3(),
    m4 = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    one = new THREE.Vector3(1, 1, 1),
    zero = new THREE.Vector3(0, 0, 0),
    tint = new THREE.Color();
  function project(el, position, lift = 0) {
    v.copy(position);
    v.y += lift;
    v.project(camera);
    const hidden = v.z > 1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1;
    el.style.visibility = hidden ? 'hidden' : 'visible';
    if (!hidden)
      el.style.transform = `translate3d(${((v.x * 0.5 + 0.5) * size.w).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * size.h).toFixed(1)}px, 0) translate(-50%, -100%)`;
    return !hidden;
  }
  let last = 0,
    lastFrame = 0,
    lastReport = 0;
  function tick(ms) {
    if (disposed) return;
    if (document.hidden) return;
    // A full-screen page covers the campus: keep the GPU cool.
    if (paused && ms - lastFrame < 1000) return;
    const moving = fly || userInteracting;
    if (ms - lastFrame < (moving ? 15 : 30)) return;
    const dt = Math.min(0.06, (ms - (last || ms)) / 1000);
    last = ms;
    lastFrame = ms;
    const t = ms / 1000;
    // Create a few new actors per frame.
    for (let n = 0; n < 6 && pendingCreate.length; n++) {
      const worker = pendingCreate.shift();
      if (actors.has(worker.id)) continue;
      const actor = createActor(worker);
      actors.set(worker.id, actor);
      if (state) update(state);
    }
    // Camera
    if (fly) {
      fly.start ??= ms;
      fly.t = Math.min(1, (ms - fly.start) / 1100);
      const e = 1 - Math.pow(1 - fly.t, 3);
      controls.target.lerpVectors(fly.fromTarget, fly.toTarget, e);
      camera.position.lerpVectors(fly.fromPos, fly.toPos, e);
      if (fly.t >= 1) fly = null;
    } else if (followId && !userInteracting) {
      const actor = actors.get(followId);
      if (actor?.group.visible) {
        const p = actor.group.position;
        const delta = new THREE.Vector3(
          p.x - controls.target.x,
          0,
          p.z - controls.target.z,
        ).multiplyScalar(Math.min(1, dt * 3));
        controls.target.add(delta);
        camera.position.add(delta);
      }
    }
    controls.update();
    // Actors
    let i = 0;
    for (const actor of actors.values()) {
      if (!actor.group.visible) continue;
      const figure = actor.figure;
      let pose = actor.pose;
      if (!actor.static) {
        if (actor.path.length) {
          const next = actor.path[0];
          const dx = next.x - actor.pos.x,
            dz = next.z - actor.pos.z,
            dist = Math.hypot(dx, dz),
            step = Math.min(dist, dt * (reduced ? 6 : 3.4));
          if (dist < 0.04) actor.path.shift();
          else {
            actor.pos.x += (dx / dist) * step;
            actor.pos.z += (dz / dist) * step;
            const want = Math.atan2(dx, dz);
            actor.heading +=
              Math.atan2(Math.sin(want - actor.heading), Math.cos(want - actor.heading)) *
              Math.min(1, dt * 12);
          }
          pose = actor.plan === 'ceo' ? 'carry' : 'walk';
          actor.group.position.y = 0;
          if (!actor.path.length) {
            // Arrived
            const target = actor.target;
            if (target) {
              actor.heading = target.heading ?? actor.heading;
              actor.pos = { x: target.x, z: target.z };
              actor.group.position.y = target.y || 0;
              actor.atSeat = actor.plan === 'desk';
              if (actor.plan === 'wander') actor.wanderUntil = t + 12 + Math.random() * 14;
            }
          }
        } else {
          const status = actor.status;
          if (actor.plan === 'desk')
            pose = status === 'working' ? 'type' : status === 'queued' ? 'think' : 'sit';
          else if (actor.plan === 'ceo') pose = 'carry';
          else if (actor.plan === 'wander' || actor.plan === 'bench')
            pose = actor.target?.pose || 'sit';
          maybeWander(actor, t);
          finishWander(actor, t);
        }
        if (t < actor.celebrateUntil && !actor.path.length) pose = 'celebrate';
        actor.folder.visible = pose === 'carry' || pose === 'read';
        actor.cup.visible = pose === 'drink';
        actor.group.position.x = actor.pos.x;
        actor.group.position.z = actor.pos.z;
        actor.group.rotation.y = actor.heading;
      }
      const landing = actor.landingAt && ms - actor.landingAt < 900;
      poseEmployee(
        figure,
        landing ? (ms - actor.landingAt) / 800 : t + actor.index * 0.37,
        landing ? 'landing' : pose,
        reduced,
      );
      // Shadow + status ring
      const gp = actor.group.position;
      m4.compose(v.set(gp.x, 0.035 + (gp.y || 0), gp.z), q.identity(), one);
      shadowMesh.setMatrixAt(i, m4);
      const statusColor = STATUS_COLORS[actor.status];
      if (statusColor && actor.id !== 'ceo') {
        const pulse = actor.status === 'approval' && !reduced ? 1 + Math.sin(t * 4) * 0.08 : 1;
        m4.compose(
          v.set(gp.x, 0.05 + (gp.y || 0), gp.z),
          q.identity(),
          new THREE.Vector3(pulse, 1, pulse),
        );
        ringMesh.setColorAt(i, tint.set(statusColor));
      } else m4.compose(v.set(0, -10, 0), q.identity(), zero);
      ringMesh.setMatrixAt(i, m4);
      i++;
    }
    for (let k = i; k < MAX_ACTORS; k++) {
      m4.compose(v.set(0, -10, 0), q.identity(), zero);
      shadowMesh.setMatrixAt(k, m4);
      ringMesh.setMatrixAt(k, m4);
    }
    shadowMesh.count = MAX_ACTORS;
    shadowMesh.instanceMatrix.needsUpdate = true;
    ringMesh.instanceMatrix.needsUpdate = true;
    if (ringMesh.instanceColor) ringMesh.instanceColor.needsUpdate = true;
    // Selection ring
    const selected = selectedId && actors.get(selectedId);
    selectionRing.visible = Boolean(selected?.group.visible);
    if (selectionRing.visible) {
      selectionRing.position.set(
        selected.group.position.x,
        0.06 + selected.group.position.y,
        selected.group.position.z,
      );
      selectionRing.scale.setScalar(reduced ? 1 : 1 + Math.sin(t * 3) * 0.06);
    }
    renderer.render(scene, camera);
    // Overlays after render so they track the same camera.
    const zoomedOut = camera.position.distanceTo(controls.target) > 110;
    for (const l of labels) {
      const shown = project(l.el, l.position);
      l.el.classList.toggle('far', zoomedOut && shown);
    }
    // Bubbles: project, then hide any that would overlap one already shown.
    const shownRects = [];
    for (const [id, b] of bubbles) {
      const actor = actors.get(id);
      if (!actor?.group.visible || !project(b.el, actor.group.position, 2.75)) {
        b.el.style.visibility = 'hidden';
        continue;
      }
      const x = (v.x * 0.5 + 0.5) * size.w,
        y = (-v.y * 0.5 + 0.5) * size.h;
      const clash = shownRects.some((r) => Math.abs(r.x - x) < 190 && Math.abs(r.y - y) < 62);
      if (clash && id !== selectedId) b.el.style.visibility = 'hidden';
      else shownRects.push({ x, y });
    }
    const tagId = hoveredId || selectedId;
    const tagActor = tagId && actors.get(tagId);
    if (tagActor?.group.visible && !bubbles.has(tagId)) {
      const text =
        tagId === 'ceo'
          ? state?.company?.ceo?.name || 'You'
          : tagActor.worker.persona?.fullName || tagActor.worker.name;
      if (nameTag.textContent !== text) nameTag.textContent = text;
      project(nameTag, tagActor.group.position, 2.55);
    } else nameTag.style.visibility = 'hidden';
    if (ms - lastReport > 1000) {
      lastReport = ms;
      callbacks.onFrame?.({ distance: camera.position.distanceTo(controls.target) });
    }
  }
  renderer.setAnimationLoop(tick);
  return {
    update,
    setBubbles,
    setSelected(id) {
      selectedId = id;
    },
    focusEmployee,
    focusDepartment,
    focusCeo,
    welcomeEmployee(id) {
      const actor = actors.get(id);
      if (actor) actor.landingAt = performance.now();
      else setTimeout(() => actors.get(id) && (actors.get(id).landingAt = performance.now()), 400);
    },
    resetCamera() {
      followId = null;
      fly = {
        t: 0,
        fromTarget: controls.target.clone(),
        toTarget: HOME.target.clone(),
        fromPos: camera.position.clone(),
        toPos: HOME.position.clone(),
      };
    },
    zoom(factor) {
      const offset = camera.position.clone().sub(controls.target);
      const length = THREE.MathUtils.clamp(
        offset.length() * factor,
        controls.minDistance,
        controls.maxDistance,
      );
      fly = {
        t: 0,
        fromTarget: controls.target.clone(),
        toTarget: controls.target.clone(),
        fromPos: camera.position.clone(),
        toPos: controls.target.clone().add(offset.setLength(length)),
      };
    },
    setReducedMotion(value) {
      reduced = value;
    },
    setPaused(value) {
      paused = value;
    },
    // Player commands for free employees (visual only; real work is unaffected).
    command(id, cmd) {
      const actor = actors.get(id);
      if (!actor?.desk || actor.status !== 'idle') return false;
      if (actor.plan === 'wander') setPlan(actor, 'desk');
      if (cmd === 'break') {
        actor.plan = 'desk';
        actor.path = [];
        maybeWander(actor, nowSec(), 'cafe');
        return actor.plan === 'wander';
      }
      if (cmd === 'visit') {
        releaseSpot(actor);
        actor.plan = 'wander';
        wanderers++;
        goTo(actor, ceoWaitSpot(segmentIndex(actor.worker.department), 6 + (actor.index % 4)));
        return true;
      }
      if (cmd === 'desk') {
        setPlan(actor, 'desk');
        return true;
      }
      return false;
    },
    replay() {},
    dispose() {
      disposed = true;
      renderer.setAnimationLoop(null);
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      factory.dispose();
      disposables.forEach((d) => d.dispose?.());
      shadowMesh.dispose();
      ringMesh.dispose();
      renderer.dispose();
      host.replaceChildren();
    },
  };
}
