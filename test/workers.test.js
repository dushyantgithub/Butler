import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../server/store.js';
import { Office } from '../server/workflow.js';
import { loadWorkerCatalog, publicCatalog, workerContext } from '../server/workers.js';
import { projectSchema, publicWebsite, readProjectSource } from '../server/projects.js';
import { createApp } from '../server/index.js';

const campaign = {
  title: 'A thoughtful product launch',
  graphicHeadline: 'Make space for ideas',
  summary: 'A campaign based on the supplied product brief.',
  linkedin: 'Discover a thoughtful way to work. Read our product overview for the details.',
  x: 'Discover a thoughtful way to work. Explore our product overview.',
  visualConcept: 'Use generous space and a clear headline with the product in the center.',
  keyPoints: ['Owner supplied product context.'],
  issues: [],
};
function fixture(t, overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'butler-workers-')),
    store = createStore(dir);
  const vault = { read: () => ({ xToken: 'fixture-token' }), status: () => ({}) };
  let input,
    sent = 0;
  const model = {
    campaign: async (brief, context) => {
      input = { brief, context };
      return campaign;
    },
    work: async (brief, context) => {
      input = { brief, context };
      return { report: 'A completed specialist report based on the supplied brief.' };
    },
    ...overrides,
  };
  const catalog = loadWorkerCatalog(dir);
  for (const worker of catalog.workers.filter((w) =>
    ['researcher', 'manager', 'campaign-creative', 'research-planner'].includes(w.id),
  ))
    store.saveWorker(worker, { deployment: 'deployed' });
  const office = new Office(store, model, vault, {
    catalog,
    publishPost: async () => {
      sent++;
      return 'receipt';
    },
    readProjectSource: async (url) => ({
      url,
      title: 'Product page',
      text: 'An owner-operated page describing the product with supporting information.',
      checkedAt: new Date().toISOString(),
    }),
  });
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { dir, store, vault, model, catalog, office, getInput: () => input, sent: () => sent };
}
function project(store) {
  return store.saveProject(
    projectSchema.parse({
      name: 'Example project',
      website: 'https://example.com',
      products: 'A product described by the owner.',
      facts: 'Confirm product details with the owner.',
    }),
  );
}

