import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../server/store.js';
import { createVault } from '../server/vault.js';
import { SOURCES, parseFeed, trustedUrl, fetchText, extractArticle } from '../server/sources.js';
import { LocalModel, finishEditorial } from '../server/llm.js';
import { composePosts, validatePosts, publishPost, PublishError } from '../server/publisher.js';
import { Office } from '../server/workflow.js';
import { createApp } from '../server/index.js';
import { findRoute, PLACES } from '../src/game/navigation.js';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'butler-test-')),
    store = createStore(dir),
    vault = createVault(dir);
  for (const id of ['researcher', 'manager'])
    store.saveWorker(
      { id, defaultDeployment: 'undeployed', skillIds: [] },
      { deployment: 'deployed' },
    );
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { dir, store, vault };
}
const date = new Date().toISOString();
const source = SOURCES[0];
const article = {
  title: 'A new AI research model',
  sourceName: 'OpenAI',
  sourceId: 'openai',
  url: 'https://openai.com/news/test',
  publishedAt: date,
};
const quote = 'The research model is now available to developers around the world.';
const html = `<html><body><nav>Ignore this navigation</nav><article><p>${quote}</p><p>Researchers can explore the model with a range of documented tools and evaluate its performance on their own tasks.</p><p>The project includes documentation and examples to help teams understand the new capabilities and limitations.</p></article></body></html>`;
function rss(entries = [{ url: article.url, date, title: article.title }]) {
  return `<rss><channel>${entries.map((e) => `<item><title>${e.title}</title><link>${e.url}</link><pubDate>${e.date}</pubDate></item>`).join('')}</channel></rss>`;
}
function draft(store, overrides = {}) {
  const posts = composePosts(article, quote);
  return store.addDraft({
    ...article,
    quote,
    summary: quote,
    checkedAt: date,
    evidence: { quoteMatched: true, primarySource: true },
    platforms: ['linkedin', 'x'],
    posts,
    canonicalPosts: posts,
    approvedAt: null,
    ...overrides,
  });
}
const quietModel = {
  status: async () => ({ online: false }),
  summarize: async () => {
    throw new Error('Model offline; used extractive brief.');
  },
  unload: async () => {},
};
const polishedWriting = {
  summary:
    'OpenAI announced a research model available to developers. Its documentation and examples help teams explore capabilities and limitations on their own tasks.',
  keyPoints: [
    'The model is available to developers.',
    'Documentation and examples support evaluation on individual tasks.',
  ],
  linkedin:
    'OpenAI has announced a research model that developers can explore with documented tools.\n\nThe announcement points to documentation and examples that help teams understand its capabilities and limitations. Developers can evaluate performance on their own tasks, rather than relying only on a broad description of what the model can do.\n\nFor teams assessing a new model, that task-specific evaluation is a useful starting point.',
  x: 'OpenAI announced a research model available to developers, with documentation and examples to help teams evaluate its capabilities and limitations on their own tasks.',
  caveat: 'This is a first-party announcement, not independent validation.',
};
const composition = {
  ...polishedWriting,
  opening: polishedWriting.linkedin.split('\n\n')[0],
  details: [
    'The documentation and examples help teams understand the research model’s capabilities and limitations.',
    'The announcement says developers can evaluate the model on their own tasks using documented tools.',
  ],
  perspective:
    'For teams assessing a new model, task-specific evaluation is a useful starting point.',
};
const readyDraft = () =>
  finishEditorial({ ...article, text: extractArticle(html).text }, composition, {
    supported: true,
    issues: [],
  });

