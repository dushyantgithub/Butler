// Layout of the ring campus: a circular glass building around an orchard
// courtyard, with the CEO pavilion at the centre. Pure maths so routes can be
// tested without WebGL. Polar convention: x = r·cos θ, z = r·sin θ.

export const RING = {
  inner: 22,
  corridor: 23.3,
  tableStart: 24.7,
  tableEnd: 32.3,
  outer: 35,
  pavilion: 5,
  pavilionWait: 6.4,
  height: 2.8,
};
export const SEGMENT_ANGLE = Math.PI / 6;
export const SEGMENTS = [
  { id: 'forum', kind: 'forum', label: 'The Forum' },
  { id: 'research', kind: 'dept' },
  { id: 'marketing', kind: 'dept' },
  { id: 'creative', kind: 'dept' },
  { id: 'cafe', kind: 'cafe', label: 'Café' },
  { id: 'analytics', kind: 'dept' },
  { id: 'engineering', kind: 'dept' },
  { id: 'operations', kind: 'dept' },
  { id: 'library', kind: 'library', label: 'Library' },
  { id: 'compliance', kind: 'dept' },
  { id: 'personal', kind: 'dept' },
  { id: 'lounge', kind: 'lounge', label: 'Talent Lounge' },
];
export const segmentIndex = (id) => SEGMENTS.findIndex((s) => s.id === id);
export const segmentAngle = (index) => index * SEGMENT_ANGLE;
export const polar = (r, a) => ({ x: r * Math.cos(a), z: r * Math.sin(a) });
export const toPolar = ({ x, z }) => ({ r: Math.hypot(x, z), a: Math.atan2(z, x) });
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// Heading for a figure at `from` to face `to` (figures look along +Z at rotation 0).
export const facing = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

export const TABLE_OFFSETS = [0, -0.157, 0.157]; // centre table first, then ±9°
export const TABLE_RADIUS = (RING.tableStart + RING.tableEnd) / 2;
const SEAT_RADII = [26.0, 28.5, 31.0];
const SEAT_LATERAL = 1.3;
const AISLE_LATERAL = 2.15;

export function tables(segment) {
  const base = segmentAngle(segment);
  return TABLE_OFFSETS.map((offset, i) => ({
    index: i,
    angle: base + offset,
    center: polar(TABLE_RADIUS, base + offset),
  }));
}
// 18 desk seats per department studio: 3 radial tables × 3 rows × 2 sides.
export function seats(segment) {
  const out = [];
  for (const table of tables(segment)) {
    const lateral = { x: -Math.sin(table.angle), z: Math.cos(table.angle) };
    for (const r of SEAT_RADII)
      for (const side of [1, -1]) {
        const base = polar(r, table.angle);
        const seat = {
          x: base.x + side * SEAT_LATERAL * lateral.x,
          z: base.z + side * SEAT_LATERAL * lateral.z,
        };
        const aisle = {
          x: base.x + side * AISLE_LATERAL * lateral.x,
          z: base.z + side * AISLE_LATERAL * lateral.z,
        };
        out.push({
          ...seat,
          aisle,
          heading: facing(seat, base),
          table: table.index,
          monitor: { x: base.x + side * 0.32 * lateral.x, z: base.z + side * 0.32 * lateral.z },
          monitorHeading: facing(base, seat),
        });
      }
  }
  return out;
}

function arc(radius, from, to, step = 0.09) {
  const delta = wrap(to - from);
  const n = Math.max(1, Math.ceil(Math.abs(delta) / step));
  const pts = [];
  for (let i = 1; i <= n; i++) pts.push(polar(radius, from + (delta * i) / n));
  return pts;
}
const doorAngle = (a) => Math.round(a / SEGMENT_ANGLE) * SEGMENT_ANGLE;

