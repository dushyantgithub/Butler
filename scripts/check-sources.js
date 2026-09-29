import { SOURCES, fetchText, parseFeed } from '../server/sources.js';

// Public feed audit only: no model, database, credentials or publishing access.
let next = 0;
const results = [];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (next < SOURCES.length) {
      const source = SOURCES[next++];
      try {
        const feed = await fetchText(source.url, source);
        const recent = parseFeed(feed.text, source, 72);
        results.push({ source: source.name, ok: true, recentCandidates: recent.length });
      } catch (error) {
        results.push({ source: source.name, ok: false, error: error.message });
      }
    }
  }),
);
results.sort((a, b) => a.source.localeCompare(b.source));
console.log(
  JSON.stringify(
    {
      checkedAt: new Date().toISOString(),
      total: SOURCES.length,
      reachable: results.filter((s) => s.ok).length,
      results,
    },
    null,
    2,
  ),
);
if (results.some((s) => !s.ok)) process.exitCode = 1;