test('office routes enter the boss chamber through its doorway and avoid the lounge table', () => {
  const path = findRoute(PLACES.scout, 'boss');
  assert.deepEqual(path.slice(-3), [PLACES.door, PLACES.chamber, PLACES.boss]);
  assert.deepEqual(findRoute(PLACES.quinnHall, 'lounge'), [PLACES.loungeGate, PLACES.lounge]);
  assert.throws(() => findRoute(PLACES.scout, 'outside'), /Unknown/);
});
test('editorial output keeps detailed posts, source links and a weighted X limit', () => {
  const refined = readyDraft();
  assert.equal(refined.editorial.status, 'ready');
  assert.equal(refined.keyPoints.length, 2);
  assert.ok(refined.posts.linkedin.includes('\n\n'));
  assert.ok(refined.posts.linkedin.endsWith(article.url));
  validatePosts(refined.posts, ['linkedin', 'x']);
  assert.throws(
    () =>
      finishEditorial(
        { ...article, text: html },
        { ...polishedWriting, x: 'Research🧠 '.repeat(100) },
        { supported: true, issues: [] },
      ),
    /too long/,
  );
});
test('unsupported numbers, invented links and failed source reviews cannot pass editorial checks', () => {
  for (const change of [
    { x: 'The model has 900 billion parameters.' },
    { x: 'See https://invented.test for details.' },
    { x: 'We have released our new model to developers.' },
    { x: 'The model explains 情感 to developers.' },
  ]) {
    assert.throws(() =>
      finishEditorial(
        { ...article, text: html },
        { ...polishedWriting, ...change },
        { supported: true, issues: [] },
      ),
    );
  }
  assert.throws(
    () =>
      finishEditorial({ ...article, text: html }, composition, {
        supported: false,
        issues: ['Availability is not stated.'],
      }),
    /Availability/,
  );
});
test('editorial checks catch invented quoted names, partial number matches and copied passages', () => {
  const source = {
    ...article,
    text: extractArticle(html).text + ' The project tested 9000 tasks.',
  };
  for (const change of [
    { summary: 'The model is named "Fantastic New Model".' },
    { x: 'The project tested 900 tasks.' },
    { linkedin: extractArticle(html).text },
  ]) {
    assert.throws(() =>
      finishEditorial(source, { ...polishedWriting, ...change }, { supported: true, issues: [] }),
    );
  }
});
test('writer makes one corrective attempt, unloads each pass, and preserves unresolved flags', async () => {
  const requests = [],
    replies = [
      composition,
      { supported: false, issues: ['Check attribution.'] },
      composition,
      { supported: false, issues: ['Attribution still needs review.'] },
    ];
  let unloads = 0;
  const model = new LocalModel(async (url, init) => {
    if (url.endsWith('/generate')) {
      unloads++;
      return Response.json({});
    }
    requests.push(JSON.parse(init.body));
    return Response.json({ message: { content: JSON.stringify(replies.shift()) } });
  });
  const result = await model.writePosts({ ...article, text: html }, 'qwen3:1.7b');
  assert.equal(requests.length, 4);
  assert.equal(unloads, 4);
  assert.match(requests[2].messages[1].content, /Check attribution/);
  assert.equal(result.editorial.status, 'needs-review');
  assert.match(result.editorial.issues[0], /Attribution still/);
  assert.ok(result.posts.linkedin.includes(composition.details[0]));
  assert.ok(result.posts.linkedin.endsWith(article.url));
  assert.equal(model.busy, false);
});
test('stopping between writing and review does not launch another inference', async () => {
  let active = true,
    calls = 0;
  const model = new LocalModel(async (url) => {
    if (url.endsWith('/generate')) return Response.json({});
    calls++;
    active = false;
    return Response.json({ message: { content: JSON.stringify(composition) } });
  });
  await assert.rejects(
    model.writePosts({ ...article, text: html }, 'qwen3:1.7b', '', () => active),
    /stopped/,
  );
  assert.equal(calls, 1);
});
test('rewrite replaces basic copy, refreshes evidence, archives the previous version and clears approval', async (t) => {
  const { store, vault } = fixture(t);
  const d = draft(store, {
    approvedAt: date,
    quote: 'This sentence was removed from the publisher.',
  });
  const office = new Office(store, { ...quietModel, writePosts: async () => readyDraft() }, vault, {
    fetchText: async (url) => ({ url, text: html }),
  });
  await office.refine(d.id, 'Concrete details, no hype.');
  const after = store.draft(d.id);
  assert.equal(after.posts.linkedin, readyDraft().posts.linkedin);
  assert.equal(after.approvedAt, null);
  assert.equal(after.revisions[0].posts.linkedin, d.posts.linkedin);
  assert.equal(after.quote, quote);
  assert.equal(after.evidence.quoteMatched, true);
  assert.equal(after.writingNotes, 'Concrete details, no hype.');
  assert.deepEqual(
    store.scenes().map((e) => e.action),
    ['rewrite', 'approval'],
  );
  store.delivery(d.id, 'x', 'published', 'receipt');
  await assert.rejects(office.refine(d.id), /cannot be rewritten/);
});
test('automatic mode holds basic and editorially flagged drafts for the boss', async (t) => {
  for (const flagged of [false, true]) {
    const { store, vault } = fixture(t);
    store.saveSettings({
      autoPublish: true,
      useModel: flagged,
      enabledSources: ['openai'],
      platforms: ['x'],
    });
    const model = {
      ...quietModel,
      summarize: async () => ({ summary: quote, excerptIndex: 0 }),
      writePosts: async () => ({
        ...readyDraft(),
        editorial: { status: 'needs-review', issues: ['Needs a human check.'] },
      }),
    };
    let calls = 0;
    const office = new Office(store, model, vault, {
      fetchText: async (url) => ({ url, text: url.endsWith('rss.xml') ? rss() : html }),
      publishPost: async () => {
        calls++;
        return 'unexpected';
      },
    });
    await office.runScan();
    assert.equal(calls, 0);
    assert.equal(store.drafts()[0].status, 'review');
    assert.deepEqual(
      store.scenes().map((e) => e.action),
      ['research', 'handoff', 'approval'],
    );
  }
});

