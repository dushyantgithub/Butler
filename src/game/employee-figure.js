import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { employeeLook, ceoLook, DEPARTMENTS } from '../../shared/roster.js';

// Resolve a worker (or the CEO) to a brick-figure look.
export function employeeAppearance(worker) {
  const look = worker?.ceo
    ? ceoLook(worker.avatar)
    : worker?.persona?.look || employeeLook(worker?.id || 'employee', worker?.department);
  const color = DEPARTMENTS.find((d) => d.id === worker?.department)?.color || look.torso;
  return { ...look, color, hair: look.hairColor, style: look.hair };
}

const canUseCanvas = () => typeof document !== 'undefined' && !!document.createElement;
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function darker(hex, amount = 0.35) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(1 - amount);
  return '#' + c.getHexString();
}

// Minifig face printed on the head's cylinder. The front of the head is the middle
// of the texture (u = 0.5) because the lathe starts at -Z.
function drawFace(look) {
  const c = canvas(256, 128),
    g = c.getContext('2d');
  g.fillStyle = look.skin;
  g.fillRect(0, 0, 256, 128);
  const cx = 128,
    dark = '#1c1b1f',
    brow = darker(look.hairColor === '#CFC9C0' ? '#8E8C8A' : look.hairColor, 0.15);
  if (look.facial === 'beard' || look.facial === 'stubble') {
    g.fillStyle = look.facial === 'beard' ? darker(look.hairColor, 0.05) : 'rgba(40,30,25,0.22)';
    g.beginPath();
    g.ellipse(cx, 96, 34, 22, 0, 0, Math.PI * 2);
    g.fill();
    g.fillRect(cx - 34, 78, 68, 18);
    g.fillStyle = look.skin;
    g.beginPath();
    g.ellipse(cx, 84, 13, 6, 0, 0, Math.PI * 2);
    g.fill();
  }
  // Eyebrows
  g.strokeStyle = brow;
  g.lineWidth = 3.4;
  g.lineCap = 'round';
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + s * 9, 45);
    g.quadraticCurveTo(cx + s * 16, 41, cx + s * 24, 44);
    g.stroke();
  }
  // Eyes: classic brick dots with a highlight
  for (const s of [-1, 1]) {
    g.fillStyle = dark;
    g.beginPath();
    g.ellipse(cx + s * 16, 57, 4.4, 5.4, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(cx + s * 16 + 1.4, 55.2, 1.5, 0, Math.PI * 2);
    g.fill();
    if (look.lashes) {
      g.strokeStyle = dark;
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(cx + s * 20, 53);
      g.lineTo(cx + s * 23.5, 50.5);
      g.stroke();
    }
  }
  if (look.freckles) {
    g.fillStyle = 'rgba(120,70,40,0.45)';
    for (const [x, y] of [
      [-20, 67],
      [-15, 70],
      [-24, 71],
      [20, 67],
      [15, 70],
      [24, 71],
    ])
      g.fillRect(cx + x, y, 2, 2);
  } else {
    g.fillStyle = 'rgba(255,120,110,0.16)';
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(cx + s * 25, 70, 6, 3.5, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (look.facial === 'mustache') {
    g.fillStyle = darker(look.hairColor, 0.05);
    g.beginPath();
    g.ellipse(cx - 7, 78, 9, 3.6, 0.15, 0, Math.PI * 2);
    g.ellipse(cx + 7, 78, 9, 3.6, -0.15, 0, Math.PI * 2);
    g.fill();
  }
  // Mouth
  g.strokeStyle = dark;
  g.fillStyle = dark;
  g.lineWidth = 3;
  g.beginPath();
  if (look.mouth === 'grin') {
    g.moveTo(cx - 15, 80);
    g.quadraticCurveTo(cx, 97, cx + 15, 80);
    g.closePath();
    g.fill();
    g.fillStyle = '#fff';
    g.fillRect(cx - 10, 81, 20, 3.5);
  } else if (look.mouth === 'open') {
    g.ellipse(cx, 85, 7, 5.5, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#d9636b';
    g.beginPath();
    g.ellipse(cx, 87.5, 4, 2.4, 0, 0, Math.PI * 2);
    g.fill();
  } else if (look.mouth === 'smirk') {
    g.moveTo(cx - 11, 83);
    g.quadraticCurveTo(cx + 3, 88, cx + 13, 78);
    g.stroke();
  } else {
    g.moveTo(cx - 13, 80);
    g.quadraticCurveTo(cx, 91, cx + 13, 80);
    g.stroke();
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// Printed torso front: outfits give every employee a different silhouette.
function drawTorso(look, deptColor) {
  const c = canvas(128, 128),
    g = c.getContext('2d');
  g.fillStyle = look.torso;
  g.fillRect(0, 0, 128, 128);
  const accent = look.accent,
    ink = darker(look.torso, 0.45);
  g.lineWidth = 3;
  g.strokeStyle = ink;
  g.fillStyle = accent;
  // Canvas y grows downward; the top of the torso is y = 0.
  switch (look.outfit) {
    case 'blazer':
      g.fillStyle = '#F5F5F7';
      g.beginPath();
      g.moveTo(52, 0);
      g.lineTo(76, 0);
      g.lineTo(64, 70);
      g.closePath();
      g.fill();
      g.fillStyle = look.ceo ? '#0A84FF' : deptColor;
      g.beginPath();
      g.moveTo(60, 6);
      g.lineTo(68, 6);
      g.lineTo(66, 48);
      g.lineTo(64, 54);
      g.lineTo(62, 48);
      g.closePath();
      g.fill();
      g.strokeStyle = darker(look.torso, 0.5);
      g.beginPath();
      g.moveTo(50, 0);
      g.lineTo(62, 62);
      g.moveTo(78, 0);
      g.lineTo(66, 62);
      g.stroke();
      g.fillStyle = '#F5F5F7';
      g.fillRect(84, 30, 14, 3);
      break;
    case 'hoodie':
      g.fillStyle = darker(look.torso, 0.2);
      g.beginPath();
      g.ellipse(64, 0, 26, 14, 0, 0, Math.PI);
      g.fill();
      g.strokeStyle = '#F5F5F7';
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(56, 10);
      g.lineTo(55, 40);
      g.moveTo(72, 10);
      g.lineTo(73, 40);
      g.stroke();
      g.strokeStyle = ink;
      g.lineWidth = 2;
      g.strokeRect(36, 82, 56, 26);
      break;
    case 'sweater':
      g.fillStyle = darker(look.torso, 0.18);
      g.beginPath();
      g.ellipse(64, 0, 22, 10, 0, 0, Math.PI);
      g.fill();
      g.fillStyle = accent;
      g.fillRect(0, 58, 128, 7);
      g.fillRect(0, 70, 128, 3);
      break;
    case 'shirt':
      g.fillStyle = '#F5F5F7';
      g.beginPath();
      g.moveTo(44, 0);
      g.lineTo(64, 16);
      g.lineTo(84, 0);
      g.closePath();
      g.fill();
      g.fillStyle = ink;
      for (let y = 26; y < 120; y += 18) g.fillRect(62, y, 4, 4);
      g.fillRect(64, 16, 1.5, 110);
      break;
    case 'overshirt':
      g.fillStyle = accent;
      g.fillRect(48, 0, 32, 128);
      g.strokeStyle = ink;
      g.beginPath();
      g.moveTo(48, 0);
      g.lineTo(48, 128);
      g.moveTo(80, 0);
      g.lineTo(80, 128);
      g.stroke();
      g.fillStyle = ink;
      g.fillRect(24, 34, 18, 3);
      break;
    default: {
      // Tee with a small printed badge
      g.fillStyle = darker(look.torso, 0.15);
      g.beginPath();
      g.ellipse(64, 0, 18, 9, 0, 0, Math.PI);
      g.fill();
      g.fillStyle = accent;
      g.beginPath();
      g.arc(64, 54, 13, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = look.torso;
      g.beginPath();
      g.arc(64, 54, 6, 0, Math.PI * 2);
      g.fill();
    }
  }
  if (!look.ceo && (look.seed >>> 3) % 4 === 0) {
    // Lanyard + badge
    g.strokeStyle = deptColor;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(50, 0);
    g.lineTo(64, 70);
    g.lineTo(78, 0);
    g.stroke();
    g.fillStyle = '#FFFFFF';
    g.fillRect(56, 68, 16, 20);
    g.fillStyle = deptColor;
    g.fillRect(56, 68, 16, 5);
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Map shape coordinates (x -0.34..0.34, y 0..0.65) to texture space (v=1 is the canvas top).
  texture.repeat.set(1 / 0.68, 1 / 0.65);
  texture.offset.set(0.5, 0);
  return texture;
}

function colored(geometry, color) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  const c = new THREE.Color(color);
  const count = g.attributes.position.count,
    colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  return g;
}
function part(
  geometry,
  color,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = 1,
  sz = 1,
) {
  const g = colored(geometry, color);
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
  g.applyMatrix4(m);
  return g;
}
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const Cy = (r, h, s = 20, r2 = r) => new THREE.CylinderGeometry(r, r2, h, s);
const Sp = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);

function hairParts(style, color, look) {
  const parts = [];
  const cap = (h = 0.16, y = 0.2) => parts.push(part(Cy(0.305, h, 24, 0.3), color, 0, y, -0.01));
  const dome = (sy = 0.6) =>
    parts.push(
      part(
        new THREE.SphereGeometry(0.31, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        color,
        0,
        0.215,
        -0.01,
        0,
        0,
        0,
        1,
        sy,
        1,
      ),
    );
  switch (style) {
    case 'short':
      cap();
      dome(0.45);
      parts.push(part(B(0.5, 0.1, 0.14), color, 0.02, 0.24, 0.22, -0.3));
      break;
    case 'side':
      cap();
      dome(0.5);
      parts.push(part(B(0.36, 0.13, 0.2), color, -0.1, 0.27, 0.19, -0.25, 0, 0.18));
      parts.push(part(B(0.1, 0.24, 0.42), color, 0.27, 0.1, -0.04));
      break;
    case 'long':
      cap();
      dome(0.55);
      parts.push(part(B(0.58, 0.72, 0.13), color, 0, -0.1, -0.24));
      for (const s of [-1, 1]) parts.push(part(B(0.1, 0.62, 0.36), color, s * 0.285, -0.05, -0.07));
      break;
    case 'bob':
      cap();
      dome(0.55);
      parts.push(part(B(0.62, 0.42, 0.2), color, 0, 0.02, -0.2));
      for (const s of [-1, 1]) parts.push(part(B(0.1, 0.4, 0.44), color, s * 0.3, 0.02, 0.0));
      parts.push(part(B(0.52, 0.09, 0.12), color, 0, 0.23, 0.24, -0.2));
      break;
    case 'bun':
      cap(0.14);
      dome(0.45);
      parts.push(part(Sp(0.15), color, 0, 0.43, -0.12));
      break;
    case 'afro':
      parts.push(part(Sp(0.42, 20, 14), color, 0, 0.2, -0.04, 0, 0, 0, 1.05, 0.82, 1));
      break;
    case 'curly':
      cap(0.12);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        parts.push(
          part(
            Sp(0.12, 10, 8),
            color,
            Math.cos(a) * 0.22,
            0.3 + (i % 2) * 0.03,
            Math.sin(a) * 0.2 - 0.02,
          ),
        );
      }
      parts.push(part(Sp(0.15, 10, 8), color, 0, 0.36, -0.02));
      break;
    case 'ponytail':
      cap();
      dome(0.5);
      parts.push(part(Cy(0.08, 0.5, 10, 0.05), color, 0, 0.02, -0.34, 0.45));
      parts.push(part(Sp(0.1, 10, 8), color, 0, 0.26, -0.3));
      break;
    case 'buzz':
      parts.push(
        part(
          new THREE.SphereGeometry(0.3, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2),
          color,
          0,
          0.2,
          -0.01,
          0,
          0,
          0,
          1,
          0.34,
          1,
        ),
      );
      break;
    case 'braids':
      cap();
      dome(0.5);
      for (const s of [-1, 1]) {
        parts.push(part(Cy(0.06, 0.62, 8), color, s * 0.2, -0.14, -0.22));
        parts.push(part(Sp(0.07, 8, 6), color, s * 0.2, -0.46, -0.22));
      }
      break;
    case 'wavy':
      cap();
      dome(0.55);
      parts.push(part(B(0.6, 0.55, 0.14), color, 0, -0.03, -0.23));
      for (const s of [-1, 1]) parts.push(part(Sp(0.14, 10, 8), color, s * 0.27, -0.2, -0.1));
      parts.push(part(B(0.3, 0.11, 0.18), color, 0.12, 0.26, 0.2, -0.3, 0, -0.2));
      break;
    case 'spiky':
      cap(0.12);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        parts.push(
          part(
            new THREE.ConeGeometry(0.09, 0.22, 6),
            color,
            Math.cos(a) * 0.17,
            0.36,
            Math.sin(a) * 0.15 - 0.02,
            Math.sin(a) * 0.4,
            0,
            -Math.cos(a) * 0.4,
          ),
        );
      }
      parts.push(part(new THREE.ConeGeometry(0.1, 0.26, 6), color, 0, 0.42, 0));
      break;
    case 'wrap': {
      // Head wrap in a fabric colour.
      const fabric = ['#6E4A7E', '#2F6F73', '#B5533C', '#1F3B63', '#C9A13B'][look.seed % 5];
      parts.push(
        part(
          new THREE.SphereGeometry(0.34, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.62),
          fabric,
          0,
          0.12,
          -0.03,
          0,
          0,
          0,
          1,
          1,
          1,
        ),
      );
      parts.push(part(B(0.62, 0.5, 0.16), fabric, 0, -0.14, -0.22));
      parts.push(part(Cy(0.335, 0.08, 24), darker(fabric, 0.2), 0, 0.2, -0.02));
      break;
    }
    default:
      break;
  }
  return parts;
}
function accessoryParts(look, deptColor) {
  const parts = [];
  if (look.glasses !== 'none') {
    const frame = '#2B2B30';
    for (const s of [-1, 1]) {
      if (look.glasses === 'round')
        parts.push(part(new THREE.TorusGeometry(0.068, 0.013, 6, 18), frame, s * 0.075, 0.04, 0.3));
      else {
        parts.push(part(B(0.13, 0.016, 0.02), frame, s * 0.075, 0.1, 0.3));
        parts.push(part(B(0.13, 0.016, 0.02), frame, s * 0.075, -0.01, 0.3));
        parts.push(part(B(0.016, 0.12, 0.02), frame, s * 0.14, 0.045, 0.3));
        parts.push(part(B(0.016, 0.12, 0.02), frame, s * 0.012, 0.045, 0.3));
      }
      parts.push(part(B(0.012, 0.012, 0.3), frame, s * 0.29, 0.05, 0.14));
    }
    parts.push(part(B(0.04, 0.012, 0.02), frame, 0, 0.055, 0.3));
  }
  if (look.accessory === 'headphones') {
    parts.push(
      part(new THREE.TorusGeometry(0.34, 0.03, 6, 20, Math.PI), '#1D1D1F', 0, 0.02, 0, 0, 0, 0),
    );
    for (const s of [-1, 1])
      parts.push(part(Cy(0.1, 0.08, 14), '#E5E5EA', s * 0.33, 0.0, 0, 0, 0, Math.PI / 2));
  } else if (look.accessory === 'headset') {
    parts.push(part(new THREE.TorusGeometry(0.33, 0.018, 6, 20, Math.PI), '#3A3A3C', 0, 0.02, 0));
    parts.push(part(Cy(0.08, 0.06, 12), '#3A3A3C', -0.32, 0, 0, 0, 0, Math.PI / 2));
    parts.push(part(B(0.02, 0.02, 0.26), '#3A3A3C', -0.3, -0.1, 0.12, 0, 0.3));
  } else if (look.accessory === 'cap') {
    parts.push(
      part(
        new THREE.SphereGeometry(0.315, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        deptColor,
        0,
        0.19,
        -0.01,
        0,
        0,
        0,
        1,
        0.62,
        1,
      ),
    );
    parts.push(part(Cy(0.2, 0.025, 16), darker(deptColor, 0.2), 0, 0.2, 0.25, 0, 0, 0, 1, 1, 1));
  } else if (look.accessory === 'beanie') {
    parts.push(
      part(
        new THREE.SphereGeometry(0.32, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
        deptColor,
        0,
        0.17,
        -0.01,
        0,
        0,
        0,
        1,
        0.75,
        1,
      ),
    );
    parts.push(part(Cy(0.325, 0.09, 20), darker(deptColor, 0.25), 0, 0.2, -0.01));
  }
  return parts;
}

// One factory owns the shared geometry/materials; per-figure geometries (with
// baked colours) and textures are tracked and released together.
export function createEmployeeFigureFactory() {
  const shared = new Map(),
    owned = new Set();
  const sharedGeometry = (key, make) => {
    if (!shared.has(key)) shared.set(key, make());
    return shared.get(key);
  };
  const vertexMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.34,
    metalness: 0.02,
  });
  owned.add(vertexMaterial);
  const headProfile = () => {
    const pts = [];
    const r = 0.29,
      h = 0.45,
      e = 0.06;
    pts.push(new THREE.Vector2(0.0001, -h / 2));
    for (let i = 0; i <= 4; i++) {
      const a = -Math.PI / 2 + (i / 4) * (Math.PI / 2);
      pts.push(new THREE.Vector2(r - e + Math.cos(a) * e, -h / 2 + e + Math.sin(a) * e));
    }
    for (let i = 1; i <= 6; i++) pts.push(new THREE.Vector2(r, -h / 2 + e + ((h - 2 * e) * i) / 7));
    for (let i = 0; i <= 4; i++) {
      const a = (i / 4) * (Math.PI / 2);
      pts.push(new THREE.Vector2(r - e + Math.cos(a) * e, h / 2 - e + Math.sin(a) * e));
    }
    pts.push(new THREE.Vector2(0.0001, h / 2));
    const g = new THREE.LatheGeometry(pts, 32, Math.PI, Math.PI * 2);
    return g;
  };
  function mesh(geometry, material, parent) {
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  function track(resource) {
    owned.add(resource);
    return resource;
  }
  return {
    create(worker) {
      const look = employeeAppearance(worker);
      const deptColor = look.ceo ? '#0A84FF' : look.color;
      const root = new THREE.Group(),
        head = new THREE.Group(),
        arms = [],
        legs = [];
      const torsoGeo = sharedGeometry('torso', () => {
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
          bevelSegments: 2,
          steps: 1,
        });
        g.translate(0, 0, -0.2);
        return g;
      });
      // Body: torso shell + hips + neck in one vertex-coloured mesh.
      const body = track(
        mergeGeometries([
          part(torsoGeo, look.torso, 0, 0.76, 0),
          part(B(0.64, 0.16, 0.38), look.legs, 0, 0.69, 0),
          part(Cy(0.115, 0.14, 16), look.skin, 0, 1.46, 0),
        ]),
      );
      mesh(body, vertexMaterial, root);
      if (canUseCanvas()) {
        const print = track(drawTorso(look, deptColor));
        const printMaterial = track(
          new THREE.MeshStandardMaterial({
            map: print,
            roughness: 0.4,
            polygonOffset: true,
            polygonOffsetFactor: -2,
          }),
        );
        const front = sharedGeometry('torso-front', () => {
          const shape = new THREE.Shape();
          shape.moveTo(-0.34, 0);
          shape.lineTo(0.34, 0);
          shape.lineTo(0.26, 0.65);
          shape.lineTo(-0.26, 0.65);
          shape.closePath();
          return new THREE.ShapeGeometry(shape);
        });
        const m = mesh(front, printMaterial, root);
        m.position.set(0, 0.76, 0.2265);
        m.castShadow = false;
      }
      root.add(head);
      head.position.y = 1.73;
      const faceMaterial = track(
        new THREE.MeshStandardMaterial({
          color: canUseCanvas() ? '#ffffff' : look.skin,
          map: canUseCanvas() ? track(drawFace(look)) : null,
          roughness: 0.32,
        }),
      );
      mesh(sharedGeometry('head', headProfile), faceMaterial, head);
      const topParts = [
        ...hairParts(look.style, look.hairColor, look),
        ...accessoryParts(look, deptColor),
      ];
      if (['bald', 'buzz'].includes(look.style) && !['cap', 'beanie'].includes(look.accessory))
        topParts.push(part(Cy(0.15, 0.1, 18), look.skin, 0, 0.27, 0));
      if (topParts.length) mesh(track(mergeGeometries(topParts)), vertexMaterial, head);
      for (const side of [-1, 1]) {
        const arm = new THREE.Group();
        arm.position.set(side * 0.37, 1.29, 0);
        root.add(arm);
        const armGeo = track(
          mergeGeometries([
            part(B(0.23, 0.4, 0.3), look.torso, side * 0.035, -0.18, 0, 0, 0, side * 0.1),
            part(Cy(0.085, 0.14, 14), look.skin, 0, -0.42, 0),
            part(
              new THREE.TorusGeometry(0.092, 0.043, 8, 18, Math.PI * 1.55),
              look.skin,
              0,
              -0.53,
              0.015,
              0,
              0,
              -Math.PI * 0.28,
            ),
          ]),
        );
        mesh(armGeo, vertexMaterial, arm);
        arms.push(arm);
        const leg = new THREE.Group();
        leg.position.set(side * 0.17, 0.65, 0);
        root.add(leg);
        const legGeo = track(
          mergeGeometries([
            part(B(0.27, 0.5, 0.34), look.legs, 0, -0.25, 0),
            part(B(0.29, 0.15, 0.5), darker(look.legs, 0.12), 0, -0.53, 0.085),
          ]),
        );
        mesh(legGeo, vertexMaterial, leg);
        legs.push(leg);
      }
      root.userData.look = look;
      return { root, head, arms, legs, look };
    },
    dispose() {
      shared.forEach((g) => g.dispose());
      owned.forEach((r) => r.dispose());
      shared.clear();
      owned.clear();
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
  const seated = mode === 'sit' || mode === 'type' || mode === 'think';
  if (seated) {
    root.position.y = -0.14;
    legs.forEach((l) => (l.rotation.x = -Math.PI / 2));
    arms[0].rotation.x = -0.75;
    arms[1].rotation.x = -0.75;
  }
  if (mode === 'carry') arms[1].rotation.x = -1.1;
  if (mode === 'read') {
    arms[0].rotation.x = -1.0;
    arms[1].rotation.x = -1.0;
  }
  if (reducedMotion) return;
  const seed = (figure.look?.seed || 0) % 11;
  if (mode === 'drag' || mode === 'waiting') {
    root.position.y = 0.12;
    root.rotation.z = Math.sin(time * 5) * 0.1;
    root.rotation.y = Math.sin(time * 2) * 0.18;
    arms[0].rotation.z = -2.55;
    arms[1].rotation.z = 2.55;
    legs[0].rotation.x = Math.sin(time * 8) * 0.35;
    legs[1].rotation.x = -Math.sin(time * 8) * 0.35;
    head.rotation.z = -root.rotation.z * 0.5;
  } else if (mode === 'hover' || mode === 'wave') {
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
  } else if (mode === 'walk' || mode === 'carry') {
    const s = Math.sin(time * 9);
    root.position.y = Math.abs(Math.cos(time * 9)) * 0.05;
    legs[0].rotation.x = s * 0.6;
    legs[1].rotation.x = -s * 0.6;
    arms[0].rotation.x = -s * 0.55;
    if (mode === 'walk') arms[1].rotation.x = s * 0.55;
  } else if (mode === 'type') {
    arms[0].rotation.x = -1.05 + Math.sin(time * 14 + seed) * 0.09;
    arms[1].rotation.x = -1.05 - Math.sin(time * 13 + seed) * 0.09;
    head.rotation.x = -0.08 + Math.sin(time * 0.9 + seed) * 0.03;
    head.rotation.y = Math.sin(time * 0.6 + seed) * 0.12;
  } else if (mode === 'think') {
    arms[1].rotation.x = -1.9;
    arms[1].rotation.z = 0.45;
    head.rotation.z = 0.12 + Math.sin(time * 0.8 + seed) * 0.04;
    head.rotation.y = Math.sin(time * 0.5 + seed) * 0.25;
  } else if (mode === 'sit') {
    head.rotation.y = Math.sin(time * 0.5 + seed) * 0.3;
    arms[0].rotation.x = -0.75 + Math.sin(time * 0.7 + seed) * 0.05;
  } else if (mode === 'celebrate') {
    root.position.y = Math.abs(Math.sin(time * 7)) * 0.35;
    arms[0].rotation.z = -2.6 + Math.sin(time * 14) * 0.2;
    arms[1].rotation.z = 2.6 - Math.sin(time * 14) * 0.2;
    root.rotation.y = Math.sin(time * 3) * 0.3;
  } else if (mode === 'drink') {
    arms[0].rotation.x = -1.4 + Math.sin(time * 1.1 + seed) * 0.35;
    arms[0].rotation.z = -0.3;
    head.rotation.x = Math.max(0, Math.sin(time * 1.1 + seed)) * -0.18;
  } else if (mode === 'read') {
    arms[0].rotation.x = -1.0;
    arms[1].rotation.x = -1.0;
    arms[0].rotation.z = 0.3;
    arms[1].rotation.z = -0.3;
    head.rotation.x = 0.18;
    head.rotation.y = Math.sin(time * 0.4 + seed) * 0.1;
  } else if (mode === 'talk') {
    arms[0].rotation.x = -0.5 + Math.sin(time * 3 + seed) * 0.35;
    arms[1].rotation.x = -0.35 + Math.cos(time * 2.4 + seed) * 0.3;
    head.rotation.y = Math.sin(time * 1.3 + seed) * 0.25;
  } else {
    head.rotation.y = Math.sin(time * 0.85 + seed) * 0.08;
    arms[0].rotation.x = Math.sin(time * 1.4) * 0.035;
    arms[1].rotation.x = -arms[0].rotation.x;
  }
}
