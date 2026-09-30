import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../server/store.js';
import { Office } from '../server/workflow.js';
import { loadWorkerCatalog } from '../server/workers.js';
import { createApp } from '../server/index.js';
import { planTeam, suggestTasks, planMission, companySchema } from '../server/company.js';
import { CloudModel, ModelRouter } from '../server/engine.js';
import { DEPARTMENTS, CATEGORY_DEPARTMENT, SKIN_TONES, thoughtFor } from '../shared/roster.js';
import { createEnvCredentials } from '../server/env-credentials.js';

const profile = {
  ceo: { name: 'Dee', avatar: { skin: 2, hair: 'curly' } },
  companyName: 'Chai Labs',
  website: 'https://example.com',
  industry: 'Consumer app',
  stage: 'startup',
  description:
    'Chai Labs builds a habit-tracking app that helps busy professionals take mindful tea breaks.',
  products: [
    { name: 'Brewly', description: 'A mobile app for mindful tea breaks with reminders.' },
  ],
  audience: 'Busy professionals in Bangalore and Mumbai',
  regions: 'India',
  goals: ['social', 'seo', 'launch'],
  needs: 'Grow LinkedIn followers, write blog posts, prepare the launch.',
  channels: ['linkedin', 'blog'],
  facts: 'Brewly is available on iOS.',
  teamSize: 'balanced',
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fixture(t, { capacity = 1, work } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'butler-company-')),
    store = createStore(dir);
  const vault = createEnvCredentials(join(dir, '.env'));
  let running = 0,
    peak = 0;
  const perWorker = new Map(),
    calls = [];
  const model = {
    capacity: () => capacity,
    describe: () => ({ engine: 'local', model: 'qwen3:4b', parallel: capacity }),
    status: async () => ({ online: true }),
    work:
      work ||
      (async (input, context) => {
        running++;
        peak = Math.max(peak, running);
        const n = (perWorker.get(context.workerId) || 0) + 1;
        perWorker.set(context.workerId, n);
        assert.equal(n, 1, 'one job at a time per employee');
        calls.push({ input, context });
        await sleep(15);
        running--;
        perWorker.set(context.workerId, n - 1);
        return {
          title: 'Keyword map',
          summary: 'A finished keyword map.',
          report: '## Keywords\n\n- mindful tea break app\n- tea reminder',
          nextSteps: ['Write the pillar page'],
          approvals: [
            {
              type: 'verify',
              title: 'Confirm Android availability',
              detail: 'Brewly is on Android',
            },
            {
              type: 'publish',
              title: 'Post the launch teaser',
              detail: 'LinkedIn teaser',
              content: 'Brewly is coming.',
            },
          ],
        };
      }),
    campaign: async () => ({
      title: 'Brewly launch',
      graphicHeadline: 'Take a mindful break',
      summary: 'Launch posts.',
      linkedin: 'Brewly helps busy professionals take mindful tea breaks. Try it on iOS.',
      x: 'Brewly: mindful tea breaks for busy professionals. On iOS.',
      visualConcept: 'Warm tea cup, calm desk, clear headline.',
      keyPoints: ['Available on iOS'],
      issues: [],
    }),
    unload: async () => {},
  };
  const catalog = loadWorkerCatalog(dir);
  const office = new Office(store, model, vault, {
    catalog,
    readProjectSource: async (url) => ({
      url,
      title: 'Site',
      text: 'Brewly is a mindful tea break app for professionals on iOS.',
      checkedAt: new Date().toISOString(),
    }),
  });
  const { app } = createApp({ store, office, model, vault });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  t.after(() => {
    office.dispose();
    server.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const base = () => `http://127.0.0.1:${server.address().port}/api`;
  const call = async (path, method = 'GET', body) => {
    const r = await fetch(base() + path, {
      method,
      headers:
        method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-Butler-Client': 'office' },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body || {}) }),
    });
    const text = await r.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
    return { status: r.status, body: json, headers: r.headers };
  };
  const idle = async () => {
    for (let i = 0; i < 200 && (store.activeJobs().length || office.running.size); i++)
      await sleep(10);
  };
  return { store, office, catalog, model, call, idle, peak: () => peak, calls, vault };
}

test('roster has unique diverse employees, department heads and real thoughts', () => {
  const catalog = loadWorkerCatalog('/nonexistent');
  const names = catalog.workers.map((w) => w.persona.fullName);
  assert.equal(new Set(names).size, 115);
  assert.equal(new Set(catalog.workers.map((w) => w.persona.firstName)).size, 115);
  const tones = new Set(catalog.workers.map((w) => w.persona.look.skin));
  assert.equal(tones.size, SKIN_TONES.length, 'every skin tone is represented');
  for (const dept of DEPARTMENTS) {
    const head = catalog.workers.find((w) => w.id === dept.head);
    assert.ok(head?.head, `${dept.name} has a head`);
    assert.equal(head.department, dept.id);
  }
  const worker = catalog.workers.find((w) => w.id === 'employee-seo-strategist');
  for (const status of ['working', 'queued', 'approval', 'idle', 'bench']) {
    const thought = thoughtFor(
      { ...worker, activity: { status, task: 'Keyword map for Brewly' } },
      { status, task: 'Keyword map for Brewly', skill: 'Keyword Research', product: 'Brewly' },
      3,
    );
    assert.ok(typeof thought === 'string' && thought.length > 5, status);
  }
});

test('skills follow roles: heads own their department, specialists get relevant skills', () => {
  const catalog = loadWorkerCatalog('/nonexistent');
  const byId = new Map(catalog.skills.map((s) => [s.id, s]));
  const head = catalog.workers.find((w) => w.id === 'brand-strategist');
  const marketingSkills = catalog.skills.filter(
    (s) => CATEGORY_DEPARTMENT[s.category] === 'marketing',
  );
  assert.ok(
    marketingSkills.every((s) => head.skillIds.includes(s.id)),
    'head knows all marketing skills',
  );
  const seo = catalog.workers.find((w) => w.id === 'employee-seo-strategist');
  const seoShare = seo.skillIds.filter((id) => byId.get(id).category === 'SEO & Search').length;
  assert.ok(seoShare / seo.skillIds.length > 0.6, 'SEO strategist is mostly SEO skills');
  assert.ok(!seo.skillIds.some((id) => byId.get(id).category === 'Legal & Compliance'));
  const nda = catalog.workers.find((w) => w.id === 'employee-nda-reviewer');
  assert.ok(nda.skillIds.includes('butler-nda-template'));
  assert.ok(
    catalog.workers.every((w) => w.skillIds.length >= 8),
    'nobody is left without skills',
  );
  const covered = new Set(catalog.workers.flatMap((w) => w.skillIds));
  assert.equal(covered.size, catalog.skills.length);
});

test('old department-wide skill lists are replaced unless the CEO customised them', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'butler-skills-'));
  const store = createStore(dir);
  t.after(() => {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const catalog = loadWorkerCatalog(dir);
  const worker = catalog.workers.find((w) => w.id === 'employee-seo-strategist');
  store.db
    .prepare('INSERT INTO worker_config VALUES (?,?)')
    .run(worker.id, JSON.stringify({ deployment: 'deployed', skillIds: ['butler-ad-copy'] }));
  assert.deepEqual(store.workerConfig(worker).skillIds, worker.skillIds);
  assert.equal(store.workerConfig(worker).deployment, 'deployed');
  store.saveWorker(worker, { skillIds: ['butler-keyword-research'] });
  assert.deepEqual(store.workerConfig(worker).skillIds, ['butler-keyword-research']);
  store.saveWorker(worker, { deployment: 'bench' });
  assert.deepEqual(store.workerConfig(worker).skillIds, ['butler-keyword-research']);
});