test('feed accepts dated trusted links and rejects stale, future, undated, off-domain links', () => {
  const now = Date.now();
  const entries = [
    { title: 'Good &amp; current', url: article.url + '?utm_source=rss', date },
    {
      title: 'Old',
      url: 'https://openai.com/old',
      date: new Date(now - 80 * 3600000).toISOString(),
    },
    {
      title: 'Future',
      url: 'https://openai.com/future',
      date: new Date(now + 3600000).toISOString(),
    },
    { title: 'No date', url: 'https://openai.com/none', date: '' },
    { title: 'Impostor', url: 'https://openai.com.fake.test/news', date },
  ];
  const result = parseFeed(rss(entries), source, 72, now);
  assert.equal(result.length, 1);
  assert.equal(result[0].url, article.url);
  assert.equal(result[0].title, 'Good & current');
});
test('rejects insecure, credential-bearing, nonstandard-port and off-domain URLs', () => {
  for (const u of [
    'http://openai.com/a',
    'https://u:p@openai.com/a',
    'https://openai.com:8080/a',
    'http://127.0.0.1/a',
    'https://openai.com.evil.test/a',
  ])
    assert.throws(() => trustedUrl(u, source));
});
test('redirect is checked before following it', async () => {
  let calls = 0;
  await assert.rejects(
    fetchText(article.url, source, async () => {
      calls++;
      return new Response('', { status: 302, headers: { location: 'http://127.0.0.1/admin' } });
    }),
  );
  assert.equal(calls, 1);
});
test('feed refuses XML entity declarations', () =>
  assert.throws(() => parseFeed('<!DOCTYPE foo [<!ENTITY a "x">]><rss/>', source, 72)));
