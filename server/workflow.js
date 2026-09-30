import { SOURCES, fetchText, parseFeed, readArticle, normalize, trustedUrl } from './sources.js';
import { randomUUID } from 'node:crypto';
import { loadWorkerCatalog, workerContext } from './workers.js';
import { readProjectSource, projectSchema } from './projects.js';
import { projectFromCompany, COMPANY_PROJECT_ID } from './company.js';
import { composePosts, validatePosts, publishPost } from './publisher.js';

export class Office {
  constructor(store, model, vault, dependencies = {}) {
    this.store = store;
    this.model = model;
    this.vault = vault;
    this.fetchText = dependencies.fetchText || fetchText;
    this.publishPost = dependencies.publishPost || publishPost;
    this.catalog = dependencies.catalog || loadWorkerCatalog();
    this.readProjectSource = dependencies.readProjectSource || readProjectSource;
    this.busy = false;
    this.stopRequested = false;
    this.sourceHealth = {};
    this.releaseCache = new Map();
    this.running = new Map();
    this.disposed = false;
    this.agents = {
      researcher: { status: 'idle', current: 'Ready for your next assignment' },
      manager: { status: 'idle', current: 'Waiting for the researcher’s handoff' },
    };
    store.recover();
    for (const draft of store
      .drafts()
      .filter((d) => !['published', 'rejected'].includes(d.status))) {
      if (draft.kind === 'campaign') continue;
      try {
        trustedUrl(
          draft.url,
          SOURCES.find((s) => s.id === draft.sourceId),
        );
      } catch {
        const note =
          'This article no longer meets the approved publisher policy. Community hosting is not publisher verification.';
        store.updateDraft(
          draft.id,
          {
            approvedAt: null,
            evidence: { ...draft.evidence, primarySource: false },
            reviewNote: note,
          },
          'rejected',
        );
        store.event('manager', `Withheld “${draft.title}”: ${note}`, 'warning');
      }
    }
    // Resume work that was waiting when the office last closed.
    if (store.activeJobs().length) setTimeout(() => this.pump(), 50);
  }
  setAgent(
    id,
    status,
    current,
    phase = status === 'working' ? (id === 'researcher' ? 'researching' : 'writing') : 'idle',
  ) {
    this.agents[id] = { status, current, phase, since: new Date().toISOString() };
  }
  async readSource(url, source) {
    if (source.kind !== 'github-release') return this.fetchText(url, source);
    const cached = this.releaseCache.get(url);
    if (cached && Date.now() - cached.time < 600000) {
      if (cached.error) throw new Error(cached.error);
      return cached.page;
    }
    this.releaseCache.delete(url);
    if (this.releaseCache.size >= 30)
      this.releaseCache.delete(this.releaseCache.keys().next().value);
    try {
      const page = await this.fetchText(url, source);
      if (page.text.length <= 200000) this.releaseCache.set(url, { time: Date.now(), page });
      return page;
    } catch (e) {
      if (/HTTP 404\b/.test(e.message))
        this.releaseCache.set(url, { time: Date.now(), error: e.message });
      throw e;
    }
  }
  requireWorker(id) {
    return workerContext(this.catalog, this.store, id);
  }
  canScan() {
    return ['researcher', 'manager'].every((id) => {
      const worker = this.catalog.workers.find((w) => w.id === id);
      return worker && this.store.workerConfig(worker).deployment === 'deployed';
    });
  }
  async runScan() {
    if (this.busy) throw new Error('An assignment is already running.');
    this.requireWorker('researcher');
    this.requireWorker('manager');
    this.busy = true;
    this.stopRequested = false;
    const settings = this.store.settings();
    this.store.saveSettings({ lastScan: new Date().toISOString() });
    const task = this.store.startTask('researcher', 'Research the latest AI announcements');
    this.store.event('researcher', 'Started a news round. Checking approved publishers.');
    this.store.scene('research', { title: 'A new AI news assignment' });
    let count = 0,
      reachable = 0,
      managerTask,
      outcome = 'Ready for your next assignment';
    this.setAgent('researcher', 'working', 'Reading trusted publisher feeds');
    try {
      const candidates = [];
      const sources = SOURCES.filter((s) => settings.enabledSources.includes(s.id));
      let nextSource = 0,
        checked = 0;
      // Keep memory and connection use bounded even with a large source library.
      await Promise.all(
        Array.from({ length: Math.min(4, sources.length) }, async () => {
          while (!this.stopRequested && nextSource < sources.length) {
            const source = sources[nextSource++];
            try {
              const feed = await this.fetchText(source.url, source);
              const articles = parseFeed(feed.text, source, settings.lookbackHours);
              candidates.push(...articles);
              reachable++;
              this.sourceHealth[source.id] = {
                ok: true,
                checkedAt: new Date().toISOString(),
                count: articles.length,
              };
            } catch (e) {
              this.sourceHealth[source.id] = {
                ok: false,
                checkedAt: new Date().toISOString(),
                error: e.message,
              };
              this.store.event('researcher', `${source.name}: ${e.message}`, 'warning');
            }
            checked++;
            this.setAgent(
              'researcher',
              'working',
              `Checking trusted feeds: ${checked} of ${sources.length}`,
            );
          }
        }),
      );
      if (!reachable && !this.stopRequested)
        throw new Error('No publisher feeds could be reached. Check your connection or Sources.');
      const recent = [...new Map(candidates.map((c) => [c.url, c])).values()].sort(
        (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
      );
      const unseen = recent.filter((a) => !this.store.hasUrl(a.url));
      // News takes priority over maintenance releases. Give each source a turn
      // before checking another item from the same feed.
      const rounds = new Map();
      const unique = unseen
        .map((article) => {
          const round = rounds.get(article.sourceId) || 0;
          rounds.set(article.sourceId, round + 1);
          return {
            article,
            round,
            release: SOURCES.find((s) => s.id === article.sourceId)?.kind === 'github-release',
          };
        })
        .sort(
          (a, b) =>
            Number(a.release) - Number(b.release) ||
            a.round - b.round ||
            Date.parse(b.article.publishedAt) - Date.parse(a.article.publishedAt),
        )
        .map((item) => item.article);
      let attempted = 0,
        failed = 0,
        blocked = 0,
        redirectedDuplicates = 0;
      // A small draft batch must not let four unreadable pages exhaust the search.
      // Bound network work independently of the requested number of drafts.
      const attemptLimit = 40;
      for (const article of unique.slice(0, attemptLimit)) {
        if (count >= settings.batchSize || this.stopRequested) break;
        attempted++;
        this.setAgent('researcher', 'working', `Reading: ${article.title}`);
        try {
          const source = SOURCES.find((s) => s.id === article.sourceId);
          const full = await readArticle(
            article,
            source,
            settings.lookbackHours,
            this.readSource.bind(this),
          );
          if (this.store.hasUrl(full.url)) {
            redirectedDuplicates++;
            continue;
          }
          const content = full;
          let result = {
              summary: `${article.sourceName} reports: ${content.candidates[0]}`,
              excerptIndex: 0,
            },
            method = 'extractive';
          if (settings.useModel) {
            this.setAgent('researcher', 'working', `Writing a local brief: ${article.title}`);
            try {
              result = await this.model.summarize(full, settings.model);
              method = 'local-model';
            } catch (e) {
              this.store.event('researcher', e.message, 'warning');
            }
          }
          if (this.stopRequested) break;
          const quote = content.candidates[result.excerptIndex];
          if (!normalize(content.text).includes(normalize(quote)))
            throw new Error('Supporting excerpt was not found in the article.');
          let posts = composePosts(full, quote);
          if (!managerTask)
            managerTask = this.store.startTask(
              'manager',
              'Review researcher handoffs and prepare social posts',
            );
          this.setAgent(
            'manager',
            'working',
            `Checking evidence and post lengths: ${article.title}`,
          );
          this.store.scene('handoff', { title: article.title, url: full.url });
          let refined = {
            editorial: {
              version: 2,
              status: 'needs-writing',
              issues: ['A polished draft needs the local model. Ask Quinn to rewrite.'],
            },
          };
          if (settings.useModel && this.model.writePosts) {
            try {
              refined = await this.model.writePosts(
                full,
                settings.model,
                '',
                () => !this.stopRequested,
              );
              posts = refined.posts;
              result.summary = refined.summary;
              method = 'local-model';
            } catch (e) {
              refined.editorial.issues = [e.message];
              this.store.event('manager', `Writing needs attention: ${e.message}`, 'warning');
            }
          }
          if (this.stopRequested) break;
          validatePosts(posts, settings.platforms);
          const draft = this.store.addDraft({
            title: article.title,
            url: full.url,
            sourceName: article.sourceName,
            sourceId: article.sourceId,
            publishedAt: full.publishedAt,
            checkedAt: new Date().toISOString(),
            summary: result.summary,
            method,
            quote,
            posts,
            canonicalPosts: posts,
            platforms: [...settings.platforms],
            evidence: {
              domain: new URL(full.url).hostname,
              quoteMatched: true,
              primarySource: true,
              authorship: 'unknown',
              independentConfirmation: false,
            },
            approvedAt: null,
            keyPoints: refined.keyPoints || [],
            caveat: refined.caveat || '',
            editorial: refined.editorial,
          });
          count++;
          this.store.event('manager', `Draft ready for the boss: ${article.title}`, 'success');
          this.store.scene('approval', { draftId: draft.id, title: draft.title });
          this.setAgent('manager', 'idle', 'Handoff checked; drafts are on the boss’s desk');
        } catch (e) {
          failed++;
          if (/HTTP (403|429)\b/.test(e.message)) blocked++;
          this.store.event('researcher', `Skipped “${article.title}”: ${e.message}`, 'warning');
        }
      }
      let detail = `${count} new draft(s) prepared. Found ${recent.length} recent article(s) across ${reachable} reachable feed(s) in the last ${settings.lookbackHours} hours; ${recent.length - unique.length + redirectedDuplicates} already handled (including rejected drafts). Tried ${attempted} new article(s).`;
      if (failed)
        detail += ` ${failed} article(s) could not become drafts${blocked ? `; ${blocked} blocked or rate-limited by the publisher (HTTP 403/429)` : ''}. See the journal for individual reasons.`;
      if (!recent.length) detail += ' No approved-source articles were found in this time window.';
      else if (!unique.length) detail += ' All recent stories were already handled.';
      if (!count && unique.length > attempted && !this.stopRequested)
        detail += ` Search stopped at the ${attemptLimit}-article safety limit; ${unique.length - attempted} remain unchecked.`;
      if (this.stopRequested)
        detail = `Stopped at a safe checkpoint. ${count} draft(s) saved. ${detail}`;
      const status = this.stopRequested
        ? 'cancelled'
        : !count && failed
          ? 'attention'
          : 'completed';
      outcome = detail;
      this.store.finishTask(task, status, detail);
      if (managerTask)
        this.store.finishTask(
          managerTask,
          this.stopRequested ? 'cancelled' : 'completed',
          `Checked ${count} handoff(s). See each draft for delivery outcomes.`,
        );
      this.store.event('researcher', detail, status === 'attention' ? 'warning' : 'success');
    } catch (e) {
      outcome = e.message;
      this.store.finishTask(task, 'failed', e.message);
      if (managerTask) this.store.finishTask(managerTask, 'failed', e.message);
      this.store.event('researcher', e.message, 'error');
    } finally {
      this.setAgent('researcher', 'idle', outcome);
      this.setAgent('manager', 'idle', 'Review complete. Waiting for the next handoff');
      this.busy = false;
    }
  }
  async deliver(id, automatic = false) {
    let draft = this.store.draft(id);
    if (!draft || ['rejected', 'published'].includes(draft.status))
      throw new Error('This draft is not available for publishing.');
    this.requireWorker('manager');
    if (automatic || !draft.approvedAt)
      throw new Error('Approve this draft before publishing. CEO approval is always required.');
    if (draft.kind !== 'campaign') {
      const source = SOURCES.find((s) => s.id === draft.sourceId);
      if (!source) throw new Error('This publisher is not approved.');
      trustedUrl(draft.url, source);
      const age = Date.now() - Date.parse(draft.publishedAt);
      if (
        !Number.isFinite(age) ||
        age > this.store.settings().lookbackHours * 3600000 ||
        age < -300000
      )
        throw new Error('This announcement is outside your freshness window.');
    }
    validatePosts(draft.posts, draft.platforms);
    const credentials = this.vault.read();
    this.store.updateDraft(id, {}, 'publishing');
    for (const platform of draft.platforms) {
      const previous = this.store.deliveries(id).find((d) => d.platform === platform);
      if (['published', 'uncertain', 'sending'].includes(previous?.status)) continue;
      if (this.stopRequested) break;
      if (
        !credentials[platform === 'x' ? 'xToken' : 'linkedinToken'] ||
        (platform === 'linkedin' && !credentials.linkedinAuthor)
      ) {
        this.store.delivery(
          id,
          platform,
          'failed',
          null,
          `Connect ${platform === 'x' ? 'X' : 'LinkedIn'} in Settings.`,
        );
        continue;
      }
      this.setAgent(
        'manager',
        'working',
        `Publishing to ${platform === 'x' ? 'X' : 'LinkedIn'}: ${draft.title}`,
        'publishing',
      );
      this.store.delivery(id, platform, 'sending');
      try {
        const remoteId = await this.publishPost(platform, draft.posts[platform], credentials);
        this.store.delivery(id, platform, 'published', remoteId);
        this.store.event(
          'manager',
          `Published to ${platform === 'x' ? 'X' : 'LinkedIn'}: ${draft.title}`,
          'success',
        );
      } catch (e) {
        this.store.delivery(id, platform, e.uncertain ? 'uncertain' : 'failed', null, e.message);
        this.store.event('manager', `Publishing needs attention: ${e.message}`, 'error');
      }
    }
    const deliveries = this.store.deliveries(id);
    const done = draft.platforms.every((p) =>
      deliveries.some((d) => d.platform === p && d.status === 'published'),
    );
    this.store.updateDraft(id, {}, done ? 'published' : 'attention');
    this.store.scene(done ? 'published' : 'attention', { draftId: id, title: draft.title });
    return done;
  }
  async publish(id) {
    this.requireWorker('manager');
    if (this.busy) throw new Error('Wait for the current assignment to finish.');
    const draft = this.store.draft(id);
    if (!draft) throw new Error('Draft not found.');
    this.busy = true;
    this.stopRequested = false;
    this.store.scene('publish', { draftId: id, title: draft.title });
    const task = this.store.startTask('manager', `Publish: ${draft.title}`);
    try {
      const done = await this.deliver(id);
      this.store.finishTask(
        task,
        done ? 'completed' : 'attention',
        done
          ? 'All selected platforms accepted the posts.'
          : 'See the draft for platform-specific results.',
      );
    } catch (e) {
      this.store.finishTask(task, 'failed', e.message);
      this.store.event('manager', e.message, 'error');
    } finally {
      this.busy = false;
      this.setAgent('manager', 'idle', 'Waiting for your next assignment');
    }
  }
  async refine(id, notes = '') {
    this.requireWorker('manager');
    if (this.busy) throw new Error('Wait for the current assignment to finish.');
    const draft = this.store.draft(id);
    if (
      !draft ||
      ['published', 'rejected'].includes(draft.status) ||
      draft.deliveries.some((d) => ['published', 'uncertain', 'sending'].includes(d.status))
    )
      throw new Error('This draft cannot be rewritten after delivery or rejection.');
    if (draft.kind === 'campaign')
      throw new Error('Edit this campaign on the CEO desk, or create a new version from Projects.');
    if (!this.store.settings().useModel)
      throw new Error('Enable the local model in Office settings to write refined drafts.');
    this.busy = true;
    this.stopRequested = false;
    const task = this.store.startTask('manager', `Rewrite and review: ${draft.title}`);
    this.store.updateDraft(id, { approvedAt: null }, 'review');
    this.store.scene('rewrite', { draftId: id, title: draft.title });
    this.setAgent('manager', 'working', `Writing a refined draft: ${draft.title}`, 'writing');
    try {
      const source = SOURCES.find((s) => s.id === draft.sourceId);
      if (!source) throw new Error('Publisher is not approved.');
      const full = await readArticle(
        draft,
        source,
        this.store.settings().lookbackHours,
        this.readSource.bind(this),
      );
      const refined = await this.model.writePosts(
        full,
        this.store.settings().model,
        notes,
        () => !this.stopRequested,
      );
      if (this.stopRequested)
        throw new Error('Rewrite stopped. The previous version has been kept.');
      validatePosts(refined.posts, draft.platforms);
      const quote =
        normalize(full.text).includes(normalize(draft.quote || '')) && draft.quote
          ? draft.quote
          : full.candidates[0];
      const evidence = {
        ...draft.evidence,
        domain: new URL(full.url).hostname,
        quoteMatched: normalize(full.text).includes(normalize(quote)),
        primarySource: true,
      };
      const revisions = [
        ...(draft.revisions || []),
        { posts: draft.posts, summary: draft.summary, savedAt: new Date().toISOString() },
      ].slice(-5);
      this.store.updateDraft(
        id,
        {
          ...refined,
          quote,
          evidence,
          url: full.url,
          canonicalPosts: refined.posts,
          lastRewriteError: null,
          method: 'local-model',
          revisions,
          approvedAt: null,
          checkedAt: new Date().toISOString(),
          writingNotes: notes,
        },
        'review',
      );
      this.store.finishTask(
        task,
        refined.editorial.status === 'ready' ? 'completed' : 'attention',
        refined.editorial.status === 'ready'
          ? 'Wrote detailed platform-specific posts and checked claims against the source.'
          : 'Wrote refined posts. The editor flagged claims for the boss to review.',
      );
      this.store.event(
        'manager',
        `Refined draft ready for your approval: ${draft.title}`,
        'success',
      );
      this.store.scene('approval', { draftId: id, title: draft.title });
    } catch (e) {
      this.store.finishTask(task, this.stopRequested ? 'cancelled' : 'failed', e.message);
      this.store.updateDraft(id, { lastRewriteError: e.message });
      this.store.event('manager', e.message, 'warning');
      this.store.scene('attention', { draftId: id, title: draft.title });
    } finally {
      this.busy = false;
      this.setAgent('manager', 'idle', 'Your draft is on the boss’s desk');
    }
  }
  // ---------------------------------------------------------------------------
  // Specialist work queue. Many employees can hold assignments; the engine decides
  // how many run at once (one for the local model, several for a cloud key).
  // ---------------------------------------------------------------------------
  validateAssignment({ workerId, projectId, kind = 'report', skillIds, brief = '' }) {
    if (workerId === 'job-hunter')
      throw new Error(
        'Open Job search to upload your résumé, save preferences, and start this worker.',
      );
    workerContext(this.catalog, this.store, workerId, skillIds, brief);
    const project = projectId ? this.store.project(projectId) : null;
    if (projectId && !project) throw new Error('Project not found.');
    if (kind === 'campaign' && !project)
      throw new Error('Choose a project before creating a campaign.');
    if (!this.store.settings().useModel)
      throw new Error('Enable the AI engine in Office settings to assign specialist work.');
    return project;
  }
  enqueue(assignment, origin = 'boss') {
    this.validateAssignment(assignment);
    const active = this.store.activeJobs();
    if (active.filter((j) => j.workerId === assignment.workerId).length >= 6)
      throw new Error('This employee already has six assignments waiting. Let them finish first.');
    if (active.length >= 80)
      throw new Error('The office queue is full. Let some work finish first.');
    const worker = this.catalog.workers.find((w) => w.id === assignment.workerId);
    const title = (assignment.title || assignment.brief).replace(/\s+/g, ' ').slice(0, 140);
    const job = this.store.addJob({
      workerId: assignment.workerId,
      projectId: assignment.projectId || null,
      brief: assignment.brief,
      kind: assignment.kind || 'report',
      skillIds: assignment.skillIds || null,
      title,
      origin,
      missionId: assignment.missionId || null,
      followUpOf: assignment.followUpOf || null,
    });
    this.store.event(
      assignment.workerId,
      `${worker?.persona?.firstName || worker?.name} picked up “${title}”.`,
    );
    this.store.scene('queued', { workerId: assignment.workerId, jobId: job.id, title });
    queueMicrotask(() => this.pump());
    return job;
  }
  capacity() {
    return Math.max(1, this.model.capacity?.() ?? 1);
  }
  pump() {
    if (this.disposed) return;
    const runningWorkers = new Set([...this.running.values()].map((c) => c.workerId));
    for (const job of this.store.activeJobs()) {
      if (this.running.size >= this.capacity()) break;
      if (job.status !== 'queued' || this.running.has(job.id) || runningWorkers.has(job.workerId))
        continue;
      const worker = this.catalog.workers.find((w) => w.id === job.workerId);
      if (!worker || this.store.workerConfig(worker).deployment !== 'deployed') {
        this.store.updateJob(job.id, { error: 'Employee is no longer deployed.' }, 'cancelled');
        continue;
      }
      runningWorkers.add(job.workerId);
      const control = { cancelled: false, workerId: job.workerId, jobId: job.id };
      this.running.set(job.id, control);
      this.store.updateJob(job.id, { startedAt: new Date().toISOString() }, 'running');
      void this.runAssignment({ ...job, workerId: job.workerId }, control)
        .catch(() => {})
        .finally(() => {
          this.running.delete(job.id);
          this.pump();
        });
    }
  }
  cancelJob(id) {
    const job = this.store.job(id);
    if (!job || !['queued', 'running'].includes(job.status))
      throw new Error('Only waiting or running work can be cancelled.');
    const control = this.running.get(id);
    if (control) control.cancelled = true;
    else this.store.updateJob(id, { error: 'Cancelled by the boss.' }, 'cancelled');
    this.store.event('boss', `Cancelled “${job.title}”.`);
  }
  workerHasWork(workerId) {
    return this.store.activeJobs().some((j) => j.workerId === workerId);
  }
  // Real state for the office floor and thought bubbles.
  activity() {
    const out = {};
    const active = this.store.activeJobs();
    const pendingApprovals = this.store.approvals(300).filter((a) => a.status === 'pending');
    const openDrafts = this.store
      .drafts()
      .filter((d) => ['review', 'attention', 'approved'].includes(d.status));
    const lastDone = new Map();
    for (const job of this.store.recentJobs(120))
      if (job.status === 'done' && !lastDone.has(job.workerId))
        lastDone.set(job.workerId, job.title);
    for (const worker of this.catalog.workers) {
      const id = worker.id;
      const running = active.find((j) => j.workerId === id && j.status === 'running');
      const queued = active.filter((j) => j.workerId === id && j.status === 'queued');
      const approval = pendingApprovals.find((a) => a.workerId === id);
      const draft = openDrafts.find(
        (d) => (d.workerId || (d.kind === 'campaign' ? null : 'manager')) === id,
      );
      const news = this.agents[id];
      let entry;
      if (running)
        entry = {
          status: 'working',
          phase: this.agents[id]?.phase || 'writing',
          current: this.agents[id]?.current || 'Working on an assignment',
          task: running.title,
          jobId: running.id,
          since: running.startedAt,
        };
      else if (news?.status === 'working') entry = { ...news, task: news.current };
      else if (queued.length)
        entry = {
          status: 'queued',
          current: `Waiting for the AI engine · ${queued.length} in line`,
          task: queued[0].title,
          jobId: queued[0].id,
        };
      else if (approval || draft)
        entry = {
          status: 'approval',
          current: 'Waiting for your approval',
          task: approval?.title || draft?.title,
          approvalId: approval?.id || null,
          draftId: approval ? null : draft?.id,
        };
      else entry = { status: 'idle', current: news?.current || 'Ready for a brief' };
      entry.queued = queued.length;
      entry.lastDone = lastDone.get(id) || null;
      out[id] = entry;
    }
    return out;
  }
  async runAssignment(assignment, control) {
    const { workerId, projectId, brief, kind = 'report', skillIds } = assignment;
    if (!control) {
      // Direct calls (tests, scripts) are still cancellable through stop().
      control = { cancelled: false, workerId, jobId: `direct-${randomUUID()}` };
      this.validateAssignment(assignment);
      this.running.set(control.jobId, control);
    }
    const cancelled = () => control.cancelled;
    const jobId = assignment.id && this.store.job(assignment.id) ? assignment.id : null;
    let context, project;
    try {
      project = this.validateAssignment(assignment);
      context = workerContext(this.catalog, this.store, workerId, skillIds || undefined, brief);
    } catch (e) {
      if (jobId) this.store.updateJob(jobId, { error: e.message }, 'failed');
      this.store.event(workerId, e.message, 'warning');
      if (control.jobId.startsWith('direct-')) this.running.delete(control.jobId);
      throw e;
    }
    const worker = this.catalog.workers.find((w) => w.id === workerId);
    const company = this.store.company();
    const task = this.store.startTask(
      workerId,
      `${kind === 'campaign' ? 'Campaign' : 'Assignment'}: ${(assignment.title || brief).slice(0, 120)}`,
    );
    if (jobId) this.store.updateJob(jobId, { taskId: task });
    this.store.scene('started', { workerId, jobId, title: assignment.title || brief.slice(0, 80) });
    this.setAgent(workerId, 'working', 'Reviewing the brief and project sources', 'researching');
    const engine = this.model.describe?.() || {
      engine: 'local',
      model: this.store.settings().model,
    };
    try {
      const sources = [];
      const sourceErrors = [];
      for (const url of [
        ...new Set([project?.website, ...(project?.sources || [])].filter(Boolean)),
      ].slice(0, 4)) {
        if (cancelled()) break;
        try {
          sources.push(await this.readProjectSource(url));
        } catch (e) {
          sourceErrors.push({ url, error: e.message });
        }
      }
      if (cancelled()) throw new Error('Assignment stopped before writing.');
      // Keep each prompt within the local model's context budget.
      const input = {
        assignment: brief,
        company: company
          ? {
              name: company.companyName,
              ceo: company.ceo?.name,
              approvalsRequiredFor: [
                'publishing',
                company.approvals?.outreach !== false && 'sending or outreach',
                company.approvals?.spending !== false && 'spending',
                company.approvals?.verifyFacts !== false && 'unverified claims',
              ].filter(Boolean),
            }
          : undefined,
        project: project
          ? Object.fromEntries(
              Object.entries(project)
                .filter(([k]) => !['id', 'updatedAt', 'sources'].includes(k))
                .map(([k, v]) => [
                  k,
                  String(v).slice(0, ['facts', 'restrictions'].includes(k) ? 2000 : 700),
                ]),
            )
          : null,
        sources: sources.map((s) => ({ ...s, text: s.text.slice(0, 1600) })),
        sourceErrors,
      };
      this.setAgent(
        workerId,
        'working',
        kind === 'campaign'
          ? 'Writing campaign copy and visual direction'
          : 'Preparing the specialist deliverable',
        'writing',
      );
      const skillsUsed = context.skills.map((s) => s.name);
      if (kind === 'campaign') {
        const result = await this.model.campaign(input, context, this.store.settings().model);
        if (cancelled()) throw new Error('Assignment stopped. No draft was saved.');
        const posts = { linkedin: result.linkedin, x: result.x };
        validatePosts(posts, ['linkedin', 'x']);
        const draft = this.store.addDraft({
          kind: 'campaign',
          projectId,
          projectName: project.name,
          workerId,
          title: result.title,
          url: `urn:butler:campaign:${randomUUID()}`,
          sourceName: project.name,
          projectWebsite: project.website,
          projectSnapshot: project,
          modelBrief: input.project,
          researchSources: input.sources,
          sourceErrors,
          summary: result.summary,
          quote: '',
          keyPoints: result.keyPoints,
          visualConcept: result.visualConcept,
          graphicHeadline: result.graphicHeadline,
          posts,
          canonicalPosts: posts,
          platforms: [...this.store.settings().platforms],
          publishedAt: new Date().toISOString(),
          checkedAt: new Date().toISOString(),
          method: engine.engine === 'cloud' ? 'cloud-model' : 'local-model',
          approvedAt: null,
          usedSkills: skillsUsed,
          evidence: { primarySource: false, quoteMatched: false },
          editorial: {
            status: 'needs-review',
            issues: [
              ...result.issues,
              ...sourceErrors.map((s) => `Could not read ${s.url}: ${s.error}`),
            ],
            note: 'Check product claims, copy and visual direction before CEO approval. Visual direction is a brief; text publishing does not upload images.',
          },
          caveat: 'Uses owner-provided facts and the listed sources. Claims need CEO review.',
        });
        const deliverable = this.store.addDeliverable({
          workerId,
          jobId,
          kind: 'campaign',
          title: result.title,
          summary: result.summary,
          content: `## LinkedIn\n\n${posts.linkedin}\n\n## X\n\n${posts.x}\n\n## Visual direction\n\n${result.visualConcept}\n\n## Key points\n\n${(result.keyPoints || []).map((p) => `- ${p}`).join('\n')}`,
          nextSteps: ['Review the campaign on your desk, then approve & publish.'],
          draftId: draft.id,
          projectId,
          projectName: project.name,
          skills: skillsUsed,
          engine: engine.engine,
          brief,
        });
        if (jobId) this.store.updateJob(jobId, { deliverableId: deliverable.id }, 'done');
        this.store.finishTask(
          task,
          'completed',
          `Campaign saved to the CEO desk: ${draft.title}. Skills used: ${skillsUsed.join(', ') || 'worker specialty'}.`,
        );
        this.store.scene('approval', { draftId: draft.id, title: draft.title, workerId });
      } else {
        const result = await this.model.work(input, context, this.store.settings().model);
        if (cancelled()) throw new Error('Assignment stopped. No report was saved.');
        const title = (result.title || assignment.title || brief)
          .replace(/\s+/g, ' ')
          .slice(0, 160);
        const deliverable = this.store.addDeliverable({
          workerId,
          jobId,
          kind: 'report',
          title,
          summary: result.summary || '',
          content: result.report,
          nextSteps: result.nextSteps || [],
          projectId: projectId || null,
          projectName: project?.name || null,
          skills: skillsUsed,
          engine: engine.engine,
          sourceErrors,
          brief,
        });
        const approvals = (result.approvals || []).slice(0, 4).map((a) =>
          this.store.addApproval({
            workerId,
            deliverableId: deliverable.id,
            type: a.type,
            title: a.title,
            detail: a.detail,
            content: a.content || '',
            platform: a.platform || '',
          }),
        );
        if (jobId) this.store.updateJob(jobId, { deliverableId: deliverable.id }, 'done');
        this.store.finishTask(
          task,
          'completed',
          `${title}. ${result.summary || ''}\n\n${result.report.slice(0, 6000)}\n\nSkills used: ${skillsUsed.join(', ') || 'worker specialty'}${approvals.length ? `\nNeeds your approval: ${approvals.map((a) => a.title).join('; ')}` : ''}${sourceErrors.length ? '\nSource gaps: ' + sourceErrors.map((s) => `${s.url}: ${s.error}`).join('; ') : ''}`,
        );
        this.store.scene('delivered', { workerId, deliverableId: deliverable.id, title });
        for (const a of approvals)
          this.store.scene('approval-request', { workerId, approvalId: a.id, title: a.title });
      }
      this.store.event(
        workerId,
        `${worker?.persona?.firstName || worker?.name} finished “${(assignment.title || brief).slice(0, 80)}”. Ready for your review.`,
        'success',
      );
    } catch (e) {
      const status = cancelled() ? 'cancelled' : 'failed';
      this.store.finishTask(task, status, e.message);
      if (jobId) this.store.updateJob(jobId, { error: e.message }, status);
      this.store.event(workerId, e.message, 'warning');
    } finally {
      if (control.jobId.startsWith('direct-')) this.running.delete(control.jobId);
      this.setAgent(workerId, 'idle', 'Ready for your next assignment');
    }
  }
  // ---------------------------------------------------------------------------
  // Approvals: nothing external happens without the CEO's explicit decision.
  // ---------------------------------------------------------------------------
  decide(id, decision, { note = '', followUp = true } = {}) {
    const approval = this.store.approval(id);
    if (!approval) throw new Error('Approval not found.');
    if (approval.status !== 'pending') throw new Error('This request was already decided.');
    const worker = this.catalog.workers.find((w) => w.id === approval.workerId);
    const who = worker?.persona?.firstName || worker?.name || 'The employee';
    const outcome = { note, result: '' };
    const company = this.store.company();
    const deployed = (wid) => {
      const w = this.catalog.workers.find((x) => x.id === wid);
      return w && this.store.workerConfig(w).deployment === 'deployed';
    };
    if (decision === 'approve') {
      if (approval.type === 'verify') {
        if (company) {
          const line = `✓ CEO verified: ${approval.content || approval.detail || approval.title}`;
          this.saveCompany({
            ...company,
            facts: `${company.facts ? company.facts + '\n' : ''}${line}`.slice(-6000),
          });
          outcome.result = 'Added to your confirmed facts.';
        } else outcome.result = 'Verified.';
      } else if (approval.type === 'publish') {
        const writer = deployed('manager') ? 'manager' : approval.workerId;
        if (!this.store.project(COMPANY_PROJECT_ID))
          throw new Error('Finish company setup so posts can be drafted from your profile.');
        const job = this.enqueue(
          {
            workerId: writer,
            projectId: COMPANY_PROJECT_ID,
            kind: 'campaign',
            title: `Posts for: ${approval.title}`.slice(0, 140),
            brief:
              `The CEO approved this idea for publishing. Turn it into final LinkedIn and X posts for review. ${approval.detail}\n\n${approval.content}`.slice(
                0,
                2000,
              ),
            followUpOf: approval.id,
          },
          'approval',
        );
        outcome.result = `Final posts are being drafted (${job.title}). You’ll approve them once more before anything is published.`;
      } else if (followUp && deployed(approval.workerId)) {
        this.enqueue(
          {
            workerId: approval.workerId,
            projectId: this.store.project(COMPANY_PROJECT_ID) ? COMPANY_PROJECT_ID : undefined,
            kind: 'report',
            title: `Next step: ${approval.title}`.slice(0, 140),
            brief:
              `The CEO approved: ${approval.title}. ${approval.detail} ${note ? `CEO note: ${note}.` : ''} Prepare the execution-ready version and a short checklist of what the CEO must do personally. You still cannot send, sign, buy or publish anything yourself.\n\n${approval.content}`.slice(
                0,
                2000,
              ),
            followUpOf: approval.id,
          },
          'approval',
        );
        outcome.result = `${who} is preparing the execution-ready version.`;
      } else outcome.result = 'Approved. Complete the external step yourself when ready.';
    } else {
      if (approval.type === 'verify' && company) {
        const line = `Do not claim: ${approval.content || approval.detail || approval.title}`;
        this.saveCompany({
          ...company,
          restrictions: `${company.restrictions ? company.restrictions + '\n' : ''}${line}`.slice(
            -2000,
          ),
        });
        outcome.result = 'Added to things your team must not claim.';
      } else outcome.result = 'Declined. Nothing was done.';
    }
    const updated = this.store.decideApproval(
      id,
      decision === 'approve' ? 'approved' : 'declined',
      {
        decision: outcome,
      },
    );
    this.store.event(
      'boss',
      `${decision === 'approve' ? 'Approved' : 'Declined'} ${who}’s request: ${approval.title}. ${outcome.result}`,
      decision === 'approve' ? 'success' : 'info',
    );
    this.store.scene('decision', { workerId: approval.workerId, approvalId: id, decision });
    return updated;
  }
  saveCompany(profile) {
    const saved = this.store.saveCompany(profile);
    this.store.saveProject(projectSchema.parse(projectFromCompany(saved)), COMPANY_PROJECT_ID);
    return saved;
  }
  stop() {
    this.stopRequested = true;
    for (const control of this.running.values()) control.cancelled = true;
    for (const job of this.store.activeJobs())
      if (job.status === 'queued')
        this.store.updateJob(job.id, { error: 'Stopped by the boss.' }, 'cancelled');
    this.store.event('boss', 'Asked the team to stop after the current operation.');
  }
  dispose() {
    this.disposed = true;
  }
  tick() {
    const s = this.store.settings();
    if (
      s.scheduleHours > 0 &&
      this.canScan() &&
      !this.busy &&
      (!s.lastScan || Date.now() - Date.parse(s.lastScan) >= s.scheduleHours * 3600000)
    )
      void this.runScan();
  }
}