test('company setup validates, mirrors into a project and plans a fitting team', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.call('/company', 'PUT', { ...profile, goals: [] })).status, 400);
  assert.equal(
    (await f.call('/company', 'PUT', { ...profile, website: 'http://x.test' })).status,
    400,
  );
  const saved = await f.call('/company', 'PUT', profile);
  assert.equal(saved.status, 200);
  assert.equal(f.store.project('company').name, 'Chai Labs');
  assert.match(f.store.project('company').products, /Brewly/);
  assert.equal(f.store.settings().officeName, 'Chai Labs');
  assert.equal((await f.call('/projects/company', 'DELETE')).status, 400);
  const { team } = (await f.call('/company/plan')).body;
  const ids = team.map((m) => m.workerId);
  assert.ok(ids.includes('employee-linkedin-post-writer'));
  assert.ok(ids.includes('employee-seo-strategist'));
  assert.ok(ids.includes('employee-hindi-english-content-writer'), 'India audience');
  assert.ok(ids.includes('evidence-reviewer'), 'claims are checked before publishing');
  assert.ok(ids.includes('brand-strategist'), 'marketing head leads the team');
  assert.ok(team.length <= 16);
  assert.ok(team.every((m) => m.reasons.length && m.starter?.brief));
  const lean = planTeam(companySchema.parse({ ...profile, teamSize: 'lean' }), f.catalog);
  assert.ok(lean.length <= 10);
  // Editable later: a second save keeps the original onboarding time.
  const first = f.store.company().onboardedAt;
  await f.call('/company', 'PUT', { ...profile, tagline: 'Tea, mindfully.' });
  assert.equal(f.store.company().onboardedAt, first);
  assert.equal(f.store.company().tagline, 'Tea, mindfully.');
});