test('extracts actual article paragraphs and complete short excerpts', () => {
  const result = extractArticle(html);
  assert.ok(result.candidates.includes(quote));
  assert.ok(!result.text.includes('navigation'));
  for (const candidate of result.candidates) assert.ok(candidate.split(/\s+/).length <= 24);
  assert.throws(() => extractArticle('<main>Access denied</main>'));
});
test('posts include attribution and source; X respects weighted Unicode and URL lengths', () => {
  const posts = composePosts({ ...article, title: '机器学习🧠 '.repeat(100) }, quote);
  validatePosts(posts, ['x']);
  assert.ok(posts.x.endsWith(article.url));
  assert.ok(posts.linkedin.includes(quote));
  assert.throws(() => validatePosts({ x: '🧠'.repeat(200), linkedin: 'valid' }, ['x']));
});
test('model always uses loopback, fixed context, no thinking, and unloads after success', async () => {
  const calls = [];
  const model = new LocalModel(async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return Response.json(
      url.endsWith('/chat')
        ? {
            message: {
              content: JSON.stringify({
                summary: 'The publisher announced a research model.',
                excerptIndex: 0,
              }),
            },
          }
        : {},
    );
  });
  await model.summarize({ ...article, text: html, candidates: [quote] }, 'qwen3:1.7b');
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => c.url.startsWith('http://127.0.0.1:11434/')));
  assert.equal(calls[0].body.keep_alive, 0);
  assert.equal(calls[0].body.think, false);
  assert.equal(calls[0].body.options.num_ctx, 4096);
  assert.equal(calls[1].body.keep_alive, 0);
  assert.equal(model.busy, false);
});
test('malformed model output still unloads and releases the shared model', async () => {
  let unloaded = false;
  const model = new LocalModel(async (url) => {
    if (url.endsWith('/generate')) unloaded = true;
    return Response.json({ message: { content: 'not json' } });
  });
  await assert.rejects(
    model.summarize({ ...article, text: html, candidates: [quote] }, 'qwen3:1.7b'),
  );
  assert.equal(unloaded, true);
  assert.equal(model.busy, false);
});
test('vault encrypts secrets at rest and never includes tokens in status', (t) => {
  const { vault, dir } = fixture(t);
  vault.save({ xToken: 'super-secret-x-token' });
  assert.equal(vault.read().xToken, 'super-secret-x-token');
  assert.equal(vault.status().x, true);
  assert.ok(!JSON.stringify(vault.status()).includes('super-secret'));
  assert.ok(!readFileSync(join(dir, 'credentials.enc'), 'utf8').includes('super-secret'));
  vault.save({ xToken: '' });
  assert.equal(vault.status().x, false);
});
test('scan hands off real evidence, tracks both employees, and deduplicates reruns', async (t) => {
  const { store, vault } = fixture(t);
  store.saveSettings({ enabledSources: ['openai'], useModel: false });
  const office = new Office(store, quietModel, vault, {
    fetchText: async (url) => ({ url, text: url.endsWith('rss.xml') ? rss() : html }),
  });
  await office.runScan();
  assert.equal(store.drafts().length, 1);
  const d = store.drafts()[0];
  assert.equal(d.status, 'review');
  assert.equal(d.evidence.quoteMatched, true);
  assert.equal(d.method, 'extractive');
  assert.equal(store.tasks().length, 2);
  assert.ok(
    store.tasks().every((t) => t.status === 'completed' && t.duration_ms >= 0 && t.finished_at),
  );
  await office.runScan();
  assert.equal(store.drafts().length, 1);
  assert.equal(office.busy, false);
  assert.equal(office.agents.manager.status, 'idle');
});
test('feed failures result in an honest failed assignment', async (t) => {
  const { store, vault } = fixture(t);
  const office = new Office(store, quietModel, vault, {
    fetchText: async () => {
      throw new Error('HTTP 403');
    },
  });
  await office.runScan();
  assert.equal(store.tasks()[0].status, 'failed');
  assert.equal(store.drafts().length, 0);
  assert.equal(office.busy, false);
});
test('model outage falls back to attributed excerpts, without claiming model-generated output', async (t) => {
  const { store, vault } = fixture(t);
  store.saveSettings({ enabledSources: ['openai'] });
  const office = new Office(store, quietModel, vault, {
    fetchText: async (url) => ({ url, text: url.endsWith('rss.xml') ? rss() : html }),
  });
  await office.runScan();
  assert.equal(store.drafts()[0].method, 'extractive');
  assert.ok(store.events().some((e) => e.kind === 'warning'));
});
test('manual publishing requires approval and default mode never sends during scan', async (t) => {
  const { store, vault } = fixture(t);
  let calls = 0;
  const office = new Office(store, quietModel, vault, {
    publishPost: async () => {
      calls++;
      return '1';
    },
  });
  const d = draft(store);
  await assert.rejects(office.deliver(d.id), /Approve/);
  assert.equal(calls, 0);
});
test('partial publishing retries only the failed platform and refuses duplicate successful sends', async (t) => {
  const { store, vault } = fixture(t);
  vault.save({ xToken: 'x', linkedinToken: 'li', linkedinAuthor: 'urn:li:person:1' });
  let calls = [];
  const office = new Office(store, quietModel, vault, {
    publishPost: async (p) => {
      calls.push(p);
      if (p === 'x' && calls.length === 2) throw new PublishError('Rate limited');
      return 'remote-' + p;
    },
  });
  const d = draft(store, { approvedAt: date });
  await office.publish(d.id);
  assert.equal(store.draft(d.id).status, 'attention');
  assert.deepEqual(calls, ['linkedin', 'x']);
  await office.publish(d.id);
  assert.deepEqual(calls, ['linkedin', 'x', 'x']);
  assert.equal(store.draft(d.id).status, 'published');
  await office.publish(d.id);
  assert.equal(calls.length, 3);
});
test('uncertain network outcome never automatically retries', async (t) => {
  const { store, vault } = fixture(t);
  vault.save({ xToken: 'x' });
  let calls = 0;
  const office = new Office(store, quietModel, vault, {
    publishPost: async () => {
      calls++;
      throw new PublishError('Network timeout', true);
    },
  });
  const d = draft(store, { platforms: ['x'], approvedAt: date });
  await office.publish(d.id);
  await office.publish(d.id);
  assert.equal(calls, 1);
  assert.equal(store.deliveries(d.id)[0].status, 'uncertain');
});
test('restart reconciles in-flight tasks and marks publishing outcome uncertain', (t) => {
  const { store, vault } = fixture(t);
  const d = draft(store);
  store.startTask('manager', 'Publish');
  store.updateDraft(d.id, {}, 'publishing');
  store.delivery(d.id, 'x', 'sending');
  new Office(store, quietModel, vault);
  assert.equal(store.tasks()[0].status, 'interrupted');
  assert.equal(store.draft(d.id).status, 'attention');
  assert.equal(store.deliveries(d.id)[0].status, 'uncertain');
});
test('approval cannot be bypassed by legacy automatic mode and stale articles remain blocked', async (t) => {
  const { store, vault } = fixture(t);
  store.saveSettings({ autoPublish: true });
  const office = new Office(store, quietModel, vault);
  const d = draft(store);
  store.updateDraft(d.id, { posts: { ...d.posts, x: 'An unsupported claim' } });
  await assert.rejects(office.deliver(d.id, true), /CEO approval/);
  const stale = draft(store, {
    url: article.url + '/stale',
    publishedAt: new Date(Date.now() - 90 * 3600000).toISOString(),
    approvedAt: date,
  });
  await assert.rejects(office.deliver(stale.id), /freshness/);
});
test('legacy automatic setting cannot publish even editorially ready drafts', async (t) => {
  const { store, vault } = fixture(t);
  store.saveSettings({
    autoPublish: true,
    useModel: true,
    enabledSources: ['openai'],
    platforms: ['x'],
  });
  vault.save({ xToken: 'x' });
  let calls = 0;
  const office = new Office(
    store,
    {
      ...quietModel,
      summarize: async () => ({ summary: quote, excerptIndex: 0 }),
      writePosts: async () => ({
        posts: composePosts(article, quote),
        summary: quote,
        editorial: { status: 'ready' },
      }),
    },
    vault,
    {
      fetchText: async (url) => ({ url, text: url.endsWith('rss.xml') ? rss() : html }),
      publishPost: async () => {
        calls++;
        return '1';
      },
    },
  );
  await office.runScan();
  assert.equal(calls, 0);
  assert.equal(store.drafts()[0].status, 'review');
  assert.equal(store.settings().autoPublish, false);
});
test('publisher uses user OAuth, captures receipt, and treats missing receipt as uncertain', async () => {
  let request;
  const id = await publishPost(
    'linkedin',
    'A post',
    { linkedinToken: 'li', linkedinAuthor: 'urn:li:person:1' },
    async (url, init) => {
      request = { url, ...init };
      return new Response('', { status: 201, headers: { 'x-restli-id': 'urn:li:share:123' } });
    },
  );
  assert.equal(id, 'urn:li:share:123');
  assert.equal(request.headers.Authorization, 'Bearer li');
  assert.equal(JSON.parse(request.body).lifecycleState, 'PUBLISHED');
  await assert.rejects(
    publishPost('x', 'A post', { xToken: 'x' }, async () => Response.json({})),
    (e) => e.uncertain === true,
  );
  await assert.rejects(
    publishPost('x', 'A post', { xToken: 'x' }, async () => new Response('', { status: 503 })),
    (e) => e.uncertain === true,
  );
});
test('local API blocks hostile origins, browser form submissions, and invalid settings', async (t) => {
  const { store, vault } = fixture(t);
  const { app } = createApp({ store, vault, model: quietModel });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal(
    (await fetch(base + '/api/state', { headers: { Origin: 'https://evil.test' } })).status,
    403,
  );
  assert.equal((await fetch(base + '/api/scan', { method: 'POST' })).status, 403);
  const h = { 'Content-Type': 'application/json', 'X-Butler-Client': 'office' };
  assert.equal(
    (
      await fetch(base + '/api/settings', {
        method: 'PATCH',
        headers: h,
        body: JSON.stringify({ model: 'cloud-model', platforms: [] }),
      })
    ).status,
    400,
  );
  const d = draft(store, { approvedAt: date });
  const changed = {
    posts: { ...d.posts, linkedin: 'Edited after approval' },
    platforms: ['linkedin'],
  };
  assert.equal(
    (
      await fetch(base + `/api/drafts/${d.id}`, {
        method: 'PATCH',
        headers: h,
        body: JSON.stringify(changed),
      })
    ).status,
    200,
  );
  assert.equal(store.draft(d.id).approvedAt, null);
  assert.equal(store.draft(d.id).editorial.status, 'edited');
  const state = await (await fetch(base + '/api/state')).json();
  assert.ok(!JSON.stringify(state).includes('xToken'));
});
test('overlapping assignments are rejected instead of creating competing model calls', async (t) => {
  const { store, vault } = fixture(t);
  const office = new Office(store, quietModel, vault);
  office.busy = true;
  await assert.rejects(office.runScan(), /already running/);
  await assert.rejects(office.publish('none'), /current assignment/);
});

