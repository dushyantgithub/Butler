import express from 'express';
import { z } from 'zod';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { createStore } from './store.js';
import { createVault } from './vault.js';
import { LocalModel, MODELS } from './llm.js';
import { SOURCES } from './sources.js';
import { Office } from './workflow.js';
import { validatePosts } from './publisher.js';
import { ensureLocalEngine } from './runtime.js';

export function createApp(options = {}) {
  const store = options.store || createStore(),
    model = options.model || new LocalModel(),
    vault = options.vault || createVault(store.dir);
  const office = options.office || new Office(store, model, vault);
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const host = req.headers.host || '';
    if (!/^(localhost|127\.0\.0\.1):\d+$/.test(host))
      return res.status(403).json({ error: 'Butler only accepts local requests.' });
    if (
      req.headers.origin &&
      !/^http:\/\/(localhost|127\.0\.0\.1):(4310|5173)$/.test(req.headers.origin)
    )
      return res.status(403).json({ error: 'Request origin is not allowed.' });
    if (req.headers['sec-fetch-site'] === 'cross-site')
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
  app.use(express.json({ limit: '32kb' }));
  const idle = () => {
    if (office.busy) throw new Error('Wait for the current assignment to finish.');
  };
  const draftExists = (id) => {
    const d = store.draft(id);
    if (!d) throw new Error('Draft not found.');
    return d;
  };
  app.get('/api/state', (req, res) =>
    res.json({
      settings: store.settings(),
      agents: office.agents,
      busy: office.busy,
      stopping: office.stopRequested && office.busy,
      drafts: store.drafts(),
      tasks: store.tasks(),
      events: store.events(),
      scenes: store.scenes(),
      sources: SOURCES.map((s) => ({ ...s, health: office.sourceHealth[s.id] })),
      connections: vault.status(),
    }),
  );
  app.get('/api/model', async (req, res) => res.json(await model.status(store.settings().model)));
  app.post('/api/scan', (req, res) => {
    idle();
    void office.runScan();
    res.status(202).json({ ok: true });
  });
  app.post('/api/stop', (req, res) => {
    office.stop();
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
      autoPublish: z.boolean(),
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
    })
    .partial()
    .strict();
  app.patch('/api/settings', (req, res) => {
    idle();
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
        xToken: z.string().max(5000).optional(),
        linkedinAuthor: z
          .string()
          .regex(/^$|^urn:li:(person|organization):[a-zA-Z0-9_-]+$/)
          .optional(),
        linkedinVersion: z
          .string()
          .regex(/^20\d{2}(0[1-9]|1[0-2])$/)
          .optional(),
      })
      .strict()
      .parse(req.body);
    for (const k of ['linkedinToken', 'xToken'])
      if (c[k] && /[\r\n]/.test(c[k])) throw new Error('Access tokens must be on one line.');
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
  if (existsSync(resolve('dist/index.html'))) {
    app.use(express.static(resolve('dist')));
    app.get('/{*path}', (req, res) => res.sendFile(resolve('dist/index.html')));
  } else
    app.get('/', (req, res) =>
      res
        .type('text')
        .send('Run npm run build first, or use npm run dev for the development office.'),
    );
  app.use((error, req, res, next) => {
    res.status(400).json({
      error:
        error instanceof z.ZodError
          ? error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
          : error.message || 'Something went wrong.',
    });
  });
  return { app, store, office, model };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Reserve the port before opening/recovering the database; a second launch
  // must not mark an active office's tasks as interrupted.
  const server = createServer();
  server.on('error', (e) => {
    console.error(
      e.code === 'EADDRINUSE' ? 'Butler is already open, or port 4310 is in use.' : e.message,
    );
    process.exit(1);
  });
  await new Promise((r) => server.listen(4310, '127.0.0.1', r));
  const { app, office, store, model } = createApp();
  server.on('request', app);
  const engine = await ensureLocalEngine();
  console.log('Butler is open at http://127.0.0.1:4310');
  const timer = setInterval(() => office.tick(), 30000);
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    clearInterval(timer);
    if (office.busy) office.stop();
    server.close();
    const deadline = Date.now() + 220000;
    while (office.busy && Date.now() < deadline) await new Promise((r) => setTimeout(r, 300));
    try {
      await model.unload(store.settings().model);
    } catch {}
    engine.stop();
    store.close();
    process.exit(0);
  };
  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}