// Walkable route between two points on the campus. Inside the building people
// use the inner corridor; they reach the courtyard through the door at each
// segment's centre and circle the pavilion on its terrace.
export function route(from, to, { fromAisle, toAisle } = {}) {
  const pts = [];
  const f = toPolar(fromAisle || from),
    t = toPolar(toAisle || to);
  const inside = (r) => r > RING.inner + 0.4;
  if (fromAisle) pts.push({ ...fromAisle });
  if (inside(f.r) && inside(t.r)) {
    if (Math.abs(wrap(t.a - f.a)) < 0.02 && Math.abs(f.r - t.r) < 1.2) {
      // Same aisle: step straight across.
    } else {
      pts.push(polar(RING.corridor, f.a));
      pts.push(...arc(RING.corridor, f.a, t.a));
    }
  } else if (inside(f.r) && !inside(t.r)) {
    const door = doorAngle(t.r < RING.pavilionWait + 1 ? t.a : f.a);
    pts.push(polar(RING.corridor, f.a), ...arc(RING.corridor, f.a, door));
    pts.push(polar(RING.inner - 1.2, door));
    if (t.r < 13) {
      pts.push(polar(RING.pavilionWait, door), ...arc(RING.pavilionWait, door, t.a));
    }
  } else if (!inside(f.r) && inside(t.r)) {
    const door = doorAngle(f.r < RING.pavilionWait + 1 ? f.a : t.a);
    if (f.r < 13) pts.push(...arc(RING.pavilionWait, f.a, door));
    pts.push(polar(RING.inner - 1.2, door), polar(RING.corridor, door));
    pts.push(...arc(RING.corridor, door, t.a));
  } else if (f.r < 13 && t.r < 13) {
    pts.push(polar(RING.pavilionWait, f.a), ...arc(RING.pavilionWait, f.a, t.a));
  }
  if (toAisle) pts.push({ ...toAisle });
  pts.push({ x: to.x, z: to.z });
  // Remove zero-length hops.
  const out = [];
  let last = from;
  for (const p of pts) {
    if (Math.hypot(p.x - last.x, p.z - last.z) > 0.05) out.push(p);
    last = p;
  }
  return out;
}

// Places to visit on a break. Each spot has a pose and optional height.
export function spots() {
  const at = (id) => segmentAngle(segmentIndex(id));
  const list = [];
  const push = (zone, r, da, pose, y = 0, faceTo = null) => {
    const a = at(zone) + da;
    const p = polar(r, a);
    list.push({
      zone,
      ...p,
      pose,
      y,
      heading: faceTo ? facing(p, faceTo(a)) : facing(p, polar(0, 0)),
    });
  };
  // Café: standing at the counter, and around bar tables.
  for (const da of [-0.12, -0.06, 0.06, 0.12])
    push('cafe', 31.2, da, 'drink', 0, (a) => polar(34, a));
  for (const [r, da] of [
    [27.4, -0.1],
    [27.4, 0.1],
    [29.6, -0.02],
    [29.6, 0.13],
    [25.9, 0.03],
  ])
    push('cafe', r, da, 'drink', 0, () => polar(28.5, at('cafe')));
  // Forum: seated on tiered steps facing the wall screen.
  const tiers = [
    [27.8, 0.32],
    [29.4, 0.64],
    [31.0, 0.96],
  ];
  for (const [r, h] of tiers)
    for (const da of [-0.14, -0.07, 0, 0.07, 0.14])
      push('forum', r, da, 'sit', h - 0.42, (a) => polar(20, a));
  // Library: reading beside the long table.
  for (const da of [-0.08, -0.03, 0.03, 0.08])
    for (const side of [-1, 1])
      push('library', 28.4 + side * 1.0, da, 'read', 0, (a) => polar(28.4, a));
  // Orchard walk in the courtyard.
  for (const [r, a] of [
    [10, 0.45],
    [11, 1.3],
    [16, 2.25],
    [12, 3.35],
    [17, 4.1],
    [10.5, 5.0],
    [15.5, 5.75],
    [17.5, 0.95],
  ])
    list.push({ zone: 'orchard', ...polar(r, a), pose: 'talk', y: 0, heading: a + Math.PI });
  return list;
}
// Benched employees relax in the talent lounge.
export function loungeSeats() {
  const base = segmentAngle(segmentIndex('lounge'));
  const out = [];
  for (const r of [26.3, 28.6, 30.9])
    for (const side of [-1, 1])
      for (const k of [-1, 0, 1]) {
        const a = base + side * (0.1 + k * 0.032);
        const p = polar(r + 0.4, a);
        out.push({ ...p, heading: facing(p, polar(r - 3, a)), pose: 'sit', y: 0 });
      }
  return out;
}
// Where employees wait with a folder outside the CEO pavilion.
export function ceoWaitSpot(segment, slot = 0) {
  const a = segmentAngle(segment) + (slot % 2 ? 1 : -1) * Math.ceil(slot / 2) * 0.16;
  const p = polar(RING.pavilionWait, a);
  return { ...p, heading: facing(p, { x: 0, z: 0 }), pose: 'carry', y: 0 };
}
export function segmentAt({ x, z }) {
  const { r, a } = toPolar({ x, z });
  if (r < RING.pavilion + 0.8) return { zone: 'ceo' };
  if (r < RING.inner) return { zone: 'courtyard' };
  if (r > RING.outer + 1) return { zone: 'outside' };
  const index = ((Math.round(a / SEGMENT_ANGLE) % 12) + 12) % 12;
  return { zone: 'segment', index, segment: SEGMENTS[index] };
}