test('Hugging Face community hosting is not treated as official publisher verification', () => {
  const hf = SOURCES.find((s) => s.id === 'huggingface');
  assert.equal(
    trustedUrl('https://huggingface.co/blog/official-release', hf),
    'https://huggingface.co/blog/official-release',
  );
  for (const url of [
    'https://huggingface.co/blog/some-user/claim',
    'https://huggingface.co/blog/community',
    'https://huggingface.co/blog/user%2fclaim',
  ])
    assert.throws(() => trustedUrl(url, hf), /Community/);
  assert.equal(
    parseFeed(
      rss([
        {
          title: 'Unverified community claim',
          url: 'https://huggingface.co/blog/user/claim',
          date,
        },
      ]),
      hf,
      72,
    ).length,
    0,
  );
});

test('an HTML block page is a feed failure and an Atom edit date is not a publication date', () => {
  assert.throws(
    () => parseFeed('<html><body>Access denied</body></html>', source, 72),
    /readable RSS/,
  );
  const atom = `<feed><entry><title>Old announcement, new edit</title><link href="${article.url}"/><updated>${date}</updated></entry></feed>`;
  assert.equal(parseFeed(atom, source, 72).length, 0);
});

test('policy changes quarantine old drafts and publishing rechecks the publisher', async (t) => {
  const { store, vault } = fixture(t);
  const d = draft(store, {
    sourceId: 'huggingface',
    url: 'https://huggingface.co/blog/user/claim',
    approvedAt: date,
  });
  const office = new Office(store, quietModel, vault);
  assert.equal(store.draft(d.id).status, 'rejected');
  assert.equal(store.draft(d.id).approvedAt, null);
  assert.equal(store.draft(d.id).evidence.primarySource, false);
  const addedLater = draft(store, {
    sourceId: 'huggingface',
    url: 'https://huggingface.co/blog/user/another-claim',
    approvedAt: date,
  });
  await assert.rejects(office.deliver(addedLater.id), /Community/);
});