test('public starter office works without imported folders and covers every skill', (t) => {
  const { catalog, store } = fixture(t);
  assert.equal(catalog.workers.length, 114);
  assert.equal(catalog.skills.length, 501);
  assert.equal(new Set(catalog.workers.map((w) => w.id)).size, 114);
  assert.equal(new Set(catalog.skills.map((s) => s.id)).size, 501);
  for (const skill of catalog.skills)
    assert.ok(
      catalog.workers.some((w) => w.skillIds.includes(skill.id)),
      skill.name,
    );
  assert.ok(catalog.workers.every((w) => w.instructions.length > 40));
  const pub = publicCatalog(catalog, store);
  assert.ok(pub.workers.every((w) => !('instructions' in w)));
  assert.ok(pub.skills.every((s) => !('instructions' in s)));
  assert.ok(catalog.departments.every((d) => catalog.workers.some((w) => w.department === d.id)));
});
test('private imports are optional and duplicate skill names retain distinct stable identities', (t) => {
  const { dir } = fixture(t);
  for (const category of ['Content', 'Marketing']) {
    mkdirSync(join(dir, 'skills', category, 'example'), { recursive: true });
    writeFileSync(
      join(dir, 'skills', category, 'example', 'SKILL.md'),
      '---\nname: example\ndescription: A local skill\n---\nPrivate example instruction',
    );
  }
  const imported = loadWorkerCatalog(dir).skills.filter((s) => s.origin === 'local');
  assert.equal(imported.length, 2);
  assert.notEqual(imported[0].id, imported[1].id);
});
test('deployment and skill selection persist and bench blocks work', async (t) => {
  const { store, catalog, office, dir } = fixture(t),
    worker = catalog.workers[0];
  store.saveWorker(worker, { deployment: 'bench', skillIds: [] });
  assert.throws(() => workerContext(catalog, store, worker.id), /Deploy/);
  await assert.rejects(office.runScan(), /Deploy/);
  assert.equal(store.tasks().length, 0);
  assert.equal(office.canScan(), false);
  const reopened = createStore(dir);
  assert.equal(reopened.workerConfig(worker).deployment, 'bench');
  reopened.close();
  store.saveWorker(worker, { deployment: 'deployed' });
  assert.equal(office.canScan(), true);
  store.saveWorker(worker, { deployment: 'undeployed' });
  assert.throws(() => office.requireWorker(worker.id), /Deploy/);
});
test('campaign uses project evidence and selected skill instructions, waits for CEO and survives restart', async (t) => {
  const f = fixture(t),
    p = project(f.store),
    worker = f.catalog.workers.find((w) => w.id === 'campaign-creative');
  const skillIds = [worker.skillIds[0]];
  f.store.saveSettings({ platforms: ['x'] });
  await f.office.runAssignment({
    workerId: worker.id,
    projectId: p.id,
    kind: 'campaign',
    brief: 'Write a product awareness campaign.',
    skillIds,
  });
  const d = f.store.drafts()[0];
  assert.equal(d.kind, 'campaign');
  assert.equal(d.status, 'review');
  assert.equal(d.approvedAt, null);
  assert.equal(f.sent(), 0);
  assert.equal(d.researchSources.length, 1);
  assert.equal(d.projectSnapshot.name, p.name);
  assert.equal(f.getInput().context.skills[0].id, skillIds[0]);
  assert.ok(f.getInput().context.skills[0].instructions);
  await assert.rejects(f.office.deliver(d.id), /Approve/);
  new Office(f.store, f.model, f.vault, { catalog: f.catalog });
  assert.equal(f.store.draft(d.id).status, 'review');
  f.store.updateDraft(d.id, { approvedAt: new Date().toISOString() }, 'approved');
  await f.office.publish(d.id);
  assert.equal(f.sent(), 1);
  assert.equal(f.store.draft(d.id).status, 'published');
});
test('worker cancellation discards late output and releases the office', async (t) => {
  let resolve;
  const f = fixture(t, { work: () => new Promise((r) => (resolve = r)) });
  const job = f.office.runAssignment({
    workerId: 'research-planner',
    brief: 'Investigate this research question.',
    kind: 'report',
  });
  await new Promise((r) => setImmediate(r));
  f.office.stop();
  resolve({ report: 'Late model output.' });
  await job;
  assert.equal(f.store.tasks()[0].status, 'cancelled');
  assert.equal(f.office.busy, false);
  assert.equal(f.store.drafts().length, 0);
});
test('model failure remains a failed assignment, with no fabricated draft', async (t) => {
  const f = fixture(t, {
      campaign: async () => {
        throw new Error('Model offline');
      },
    }),
    p = project(f.store);
  await f.office.runAssignment({
    workerId: 'campaign-creative',
    projectId: p.id,
    kind: 'campaign',
    brief: 'Create launch copy for the product.',
  });
  assert.equal(f.store.tasks()[0].status, 'failed');
  assert.equal(f.store.drafts().length, 0);
  assert.equal(f.office.busy, false);
});
test('project URL policy refuses local networks, credentials, ports and non-HTTPS', async () => {
  for (const url of [
    'http://example.com',
    'https://127.0.0.1',
    'https://[::1]',
    'https://localhost',
    'https://user:pass@example.com',
    'https://example.com:444',
    'https://intranet.local',
  ])
    assert.throws(() => publicWebsite(url));
  assert.equal(publicWebsite('https://example.com/a'), 'https://example.com/a');
  await assert.rejects(readProjectSource('https://127.0.0.1'), /public HTTPS/);
});
test('worker API enforces deployment, skills, project validation and approval invalidation', async (t) => {
  const f = fixture(t),
    { app } = createApp({ store: f.store, office: f.office, model: f.model, vault: f.vault });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}`;
  const call = (path, method, body) =>
    fetch(url + '/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Butler-Client': 'office' },
      body: JSON.stringify(body),
    });
  assert.equal((await call('/settings', 'PATCH', { autoPublish: true })).status, 400);
  assert.equal((await call('/workers/researcher', 'PATCH', { skillIds: ['missing'] })).status, 400);
  assert.equal(
    (await call('/departments/engineering/deployment', 'POST', { deployment: 'undeployed' }))
      .status,
    200,
  );
  assert.ok(
    f.catalog.workers
      .filter((w) => w.department === 'engineering')
      .every((w) => f.store.workerConfig(w).deployment === 'undeployed'),
  );
  assert.equal(
    (await call('/workers/campaign-creative', 'PATCH', { deployment: 'bench' })).status,
    200,
  );
  assert.equal(
    (
      await call('/assignments', 'POST', {
        workerId: 'campaign-creative',
        kind: 'report',
        brief: 'Draft a product campaign.',
      })
    ).status,
    400,
  );
  assert.equal(
    (await call('/projects', 'POST', { name: 'Example', website: 'http://localhost' })).status,
    400,
  );
  const p = await (
    await call('/projects', 'POST', { name: 'Example project', facts: 'A confirmed product fact.' })
  ).json();
  assert.equal(p.name, 'Example project');
  assert.equal(f.store.projects().length, 1);
  await call('/workers/campaign-creative', 'PATCH', { deployment: 'deployed' });
  await f.office.runAssignment({
    workerId: 'campaign-creative',
    projectId: p.id,
    kind: 'campaign',
    brief: 'Create an awareness campaign.',
  });
  const d = f.store.drafts()[0];
  assert.equal((await call(`/drafts/${d.id}/publish`, 'POST', {})).status, 400);
  await call(`/drafts/${d.id}/approve`, 'POST', {});
  assert.ok(f.store.draft(d.id).approvedAt);
  await call(`/drafts/${d.id}`, 'PATCH', {
    posts: { ...d.posts, x: 'Updated campaign text.' },
    platforms: ['x'],
  });
  assert.equal(f.store.draft(d.id).approvedAt, null);
  const state = await (await fetch(url + '/api/state')).json();
  assert.equal(state.workers.length, 114);
  assert.equal(state.skills.length, 501);
  assert.equal((await call(`/projects/${p.id}`, 'DELETE', {})).status, 200);
  assert.equal(f.store.project(p.id), null);
  assert.equal(f.store.draft(d.id).projectSnapshot.name, p.name);
});

test('project fetching rejects DNS resolution to private addresses before opening a socket', async () => {
  let called = false;
  await assert.rejects(
    readProjectSource('https://example.com', 0, {
      lookup: async () => [{ address: '127.0.0.1', family: 4 }],
      get: () => {
        called = true;
      },
    }),
    /Private network/,
  );
  assert.equal(called, false);
  await assert.rejects(
    readProjectSource('https://example.com', 0, {
      lookup: async () => [{ address: '169.254.169.254', family: 4 }],
      get: () => {
        called = true;
      },
    }),
    /Private network/,
  );
  assert.equal(called, false);
});

test('a fresh office starts with no active or benched employees and scheduler stays idle', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'butler-empty-')),
    store = createStore(dir),
    catalog = loadWorkerCatalog(dir);
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  assert.ok(publicCatalog(catalog, store).workers.every((w) => w.deployment === 'undeployed'));
  store.saveSettings({ scheduleHours: 1 });
  const office = new Office(store, {}, { read: () => ({}) }, { catalog });
  office.tick();
  assert.equal(store.tasks().length, 0);
  assert.equal(office.canScan(), false);
  await assert.rejects(office.runScan(), /Deploy/);
});
