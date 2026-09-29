export const PLACES = {
  scout: [-7, -1.7],
  quinn: [-1, -3],
  boss: [7, -2.6],
  scoutHall: [-7, 1.8],
  quinnHall: [-1, 1.8],
  leftHandoff: [-4.2, 1.8],
  rightHandoff: [-2.7, 1.8],
  door: [4, 1.8],
  chamber: [5, -0.5],
  coffee: [-8.8, 4.5],
  loungeGate: [1.4, 3],
  lounge: [0.8, 6],
  window: [-10, -4.5],
  west: [-10, 1.8],
};
const EDGES = [
  ['scout', 'scoutHall'],
  ['quinn', 'quinnHall'],
  ['scoutHall', 'leftHandoff'],
  ['leftHandoff', 'rightHandoff'],
  ['rightHandoff', 'quinnHall'],
  ['quinnHall', 'door'],
  ['door', 'chamber'],
  ['chamber', 'boss'],
  ['scoutHall', 'coffee'],
  ['quinnHall', 'loungeGate'],
  ['loungeGate', 'lounge'],
  ['scoutHall', 'west'],
  ['west', 'window'],
];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export function findRoute(from, destination) {
  if (!PLACES[destination]) throw new Error('Unknown office destination');
  const start = Object.keys(PLACES).reduce((a, b) =>
    distance(from, PLACES[a]) < distance(from, PLACES[b]) ? a : b,
  );
  const costs = { [start]: 0 },
    previous = {},
    todo = new Set(Object.keys(PLACES));
  while (todo.size) {
    const current = [...todo].sort((a, b) => (costs[a] ?? Infinity) - (costs[b] ?? Infinity))[0];
    todo.delete(current);
    if (current === destination) break;
    for (const edge of EDGES.filter((e) => e.includes(current))) {
      const next = edge.find((n) => n !== current),
        cost = costs[current] + distance(PLACES[current], PLACES[next]);
      if (cost < (costs[next] ?? Infinity)) {
        costs[next] = cost;
        previous[next] = current;
      }
    }
  }
  const path = [destination];
  while (path[0] !== start && previous[path[0]]) path.unshift(previous[path[0]]);
  return path.map((p) => [...PLACES[p]]).filter((p) => distance(from, p) > 0.08);
}