test('research continues past four blocked articles to find a readable story', async (t) => {
  const { store, vault } = fixture(t);
  store.saveSettings({ enabledSources: ['openai'], batchSize: 1, useModel: false });
  const entries = Array.from({ length: 6 }, (_, i) => ({
    url: `https://openai.com/index/story-${i}`,
    date,
    title: `Research story ${i}`,
  }));
  let attempted = 0;
  const office = new Office(store, quietModel, vault, {
    fetchText: async (url) => {
      if (url === source.url) return { url, text: rss(entries) };
      attempted++;
      if (!url.endsWith('story-5')) throw new Error('Publisher returned HTTP 403.');
      return { url, text: html };
    },
  });
  await office.runScan();
  assert.equal(attempted, 6);
  assert.equal(store.drafts().length, 1);
  assert.match(store.tasks().find((v) => v.agent === 'researcher').detail, /5 blocked/);
});
test('blocked stories are reported as attention instead of no eligible articles', async (t) => {
  const { store, vault } = fixture(t);
  store.saveSettings({ enabledSources: ['openai'], useModel: false });
  const office = new Office(store, quietModel, vault, {
    fetchText: async (url) => {
      if (url === source.url) return { url, text: rss() };
      throw new Error('Publisher returned HTTP 403.');
    },
  });
  await office.runScan();
  assert.equal(store.tasks()[0].status, 'attention');
  assert.match(store.tasks()[0].detail, /1 blocked/);
  assert.doesNotMatch(store.tasks()[0].detail, /No new eligible/);
  assert.equal(office.agents.researcher.current, store.tasks()[0].detail);
});