test('staffing deploys the team, queues real starter work and respects engine capacity', async (t) => {
  const f = await fixture(t, { capacity: 1 });
  await f.call('/company', 'PUT', profile);
  const ids = [
    'employee-seo-strategist',
    'employee-blog-post-writer',
    'employee-competitor-analyst',
  ];
  const staffed = await f.call('/company/staff', 'POST', { workerIds: ids, starterTasks: true });
  assert.equal(staffed.status, 200);
  assert.equal(staffed.body.deployed, 3);
  assert.equal(staffed.body.queued, 3);
  await f.idle();
  assert.equal(f.peak(), 1, 'local engine runs one job at a time');
  const state = (await f.call('/state')).body;
  assert.equal(state.deliverables.length, 3);
  assert.ok(state.deliverables.every((d) => d.title && d.preview));
  assert.ok(state.approvals.filter((a) => a.status === 'pending').length >= 3);
  assert.ok(state.workers.find((w) => w.id === ids[0]).activity.status === 'approval');
  assert.match(f.calls[0].input.project.name, /Chai Labs/);
  assert.equal(f.calls[0].context.person.title, 'SEO Strategist');
  const full = await f.call(`/deliverables/${state.deliverables[0].id}`);
  assert.match(full.body.content, /Keywords/);
  const download = await f.call(`/deliverables/${state.deliverables[0].id}/download`);
  assert.match(download.headers.get('content-disposition'), /attachment; filename=".+\.md"/);
  assert.match(download.body, /# Keyword map/);
});

test('cloud capacity runs several employees in parallel, never one employee twice', async (t) => {
  const f = await fixture(t, { capacity: 3 });
  await f.call('/company', 'PUT', profile);
  const ids = [
    'employee-seo-strategist',
    'employee-blog-post-writer',
    'employee-competitor-analyst',
    'employee-growth-hacker',
  ];
  await f.call('/company/staff', 'POST', { workerIds: ids, starterTasks: false });
  for (const id of ids)
    for (let i = 0; i < 2; i++)
      assert.equal(
        (
          await f.call('/work', 'POST', {
            workerId: id,
            kind: 'report',
            brief: `Task ${i} for ${id} please`,
          })
        ).status,
        202,
      );
  await f.idle();
  assert.equal(f.peak(), 3);
  assert.equal(f.store.deliverables().length, 8);
});

test('queued work can be cancelled, benching busy employees is refused, stop clears the queue', async (t) => {
  let release;
  const f = await fixture(t, {
    work: () =>
      new Promise((r) => (release = () => r({ report: 'Late but complete report text.' }))),
  });
  await f.call('/company', 'PUT', profile);
  await f.call('/company/staff', 'POST', {
    workerIds: ['employee-seo-strategist'],
    starterTasks: false,
  });
  const a = (
    await f.call('/work', 'POST', {
      workerId: 'employee-seo-strategist',
      kind: 'report',
      brief: 'First long assignment here',
    })
  ).body.job;
  const b = (
    await f.call('/work', 'POST', {
      workerId: 'employee-seo-strategist',
      kind: 'report',
      brief: 'Second assignment waiting',
    })
  ).body.job;
  await sleep(20);
  assert.equal(f.store.job(a.id).status, 'running');
  assert.equal(
    (await f.call('/workers/employee-seo-strategist', 'PATCH', { deployment: 'bench' })).status,
    400,
  );
  assert.equal((await f.call(`/work/${b.id}`, 'DELETE')).status, 200);
  assert.equal(f.store.job(b.id).status, 'cancelled');
  await f.call('/stop', 'POST');
  release();
  await f.idle();
  assert.equal(f.store.job(a.id).status, 'cancelled');
  assert.equal(f.store.deliverables().length, 0, 'late output is discarded');
  assert.equal((await f.call(`/work/${a.id}`, 'DELETE')).status, 400);
});

test('approvals: verify updates facts, publish routes to Quinn for a final draft, decisions are final', async (t) => {
  const f = await fixture(t);
  await f.call('/company', 'PUT', profile);
  await f.call('/company/staff', 'POST', {
    workerIds: ['employee-seo-strategist', 'manager'],
    starterTasks: false,
  });
  await f.call('/work', 'POST', {
    workerId: 'employee-seo-strategist',
    kind: 'report',
    brief: 'Keyword map for Brewly launch',
  });
  await f.idle();
  const pending = f.store.approvals().filter((a) => a.status === 'pending');
  const verify = pending.find((a) => a.type === 'verify');
  const publish = pending.find((a) => a.type === 'publish');
  assert.equal(
    (await f.call(`/approvals/${verify.id}`, 'POST', { decision: 'approve' })).status,
    200,
  );
  assert.match(f.store.company().facts, /CEO verified: Brewly is on Android/);
  assert.match(f.store.project('company').facts, /CEO verified/);
  assert.equal(
    (await f.call(`/approvals/${verify.id}`, 'POST', { decision: 'decline' })).status,
    400,
  );
  assert.equal(f.store.drafts().length, 0, 'nothing is drafted or published before approval');
  await f.call(`/approvals/${publish.id}`, 'POST', { decision: 'approve' });
  await f.idle();
  const draft = f.store.drafts()[0];
  assert.equal(draft.kind, 'campaign');
  assert.equal(draft.workerId, 'manager');
  assert.equal(draft.status, 'review');
  assert.equal(draft.approvedAt, null, 'final posts still need the CEO');
  await f.call('/work', 'POST', {
    workerId: 'employee-seo-strategist',
    kind: 'report',
    brief: 'Another keyword map please',
  });
  await f.idle();
  const second = f.store.approvals().find((a) => a.status === 'pending' && a.type === 'verify');
  await f.call(`/approvals/${second.id}`, 'POST', { decision: 'decline' });
  assert.match(f.store.company().restrictions, /Do not claim: Brewly is on Android/);
});

test('free employees get grounded suggestions and missions route goals to the right people', async (t) => {
  const f = await fixture(t);
  await f.call('/company', 'PUT', profile);
  const worker = f.catalog.workers.find((w) => w.id === 'employee-seo-strategist');
  const suggestions = suggestTasks(worker, f.catalog, f.store.company());
  assert.ok(suggestions.length >= 4);
  assert.ok(suggestions.every((s) => s.brief.length > 30));
  assert.ok(suggestions.some((s) => /Chai Labs|Brewly/.test(s.brief)));
  const api = await f.call('/workers/employee-seo-strategist/suggestions');
  assert.ok(api.body.suggestions.length >= 4);
  const plan = planMission(
    'Launch Brewly with a LinkedIn campaign and SEO blog posts',
    f.store.company(),
    f.catalog,
  );
  const ids = plan.tasks.map((t) => t.workerId);
  assert.ok(
    ids.some((id) => ['employee-seo-strategist', 'employee-blog-post-writer'].includes(id)),
    ids.join(),
  );
  assert.ok(
    ids.some((id) =>
      ['employee-linkedin-post-writer', 'manager', 'employee-gtm-strategist'].includes(id),
    ),
    ids.join(),
  );
  assert.ok(plan.tasks.length >= 3 && plan.tasks.length <= 5);
  const planned = (
    await f.call('/missions/plan', 'POST', { goal: 'Launch Brewly with SEO blog posts' })
  ).body;
  assert.equal(planned.planner, 'rules');
  const launched = await f.call('/missions', 'POST', {
    goal: 'Launch Brewly with SEO blog posts',
    tasks: planned.tasks,
  });
  assert.equal(launched.status, 202);
  await f.idle();
  for (const t of planned.tasks)
    assert.equal(
      f.store.workerConfig(f.catalog.workers.find((w) => w.id === t.workerId)).deployment,
      'deployed',
    );
  assert.equal(f.store.deliverables().length, planned.tasks.length);
});

test('cloud engine sends keys only to the provider, parses JSON and retries once', async () => {
  const requests = [];
  const replies = [
    'Sure! ```json\n{"report": 1}\n```',
    '{"report":"A finished cloud report with detail."}',
  ];
  const anthropic = new CloudModel({
    provider: 'anthropic',
    model: 'claude-sonnet-5-5',
    key: 'sk-ant-test',
    fetcher: async (url, init) => {
      requests.push({ url, init, body: JSON.parse(init.body) });
      return Response.json({
        content: [{ type: 'text', text: replies.shift() }],
        stop_reason: 'end_turn',
      });
    },
  });
  const result = await anthropic.work(
    { assignment: 'x' },
    { workerId: 'a', skills: [] },
    'qwen3:4b',
  );
  assert.equal(result.report, 'A finished cloud report with detail.');
  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, 'https://api.anthropic.com/v1/messages');
  assert.equal(requests[0].init.headers['x-api-key'], 'sk-ant-test');
  assert.equal(requests[0].init.headers['anthropic-version'], '2023-06-01');
  assert.equal(requests[0].body.model, 'claude-sonnet-5-5');
  assert.match(requests[1].body.messages[0].content, /could not be used/);
  assert.equal(anthropic.busy, false);
  const openai = new CloudModel({
    provider: 'openai',
    model: 'gpt-6.1-sol',
    key: 'sk-openai-test',
    fetcher: async (url, init) => {
      requests.push({ url, init });
      return new Response('{}', { status: 401 });
    },
  });
  await assert.rejects(
    openai.work({}, {}, 'qwen3:4b'),
    (e) => /rejected/.test(e.message) && !e.message.includes('sk-openai'),
  );
  assert.equal(requests.at(-1).url, 'https://api.openai.com/v1/responses');
  assert.equal(requests.at(-1).init.headers.authorization, 'Bearer sk-openai-test');
});

