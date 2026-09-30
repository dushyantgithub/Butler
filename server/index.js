import express from 'express';
import { JobWorker } from './jobs/service.js';
import { jobRoutes } from './jobs/routes.js';
import { z } from 'zod';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.js';
import { createVault } from './vault.js';
import { createEnvCredentials } from './env-credentials.js';
import { LocalModel, MODELS } from './llm.js';
import { ModelRouter, CLOUD_PROVIDERS } from './engine.js';
import {
  companySchema,
  planTeam,
  suggestTasks,
  planMission,
  GOALS,
  CHANNELS,
  STAGES,
  TEAM_SIZES,
  COMPANY_PROJECT_ID,
} from './company.js';
import { SOURCES } from './sources.js';
import { Office } from './workflow.js';
import { publicCatalog, workerContext } from './workers.js';
import { projectSchema } from './projects.js';
import { validatePosts, publishPost, PublishError } from './publisher.js';
import { createXOAuth } from './oauth-x.js';
import { createLinkedInOAuth } from './oauth-linkedin.js';
import { randomBytes } from 'node:crypto';

export function createApp(options = {}) {
  const store = options.store || createStore(),
    vault = options.vault || createEnvCredentials(resolve('.env'), createVault(store.dir)),
    model = options.model || new ModelRouter(store, vault, { local: new LocalModel() });
  const staticDir = options.staticDir || fileURLToPath(new URL('../dist', import.meta.url));
  const desktopTickets = new Map();
  const oauth = createXOAuth(vault, options.oauthFetch);
  const linkedinOAuth = createLinkedInOAuth(vault, options.linkedinOAuthFetch);
  const office =
    options.office ||
    new Office(store, model, vault, {
      publishPost: async (platform, text, credentials) => {
        let fresh;
        try {
          fresh = await oauth.forPublishing(platform, credentials);
        } catch {
          throw new PublishError('X access could not be refreshed. Reconnect in Office settings.');
        }
        return publishPost(platform, text, fresh);
      },
    });
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    let path;
    try {
      path = decodeURIComponent(req.path);
    } catch {
      return res.sendStatus(400);
    }
    if (/(?:^|\/)(?:\.env[^/]*|data|\.runtime|\.git)(?:\/|$)/i.test(path))
      return res.sendStatus(404);
    const host = req.headers.host || '';
    if (!/^(localhost|127\.0\.0\.1):\d+$/.test(host))
      return res.status(403).json({ error: 'Butler only accepts local requests.' });
    const oauthCallback =
      req.method === 'GET' &&
      [
        '/api/oauth/x/callback',
        '/api/oauth/linkedin/callback',
        '/api/oauth/x/desktop',
        '/api/oauth/linkedin/desktop',
      ].includes(req.path) &&
      host === '127.0.0.1:4310';
    // A provider redirect keeps cross-site fetch metadata through the final document navigation.
    // Only the public application shell may load this way; API reads/writes stay protected.
    const landingNavigation =
      req.method === 'GET' &&
      req.path === '/' &&
      req.headers['sec-fetch-mode'] === 'navigate' &&
      req.headers['sec-fetch-dest'] === 'document';
    if (
      !oauthCallback &&
      !landingNavigation &&
      req.headers.origin &&
      !/^http:\/\/(localhost|127\.0\.0\.1):(4310|5173)$/.test(req.headers.origin)
    )
      return res.status(403).json({ error: 'Request origin is not allowed.' });
    if (!oauthCallback && !landingNavigation && req.headers['sec-fetch-site'] === 'cross-site')
      return res.status(403).json({ error: 'Cross-site requests are blocked.' });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    if (req.path.startsWith('/api')) res.setHeader('Cache-Control', 'no-store');
    if (
      !['GET', 'HEAD'].includes(req.method) &&
      (!req.is('application/json') || req.headers['x-butler-client'] !== 'office')
    )
      return res.status(403).json({ error: 'Use the local office to make changes.' });
    next();
  });
  app.use('/api/jobs/resume', express.json({ limit: '7mb' }));
  app.use(express.json({ limit: '128kb' }));
  const jobWorker = new JobWorker(store, office, model, options.jobDependencies);
  app.use('/api/jobs', jobRoutes(jobWorker));
  const idle = () => {
    if (office.busy) throw new Error('Wait for the current assignment to finish.');
  };
  const draftExists = (id) => {
    const d = store.draft(id);
    if (!d) throw new Error('Draft not found.');
    return d;
  };
  for (const [platform, handler] of [
    ['x', oauth],
    ['linkedin', linkedinOAuth],
  ]) {
    app.get(`/api/oauth/${platform}/desktop`, (req, res) => {
      const ticket = desktopTickets.get(req.query.ticket);
      desktopTickets.delete(req.query.ticket);
      if (!ticket || ticket.platform !== platform || ticket.expires < Date.now())
        return res.sendStatus(403);
      const { url, session } = handler.begin();
      res.setHeader(
        'Set-Cookie',
        `butler_${platform}_oauth=${session}; HttpOnly; SameSite=Lax; Path=/api/oauth/${platform}; Max-Age=600`,
      );
      res.redirect(303, url);
    });
    app.post(`/api/oauth/${platform}/start`, (req, res) => {
      idle();
      if (req.headers.host !== '127.0.0.1:4310')
        throw new Error('Open http://127.0.0.1:4310 to connect your account.');
      const { url, session } = handler.begin();
      res.setHeader(
        'Set-Cookie',
        `butler_${platform}_oauth=${session}; HttpOnly; SameSite=Lax; Path=/api/oauth/${platform}; Max-Age=600`,
      );
      res.json({ url });
    });
    app.get(`/api/oauth/${platform}/callback`, async (req, res) => {
      const session = (req.headers.cookie || '')
        .split(';')
        .map((s) => s.trim())
        .find((s) => s.startsWith(`butler_${platform}_oauth=`))
        ?.slice(`butler_${platform}_oauth=`.length);
      res.setHeader(
        'Set-Cookie',
        `butler_${platform}_oauth=; HttpOnly; SameSite=Lax; Path=/api/oauth/${platform}; Max-Age=0`,
      );
      try {
        await handler.complete({ state: req.query.state, code: req.query.code, session });
        store.event(
          'boss',
          `Authorized the ${platform === 'x' ? 'X' : 'LinkedIn'} connection. Tokens saved privately; publishing still depends on platform API access.`,
          'success',
        );
        res.redirect(303, `/?connection=${platform}-authorized`);
      } catch {
        // Never reflect provider errors, authorization codes or tokens into the page/logs.
        res.redirect(303, `/?connection=${platform}-failed`);
      }
    });
  }
  const deployedWorker = (id) => {
    const worker = office.catalog.workers.find((w) => w.id === id);
    if (!worker) throw new Error('Worker not found.');
    return worker;
  };
  const activity = () => (office.activity ? office.activity() : office.agents);
  app.get('/api/state', (req, res) => {
    const agents = activity();
    res.json({
      settings: store.settings(),
      ...publicCatalog(office.catalog, store, agents),
      company: store.company(),
      projects: store.projects(),
      agents,
      jobs: [...store.activeJobs(), ...store.recentJobs(40)],
      deliverables: store.deliverables(120),
      approvals: store.approvals(120),
      engine: model.describe?.() || { engine: 'local', model: store.settings().model, parallel: 1 },
      options: {
        goals: GOALS,
        channels: CHANNELS,
        stages: STAGES,
        teamSizes: TEAM_SIZES,
        cloudProviders: Object.fromEntries(
          Object.entries(CLOUD_PROVIDERS).map(([id, p]) => [
            id,
            { name: p.name, models: p.models, defaultModel: p.defaultModel },
          ]),
        ),
      },
      busy: office.busy,
      stopping: office.stopRequested && office.busy,
      drafts: store.drafts(),
      tasks: store.tasks(),
      events: store.events(),
      scenes: store.scenes(),
      sources: SOURCES.map((s) => ({ ...s, health: office.sourceHealth[s.id] })),
      connections: vault.status(),
    });
  });
  app.patch('/api/workers/:id', (req, res) => {
    const worker = deployedWorker(req.params.id);
    if (['researcher', 'manager', 'job-hunter'].includes(worker.id)) idle();
    const patch = z
      .object({
        deployment: z.enum(['deployed', 'bench', 'undeployed']).optional(),
        skillIds: z
          .array(z.string())
          .max(2000)
          .refine(
            (ids) =>
              new Set(ids).size === ids.length &&
              ids.every((id) => office.catalog.skills.some((s) => s.id === id)),
            'Choose installed skills without duplicates.',
          )
          .optional(),
      })
      .strict()
      .parse(req.body);
    if (patch.deployment && patch.deployment !== 'deployed' && office.workerHasWork?.(worker.id))
      throw new Error(
        `${worker.persona?.firstName || worker.name} has work in progress. Cancel it or let it finish first.`,
      );
    res.json(store.saveWorker(worker, patch));
    store.event(
      'boss',
      `Updated ${worker.persona?.fullName || worker.name}: ${patch.deployment || 'skills changed'}.`,
    );
  });
  app.get('/api/workers/:id/suggestions', (req, res) => {
    const worker = deployedWorker(req.params.id);
    const config = store.workerConfig(worker);
    const recent = store
      .recentJobs(80)
      .filter((j) => j.workerId === worker.id)
      .map((j) => j.title);
    res.json({
      suggestions: suggestTasks({ ...worker, ...config }, office.catalog, store.company(), recent),
    });
  });
  app.post('/api/departments/:id/deployment', (req, res) => {
    if (!office.catalog.departments.some((d) => d.id === req.params.id))
      throw new Error('Department not found.');
    const { deployment } = z
      .object({ deployment: z.enum(['deployed', 'bench', 'undeployed']) })
      .strict()
      .parse(req.body);
    let skipped = 0;
    for (const worker of office.catalog.workers.filter((w) => w.department === req.params.id)) {
      const locked =
        deployment !== 'deployed' &&
        (office.workerHasWork?.(worker.id) ||
          (office.busy && ['researcher', 'manager', 'job-hunter'].includes(worker.id)));
      if (locked) skipped++;
      else store.saveWorker(worker, { deployment });
    }
    store.event('boss', `Set ${req.params.id} department to ${deployment}.`);
    res.json({ ok: true, skipped });
  });
  app.post('/api/projects', (req, res) => {
    res.json(store.saveProject(projectSchema.parse(req.body)));
  });
  app.put('/api/projects/:id', (req, res) => {
    if (!store.project(req.params.id)) throw new Error('Project not found.');
    res.json(store.saveProject(projectSchema.parse(req.body), req.params.id));
  });
  app.delete('/api/projects/:id', (req, res) => {
    if (req.params.id === COMPANY_PROJECT_ID)
      throw new Error('This project mirrors your company profile. Edit it under Company instead.');
    store.deleteProject(req.params.id);
    res.json({ ok: true });
  });
  const assignmentSchema = z
    .object({
      workerId: z.string(),
      projectId: z.string().optional(),
      brief: z.string().trim().min(10).max(2000),
      title: z.string().trim().max(140).optional(),
      kind: z.enum(['report', 'campaign']),
      skillIds: z.array(z.string()).max(3).optional(),
    })
    .strict();
  const enqueue = (assignment, origin) => {
    if (assignment.workerId === 'job-hunter')
      throw new Error('Open Job search to assign this worker.');
    workerContext(office.catalog, store, assignment.workerId, assignment.skillIds);
    if (assignment.projectId && !store.project(assignment.projectId))
      throw new Error('Project not found.');
    if (assignment.kind === 'campaign' && !assignment.projectId)
      throw new Error('Select a project for this campaign.');
    if (!store.settings().useModel)
      throw new Error('Enable the AI engine in Office settings first.');
    if (office.enqueue) return office.enqueue(assignment, origin);
    void office.runAssignment(assignment);
    return { ok: true };
  };
  app.post(['/api/assignments', '/api/work'], (req, res) => {
    res.status(202).json({ ok: true, job: enqueue(assignmentSchema.parse(req.body), 'boss') });
  });
  app.delete('/api/work/:id', (req, res) => {
    office.cancelJob(req.params.id);
    res.json({ ok: true });
  });
  app.get('/api/deliverables/:id', (req, res) => {
    const d = store.deliverable(req.params.id);
    if (!d) throw new Error('Deliverable not found.');
    res.json(d);
  });
  app.get('/api/deliverables/:id/download', (req, res) => {
    const d = store.deliverable(req.params.id);
    if (!d) return res.sendStatus(404);
    const worker = office.catalog.workers.find((w) => w.id === d.workerId);
    const name =
      (d.title || 'deliverable')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60) || 'deliverable';
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.md"`);
    const lines = [
      `# ${d.title}`,
      '',
      `_${worker?.persona?.fullName || d.workerId} · ${worker?.title || ''} · ${d.createdAt}_`,
      '',
      ...(d.summary ? [`> ${d.summary}`, ''] : []),
      d.content,
      ...(d.nextSteps?.length
        ? ['', '## Next steps', '', ...d.nextSteps.map((x) => `- ${x}`)]
        : []),
      '',
    ];
    res.send(lines.join('\n'));
  });
  app.post('/api/approvals/:id', (req, res) => {
    const body = z
      .object({
        decision: z.enum(['approve', 'decline']),
        note: z.string().max(600).optional(),
        followUp: z.boolean().optional(),
      })
      .strict()
      .parse(req.body);
    res.json(office.decide(req.params.id, body.decision, body));
  });
  // Company profile, onboarding plan and auto-staffing.
  app.post('/api/company/preview', (req, res) => {
    const profile = companySchema.parse(req.body);
    res.json({ team: planTeam(profile, office.catalog) });
  });
  app.get('/api/company/plan', (req, res) => {
    const profile = store.company();
    if (!profile) throw new Error('Complete company setup first.');
    res.json({ team: planTeam(profile, office.catalog) });
  });
  app.put('/api/company', (req, res) => {
    const profile = companySchema.parse(req.body);
    const previous = store.company();
    const saved = office.saveCompany
      ? office.saveCompany({ ...profile, onboardedAt: previous?.onboardedAt })
      : store.saveCompany(profile);
    store.saveSettings({ officeName: profile.companyName.slice(0, 60) });
    store.event(
      'boss',
      previous ? 'Updated the company profile.' : 'Set up the company.',
      'success',
    );
    res.json(saved);
  });
  app.post('/api/company/staff', (req, res) => {
    const body = z
      .object({
        workerIds: z.array(z.string()).max(60),
        starterTasks: z.boolean().default(true),
        benchOthers: z.boolean().default(false),
      })
      .strict()
      .parse(req.body);
    const profile = store.company();
    if (!profile) throw new Error('Complete company setup first.');
    const chosen = new Set(body.workerIds);
    const plan = planTeam(profile, office.catalog);
    let deployed = 0,
      queued = 0;
    const notes = [];
    for (const id of chosen) {
      const worker = deployedWorker(id);
      if (store.workerConfig(worker).deployment !== 'deployed') {
        store.saveWorker(worker, { deployment: 'deployed' });
        deployed++;
      }
    }
    if (body.benchOthers)
      for (const worker of office.catalog.workers)
        if (
          !chosen.has(worker.id) &&
          store.workerConfig(worker).deployment === 'deployed' &&
          !office.workerHasWork?.(worker.id) &&
          !(office.busy && ['researcher', 'manager', 'job-hunter'].includes(worker.id))
        )
          store.saveWorker(worker, { deployment: 'bench' });
    if (body.starterTasks) {
      if (!store.settings().useModel) notes.push('Starter tasks need the AI engine turned on.');
      else
        for (const id of chosen) {
          if (id === 'job-hunter') continue;
          const worker = deployedWorker(id);
          const member = plan.find((m) => m.workerId === id) || {
            name: worker.persona.fullName,
            starter: suggestTasks(
              { ...worker, ...store.workerConfig(worker) },
              office.catalog,
              profile,
            )[0],
          };
          if (!member.starter) continue;
          try {
            enqueue(
              {
                workerId: id,
                projectId: COMPANY_PROJECT_ID,
                kind: member.starter.kind,
                title: member.starter.title,
                brief: member.starter.brief,
                ...(member.starter.skillIds.length ? { skillIds: member.starter.skillIds } : {}),
              },
              'onboarding',
            );
            queued++;
          } catch (e) {
            notes.push(`${member.name}: ${e.message}`);
          }
        }
    }
    store.event(
      'boss',
      `Staffed the office: ${deployed} deployed, ${queued} starter tasks queued.`,
      'success',
    );
    res.json({ deployed, queued, notes });
  });
  // Missions: one CEO goal becomes assignments for the best-fit employees.
  app.post('/api/missions/plan', async (req, res) => {
    const { goal, useAI } = z
      .object({ goal: z.string().trim().min(8).max(1000), useAI: z.boolean().optional() })
      .strict()
      .parse(req.body);
    const states = Object.fromEntries(
      office.catalog.workers.map((w) => [
        w.id,
        { deployment: store.workerConfig(w).deployment, busy: office.workerHasWork?.(w.id) },
      ]),
    );
    const company = store.company();
    const fallback = planMission(goal, company, office.catalog, states);
    if (!useAI || !store.settings().useModel || !model.plan)
      return res.json({ ...fallback, planner: 'rules' });
    try {
      const candidates = office.catalog.workers
        .filter((w) => w.id !== 'job-hunter')
        .map((w) => ({ w, s: states[w.id]?.deployment === 'deployed' ? 1 : 0 }))
        .sort((a, b) => b.s - a.s)
        .slice(0, 40)
        .map(({ w }) => ({ workerId: w.id, title: w.title, department: w.department }));
      const ids = new Set(candidates.map((c) => c.workerId));
      for (const t of fallback.tasks)
        if (!ids.has(t.workerId)) {
          const w = office.catalog.workers.find((x) => x.id === t.workerId);
          candidates.push({ workerId: w.id, title: w.title, department: w.department });
          ids.add(w.id);
        }
      const plan = await model.plan(
        goal,
        candidates,
        company
          ? { name: company.companyName, description: company.description.slice(0, 600) }
          : null,
        store.settings().model,
      );
      const tasks = plan.tasks
        .filter((t) => ids.has(t.workerId) && t.workerId !== 'job-hunter')
        .filter((t, i, all) => all.findIndex((x) => x.workerId === t.workerId) === i)
        .map((t) => ({ ...t, kind: 'report' }));
      if (!tasks.length) throw new Error('No valid assignments.');
      res.json({ summary: plan.summary, tasks, planner: 'ai' });
    } catch (e) {
      res.json({
        ...fallback,
        planner: 'rules',
        note: `AI planning unavailable (${e.message}). Used the built-in planner.`,
      });
    }
  });
  app.post('/api/missions', (req, res) => {
    const body = z
      .object({
        goal: z.string().trim().min(8).max(1000),
        tasks: z
          .array(
            z
              .object({
                workerId: z.string(),
                brief: z.string().trim().min(10).max(2000),
                why: z.string().max(400).optional(),
                kind: z.enum(['report', 'campaign']).default('report'),
              })
              .strict(),
          )
          .min(1)
          .max(8),
      })
      .strict()
      .parse(req.body);
    const missionId = randomBytes(8).toString('hex');
    const projectId = store.project(COMPANY_PROJECT_ID) ? COMPANY_PROJECT_ID : undefined;
    const jobs = [];
    for (const t of body.tasks) {
      const worker = deployedWorker(t.workerId);
      if (store.workerConfig(worker).deployment !== 'deployed')
        store.saveWorker(worker, { deployment: 'deployed' });
      jobs.push(
        enqueue(
          {
            workerId: t.workerId,
            brief: t.brief,
            kind: t.kind === 'campaign' && projectId ? 'campaign' : 'report',
            title: `${body.goal}`.slice(0, 100),
            ...(projectId ? { projectId } : {}),
            missionId,
          },
          'mission',
        ),
      );
    }
    store.event(
      'boss',
      `Launched a mission: ${body.goal} (${jobs.length} assignments).`,
      'success',
    );
    res.status(202).json({ ok: true, missionId, jobs: jobs.length });
  });
  app.get('/api/model', async (req, res) => res.json(await model.status(store.settings().model)));
  app.post('/api/scan', (req, res) => {
    idle();
    office.requireWorker('researcher');
    office.requireWorker('manager');
    void office.runScan();
    res.status(202).json({ ok: true });
  });
  app.post('/api/stop', (req, res) => {
    office.stop();
    if (jobWorker.running) jobWorker.stop();
    res.json({ ok: true });
  });
  app.post('/api/model/unload', async (req, res) => {
    idle();
    await model.unload(store.settings().model);
    res.json({ ok: true });
  });
  const settingsSchema = z
    .object({
      officeName: z.string().trim().min(1).max(60),
      model: z.enum(MODELS),
      useModel: z.boolean(),
      autoPublish: z.literal(false),
      scheduleHours: z.union([
        z.literal(0),
        z.literal(1),
        z.literal(3),
        z.literal(6),
        z.literal(12),
        z.literal(24),
      ]),
      lookbackHours: z.number().int().min(6).max(168),
      batchSize: z.number().int().min(1).max(5),
      platforms: z
        .array(z.enum(['linkedin', 'x']))
        .min(1)
        .max(2)
        .refine((a) => new Set(a).size === a.length),
      enabledSources: z
        .array(z.enum(SOURCES.map((s) => s.id)))
        .min(1)
        .max(SOURCES.length)
        .refine((a) => new Set(a).size === a.length),
      engine: z.enum(['local', 'cloud']),
      cloudProvider: z.enum(Object.keys(CLOUD_PROVIDERS)),
      cloudModel: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9._:\/-]{0,100}$/, 'Use a model ID such as claude-sonnet-5-5.'),
      cloudConcurrency: z.number().int().min(1).max(8),
    })
    .partial()
    .strict();
  app.patch('/api/settings', (req, res) => {
    const patch = settingsSchema.parse(req.body);
    store.saveSettings(patch);
    store.event('boss', 'Updated office preferences.');
    res.json({ ok: true });
  });
  app.put('/api/connections', (req, res) => {
    idle();
    const c = z
      .object({
        linkedinToken: z.string().max(5000).optional(),
        linkedinClientId: z
          .string()
          .regex(/^[A-Za-z0-9_-]{1,500}$/)
          .optional(),
        linkedinClientSecret: z.string().min(1).max(5000).optional(),
        xToken: z.string().max(5000).optional(),
        xClientId: z
          .string()
          .regex(/^[A-Za-z0-9_=-]{1,500}$/)
          .optional(),
        linkedinAuthor: z
          .string()
          .regex(/^$|^urn:li:(person|organization):[a-zA-Z0-9_-]+$/)
          .optional(),
        linkedinVersion: z
          .string()
          .regex(/^20\d{2}(0[1-9]|1[0-2])$/)
          .optional(),
        anthropicKey: z
          .string()
          .regex(/^[A-Za-z0-9_\-]{0,500}$/, 'Paste the API key exactly as shown by the provider.')
          .optional(),
        openaiKey: z
          .string()
          .regex(/^[A-Za-z0-9_\-]{0,500}$/, 'Paste the API key exactly as shown by the provider.')
          .optional(),
      })
      .strict()
      .parse(req.body);
    for (const k of ['linkedinToken', 'xToken'])
      if (c[k] && /[\r\n]/.test(c[k])) throw new Error('Access tokens must be on one line.');
    if (Object.hasOwn(c, 'xToken') || (c.xClientId && c.xClientId !== vault.read().xClientId)) {
      oauth.cancelPending();
      if (!Object.hasOwn(c, 'xToken')) c.xToken = '';
      Object.assign(c, { xRefreshToken: '', xExpiresAt: '', xScope: '', xConnectedAt: '' });
    }
    const previous = vault.read();
    const linkedinAppChanged = ['linkedinClientId', 'linkedinClientSecret'].some(
      (k) => Object.hasOwn(c, k) && c[k] !== previous[k],
    );
    if (
      Object.hasOwn(c, 'linkedinToken') ||
      linkedinAppChanged ||
      (Object.hasOwn(c, 'linkedinAuthor') && c.linkedinAuthor !== previous.linkedinAuthor)
    ) {
      linkedinOAuth.cancelPending();
      Object.assign(c, { linkedinExpiresAt: '', linkedinConnectedAt: '' });
      if (linkedinAppChanged && !Object.hasOwn(c, 'linkedinToken')) c.linkedinToken = '';
    }
    vault.save(c);
    store.event('boss', 'Updated social account credentials.');
    res.json({ ok: true });
  });
  app.patch('/api/drafts/:id', (req, res) => {
    idle();
    const d = draftExists(req.params.id);
    if (d.deliveries.some((x) => ['published', 'uncertain', 'sending'].includes(x.status)))
      throw new Error('A delivered or uncertain post cannot be edited. Resolve delivery first.');
    if (d.status === 'rejected') throw new Error('Rejected drafts cannot be edited.');
    const patch = z
      .object({
        posts: z.object({ linkedin: z.string().min(1).max(4000), x: z.string().min(1).max(2000) }),
        platforms: z
          .array(z.enum(['linkedin', 'x']))
          .min(1)
          .max(2)
          .refine((a) => new Set(a).size === a.length),
      })
      .strict()
      .parse(req.body);
    validatePosts(patch.posts, patch.platforms);
    const edited = JSON.stringify(patch.posts) !== JSON.stringify(d.posts);
    res.json(
      store.updateDraft(
        d.id,
        {
          ...patch,
          approvedAt: null,
          ...(edited
            ? {
                editorial: {
                  ...d.editorial,
                  status: 'edited',
                  review: 'human-edited',
                  issues: [],
                  note: 'The posts changed after source review. Check your edits before approving.',
                },
              }
            : {}),
        },
        'review',
      ),
    );
  });
  app.post('/api/drafts/:id/approve', (req, res) => {
    idle();
    const d = draftExists(req.params.id);
    if (['rejected', 'published'].includes(d.status)) throw new Error('Draft is already closed.');
    validatePosts(d.posts, d.platforms);
    store.updateDraft(d.id, { approvedAt: new Date().toISOString() }, 'approved');
    store.event('boss', `Approved: ${d.title}`, 'success');
    store.scene('approved', { draftId: d.id, title: d.title });
    res.json({ ok: true });
  });
  app.post('/api/drafts/:id/refine', (req, res) => {
    idle();
    const d = draftExists(req.params.id);
    if (
      ['published', 'rejected'].includes(d.status) ||
      d.deliveries.some((x) => ['published', 'uncertain', 'sending'].includes(x.status))
    )
      throw new Error('Only undelivered, open drafts can be rewritten.');
    if (!store.settings().useModel)
      throw new Error('Enable the local model in Office settings first.');
    const { notes = '' } = z
      .object({ notes: z.string().max(600).optional() })
      .strict()
      .parse(req.body);
    office.requireWorker('manager');
    if (d.kind === 'campaign')
      throw new Error('Create a new campaign from Projects or edit this draft.');
    void office.refine(d.id, notes);
    res.status(202).json({ ok: true });
  });
  app.post('/api/drafts/:id/reject', (req, res) => {
    idle();
    const d = draftExists(req.params.id);
    if (d.deliveries.some((x) => ['published', 'uncertain', 'sending'].includes(x.status)))
      throw new Error('Resolve the existing delivery before rejecting this draft.');
    store.updateDraft(d.id, {}, 'rejected');
    store.event('boss', `Rejected: ${d.title}`);
    res.json({ ok: true });
  });
  app.post('/api/drafts/:id/publish', (req, res) => {
    idle();
    const d = draftExists(req.params.id);
    if (!d.approvedAt || ['rejected', 'published'].includes(d.status))
      throw new Error('Approve an open draft first.');
    office.requireWorker('manager');
    void office.publish(d.id);
    res.status(202).json({ ok: true });
  });
  app.post('/api/drafts/:id/resolve', (req, res) => {
    idle();
    const d = draftExists(req.params.id);
    const { platform, outcome, remoteId } = z
      .object({
        platform: z.enum(['x', 'linkedin']),
        outcome: z.enum(['published', 'not-published']),
        remoteId: z.string().max(200).optional(),
      })
      .parse(req.body);
    if (!d.deliveries.some((x) => x.platform === platform && x.status === 'uncertain'))
      throw new Error('Only uncertain deliveries need reconciliation.');
    if (outcome === 'published' && !remoteId?.trim())
      throw new Error('Enter the post ID from your social account.');
    store.delivery(
      d.id,
      platform,
      outcome === 'published' ? 'published' : 'failed',
      remoteId || null,
      outcome === 'not-published'
        ? 'Boss checked the account and confirmed no post was published.'
        : null,
    );
    const done = d.platforms.every((p) =>
      store.deliveries(d.id).some((x) => x.platform === p && x.status === 'published'),
    );
    store.updateDraft(d.id, {}, done ? 'published' : 'attention');
    store.event('boss', `Resolved ${platform} delivery: ${outcome}.`);
    res.json({ ok: true });
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown office endpoint.' }));
  if (existsSync(resolve(staticDir, 'index.html'))) {
    app.use(express.static(staticDir));
    app.get('/{*path}', (req, res) => res.sendFile(resolve(staticDir, 'index.html')));
  } else
    app.get('/', (req, res) =>
      res
        .type('text')
        .send('Run npm run build first, or use npm run dev for the development office.'),
    );
  app.use((error, req, res, next) => {
    if (error.type === 'entity.parse.failed')
      return res.status(400).json({ error: 'Invalid JSON request body.' });
    if (req.path === '/api/connections' && error instanceof z.ZodError)
      return res
        .status(400)
        .json({ error: 'Invalid connection details. Check the required fields and format.' });
    res.status(400).json({
      error:
        error instanceof z.ZodError
          ? error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
          : error.message || 'Something went wrong.',
    });
  });
  // Called only from Electron's main process; no HTTP route can mint these tickets.
  const desktopOAuthURL = (platform) => {
    if (!['x', 'linkedin'].includes(platform)) throw new Error('Unknown account provider.');
    idle();
    for (const [key, value] of desktopTickets)
      if (value.expires < Date.now()) desktopTickets.delete(key);
    if (desktopTickets.size >= 10) throw new Error('Finish the pending sign-in first.');
    const ticket = randomBytes(32).toString('base64url');
    desktopTickets.set(ticket, { platform, expires: Date.now() + 60000 });
    return `http://127.0.0.1:4310/api/oauth/${platform}/desktop?ticket=${ticket}`;
  };
  return { app, store, office, model, desktopOAuthURL, jobWorker };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { startOfficeServer } = await import('./lifecycle.js');
  let runtime;
  let stopRequested = false;
  const stop = async () => {
    stopRequested = true;
    if (runtime) {
      await runtime.close();
      process.exit(0);
    }
  };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, stop);
  if (process.send) {
    process.on('disconnect', stop);
    if (!process.connected) stopRequested = true;
  }
  try {
    runtime = await startOfficeServer({ createApp });
    if (stopRequested) await stop();
    else console.log('Butler is open at http://127.0.0.1:4310');
  } catch (error) {
    console.error(
      error.code === 'EADDRINUSE'
        ? 'Butler is already open, or port 4310 is in use.'
        : error.message,
    );
    process.exit(1);
  }
}
