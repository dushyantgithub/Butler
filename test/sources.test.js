import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCES, trustedUrl, parseFeed, readArticle } from '../server/sources.js';
import { Office } from '../server/workflow.js';
import { createStore } from '../server/store.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const source = SOURCES.find((s) => s.repo === 'pytorch/pytorch');
const now = Date.now();
const date = new Date(now - 3600000).toISOString();
const article = {
  title: 'PyTorch: a stable release',
  sourceId: source.id,
  sourceName: source.name,
  url: `https://github.com/${source.repo}/releases/tag/v99.0`,
  publishedAt: date,
};
const body =
  'The new release improves inference performance for teams working with large language models.\n\nDevelopers can use the documented tools to evaluate the changes against their own workloads.\n\nThe release includes examples that explain the supported configurations and limitations for deployment.';
const release = {
  html_url: article.url,
  tag_name: 'v99.0',
  published_at: date,
  draft: false,
  prerelease: false,
  body,
};
const fetchRelease = (data) => async () => ({ text: JSON.stringify(data) });

test('catalog has at least 100 distinct HTTPS feeds with repository-specific project trust', () => {
  assert.ok(SOURCES.length >= 100);
  assert.equal(new Set(SOURCES.map((s) => s.id)).size, SOURCES.length);
  assert.equal(new Set(SOURCES.map((s) => s.url)).size, SOURCES.length);
  for (const s of SOURCES) {
    assert.equal(trustedUrl(s.url, s), s.url);
    if (s.kind === 'github-release')
      assert.equal(s.url, `https://github.com/${s.repo}/releases.atom`);
  }
});

test('GitHub hosting does not approve other repositories, arbitrary API paths or traversal', () => {
  for (const url of [
    'https://github.com/attacker/pytorch/releases/tag/v99.0',
    `https://github.com/${source.repo}/issues/123`,
    `https://api.github.com/repos/${source.repo}/contents/README.md`,
    `https://github.com/${source.repo}/releases/tag/%2e%2e%2f%2e%2e%2fissues/123`,
    `https://github.com/${source.repo}/releases/tag/%5cprivate`,
  ])
    assert.throws(() => trustedUrl(url, source));
});

test('project Atom updates discover candidates but the release API confirms actual publication and identity', async () => {
  const feed = `<feed><entry><title>v99.0</title><link href="${article.url}"/><updated>${date}</updated></entry></feed>`;
  assert.equal(parseFeed(feed, source, 72, now).length, 1);
  const full = await readArticle(article, source, 72, fetchRelease(release), now);
  assert.equal(full.publishedAt, date);
  assert.ok(full.text.includes('inference performance'));
  for (const patch of [
    { published_at: new Date(now - 100 * 3600000).toISOString() },
    { published_at: null },
    { draft: true },
    { prerelease: true },
    { html_url: 'https://github.com/attacker/project/releases/tag/v99.0' },
    { tag_name: 'v98.0' },
    { body: 'Tiny patch' },
  ])
    await assert.rejects(
      readArticle(article, source, 72, fetchRelease({ ...release, ...patch }), now),
    );
});

test('broad technology feeds exclude unrelated articles and release feeds exclude prereleases', () => {
  const publisher = SOURCES.find((s) => s.id === 'cloudflare-blog');
  const feed = `<rss><channel>${['New AI inference tools', 'Our annual office party'].map((title, i) => `<item><title>${title}</title><link>https://blog.cloudflare.com/story-${i}/</link><pubDate>${date}</pubDate></item>`).join('')}</channel></rss>`;
  assert.equal(parseFeed(feed, publisher, 72, now).length, 1);
  const preview = `<feed><entry><title>v99.0-rc1</title><link href="${article.url}-rc1"/><updated>${date}</updated></entry></feed>`;
  assert.equal(parseFeed(preview, source, 72, now).length, 0);
});

test('large library uses at most four concurrent feed requests and stops scheduling after cancellation', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'butler-sources-'));
  const store = createStore(dir);
  for (const id of ['researcher', 'manager'])
    store.saveWorker(
      { id, defaultDeployment: 'undeployed', skillIds: [] },
      { deployment: 'deployed' },
    );
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  let active = 0,
    maximum = 0,
    calls = 0;
  const office = new Office(
    store,
    {},
    { read: () => ({}) },
    {
      fetchText: async () => {
        calls++;
        active++;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        office.stopRequested = true;
        active--;
        return { text: '<rss><channel><title>Empty</title></channel></rss>' };
      },
    },
  );
  await office.runScan();
  assert.equal(maximum, 4);
  assert.equal(calls, 4);
  assert.equal(store.tasks()[0].status, 'cancelled');
});

test('release cache reuses bounded public responses without extending publication freshness', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'butler-cache-'));
  const store = createStore(dir);
  for (const id of ['researcher', 'manager'])
    store.saveWorker(
      { id, defaultDeployment: 'undeployed', skillIds: [] },
      { deployment: 'deployed' },
    );
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  let calls = 0;
  const office = new Office(
    store,
    {},
    { read: () => ({}) },
    {
      fetchText: async () => {
        calls++;
        return { text: JSON.stringify(release) };
      },
    },
  );
  await readArticle(article, source, 72, office.readSource.bind(office), now);
  await readArticle(article, source, 72, office.readSource.bind(office), now);
  assert.equal(calls, 1);
  await assert.rejects(
    readArticle(article, source, 72, office.readSource.bind(office), now + 100 * 3600000),
  );
  assert.equal(calls, 1);
});