test('engine router falls back to local without a key and never exposes keys in state', async (t) => {
  const f = await fixture(t);
  const router = new ModelRouter(f.store, f.vault, {
    local: { status: async () => ({}), busy: false },
  });
  f.store.saveSettings({ engine: 'cloud', cloudProvider: 'anthropic', cloudConcurrency: 4 });
  assert.equal(router.describe().engine, 'local');
  assert.match(router.describe().fallback, /API key/);
  assert.equal(router.capacity(), 1);
  assert.equal(
    (await f.call('/connections', 'PUT', { anthropicKey: 'sk-ant-secret_123' })).status,
    200,
  );
  assert.equal(router.describe().engine, 'cloud');
  assert.equal(router.capacity(), 4);
  assert.ok(router.current() instanceof CloudModel);
  const state = (await f.call('/state')).body;
  assert.equal(state.connections.anthropic, true);
  assert.ok(!JSON.stringify(state).includes('sk-ant-secret'));
  assert.equal((await f.call('/settings', 'PATCH', { cloudModel: 'bad model; rm' })).status, 400);
  assert.equal((await f.call('/settings', 'PATCH', { cloudConcurrency: 20 })).status, 400);
  assert.equal((await f.call('/connections', 'PUT', { anthropicKey: 'has space' })).status, 400);
});
