import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RING,
  SEGMENTS,
  seats,
  tables,
  route,
  spots,
  loungeSeats,
  ceoWaitSpot,
  segmentIndex,
  segmentAt,
  toPolar,
  TABLE_RADIUS,
} from '../src/game/campus.js';
import { loadWorkerCatalog } from '../server/workers.js';

// Distance from a point to a radial table's footprint (long axis along the radius).
function insideTable(point, table) {
  const dx = point.x - table.center.x,
    dz = point.z - table.center.z;
  const along = dx * Math.cos(table.angle) + dz * Math.sin(table.angle);
  const across = -dx * Math.sin(table.angle) + dz * Math.cos(table.angle);
  return Math.abs(along) < 3.8 && Math.abs(across) < 0.75;
}

test('every department studio seats its whole roster at desks inside the building', () => {
  const catalog = loadWorkerCatalog('/nonexistent');
  for (const segment of SEGMENTS.filter((s) => s.kind === 'dept')) {
    const i = segmentIndex(segment.id);
    const list = seats(i);
    const members = catalog.workers.filter((w) => w.department === segment.id).length;
    assert.ok(list.length >= members, `${segment.id} needs ${members} seats`);
    const keys = new Set(list.map((s) => `${s.x.toFixed(2)},${s.z.toFixed(2)}`));
    assert.equal(keys.size, list.length, 'no two employees share a chair');
    for (const seat of list) {
      const { r } = toPolar(seat);
      assert.ok(r > RING.inner + 1 && r < RING.outer - 1);
      assert.equal(segmentAt(seat).segment.id, segment.id, 'seat stays in its studio');
      assert.ok(!tables(i).some((t) => insideTable(seat, t)), 'nobody sits on a table');
    }
  }
});

test('walking routes use the corridor, doors and pavilion terrace without crossing desks', () => {
  const marketing = segmentIndex('marketing');
  const desk = seats(marketing)[7];
  const allTables = SEGMENTS.flatMap((s, i) => (s.kind === 'dept' ? tables(i) : []));
  const destinations = [
    ...spots(),
    ...loungeSeats(),
    ceoWaitSpot(marketing, 0),
    ceoWaitSpot(marketing, 3),
    seats(segmentIndex('engineering'))[12],
  ];
  for (const target of destinations) {
    const path = route(desk, target, { fromAisle: desk.aisle, toAisle: target.aisle });
    assert.ok(path.length > 0);
    const last = path.at(-1);
    assert.ok(Math.hypot(last.x - target.x, last.z - target.z) < 0.01, 'route ends at the target');
    for (const point of path.slice(1, -1)) {
      const { r } = toPolar(point);
      assert.ok(r < RING.outer, 'never walks through the facade');
      assert.ok(r > RING.pavilion, 'never walks through the CEO pavilion glass');
      assert.ok(!allTables.some((t) => insideTable(point, t)), 'waypoints avoid tables');
    }
  }
  const wait = ceoWaitSpot(marketing, 0);
  assert.ok(Math.abs(toPolar(wait).r - RING.pavilionWait) < 0.01);
  assert.equal(segmentAt({ x: 0, z: 0 }).zone, 'ceo');
  assert.ok(TABLE_RADIUS > RING.corridor);
});
