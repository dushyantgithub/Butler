import { SOURCES, fetchText, parseFeed, extractArticle, normalize, trustedUrl } from './sources.js';
import { composePosts, validatePosts, publishPost } from './publisher.js';

export class Office {
  constructor(store, model, vault, dependencies = {}) {
    this.store = store;
    this.model = model;
    this.vault = vault;
    this.fetchText = dependencies.fetchText || fetchText;
    this.publishPost = dependencies.publishPost || publishPost;
    this.busy = false;
    this.stopRequested = false;
    this.sourceHealth = {};
    this.agents = {
      researcher: { status: 'idle', current: 'Ready for your next assignment' },
      manager: { status: 'idle', current: 'Waiting for the researcher’s handoff' },
    };
    store.recover();
    for (const draft of store
      .drafts()
      .filter((d) => !['published', 'rejected'].includes(d.status))) {
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
  }
  setAgent(
    id,
    status,
    current,
    phase = status === 'working' ? (id === 'researcher' ? 'researching' : 'writing') : 'idle',
  ) {
    this.agents[id] = { status, current, phase, since: new Date().toISOString() };
  }
  async runScan() {
    if (this.busy) throw new Error('An assignment is already running.');
    this.busy = true;
    this.stopRequested = false;
    const settings = this.store.settings();
    this.store.saveSettings({ lastScan: new Date().toISOString() });
    const task = this.store.startTask('researcher', 'Research the latest AI announcements');
    this.store.event('researcher', 'Started a news round. Checking approved publishers.');
    this.store.scene('research', { title: 'A new AI news assignment' });
    let count = 0,
      reachable = 0,
      managerTask;
    this.setAgent('researcher', 'working', 'Reading trusted publisher feeds');
    try {
      const candidates = [];
      for (const source of SOURCES.filter((s) => settings.enabledSources.includes(s.id))) {
        if (this.stopRequested) break;
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
      }
      if (!reachable && !this.stopRequested)
        throw new Error('No publisher feeds could be reached. Check your connection or Sources.');
      const unique = [...new Map(candidates.map((c) => [c.url, c])).values()]
        .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
        .filter((a) => !this.store.hasUrl(a.url));
      for (const article of unique.slice(0, settings.batchSize * 4)) {
        if (count >= settings.batchSize || this.stopRequested) break;
        this.setAgent('researcher', 'working', `Reading: ${article.title}`);
        try {
          const source = SOURCES.find((s) => s.id === article.sourceId);
          const page = await this.fetchText(article.url, source);
          if (this.store.hasUrl(page.url)) continue;
          const content = extractArticle(page.text);
          const full = { ...article, url: page.url, ...content };
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
            publishedAt: article.publishedAt,
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
          if (
            this.store.settings().autoPublish &&
            refined.editorial.status === 'ready' &&
            !this.stopRequested
          )
            await this.deliver(draft.id, true);
          this.setAgent('manager', 'idle', 'Handoff checked; drafts are on the boss’s desk');
        } catch (e) {
          this.store.event('researcher', `Skipped “${article.title}”: ${e.message}`, 'warning');
        }
      }
      const detail = this.stopRequested
        ? `Stopped at a safe checkpoint. ${count} draft(s) saved.`
        : `${count} new draft(s) prepared from ${reachable} reachable feed(s).${!count ? ' No new eligible articles in this time window.' : ''}`;
      this.store.finishTask(task, this.stopRequested ? 'cancelled' : 'completed', detail);
      if (managerTask)
        this.store.finishTask(
          managerTask,
          this.stopRequested ? 'cancelled' : 'completed',
          `Checked ${count} handoff(s). See each draft for delivery outcomes.`,
        );
      this.store.event('researcher', detail, 'success');
    } catch (e) {
      this.store.finishTask(task, 'failed', e.message);
      if (managerTask) this.store.finishTask(managerTask, 'failed', e.message);
      this.store.event('researcher', e.message, 'error');
    } finally {
      this.setAgent('researcher', 'idle', 'Ready for your next assignment');
      this.setAgent('manager', 'idle', 'Review complete. Waiting for the next handoff');
      this.busy = false;
    }
  }
  async deliver(id, automatic = false) {
    let draft = this.store.draft(id);
    if (!draft || ['rejected', 'published'].includes(draft.status))
      throw new Error('This draft is not available for publishing.');
    const source = SOURCES.find((s) => s.id === draft.sourceId);
    if (!source) throw new Error('This publisher is not approved.');
    trustedUrl(draft.url, source);
    if (!automatic && !draft.approvedAt) throw new Error('Approve this draft before publishing.');
    if (
      automatic &&
      (!this.store.settings().autoPublish ||
        !draft.evidence.quoteMatched ||
        draft.editorial?.status !== 'ready' ||
        JSON.stringify(draft.posts) !== JSON.stringify(draft.canonicalPosts))
    )
      throw new Error(
        'Automatic publishing requires unchanged, source-backed posts that passed editorial review.',
      );
    const age = Date.now() - Date.parse(draft.publishedAt);
    if (age > this.store.settings().lookbackHours * 3600000 || age < -300000)
      throw new Error('This announcement is outside your freshness window.');
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
    if (this.busy) throw new Error('Wait for the current assignment to finish.');
    const draft = this.store.draft(id);
    if (
      !draft ||
      ['published', 'rejected'].includes(draft.status) ||
      draft.deliveries.some((d) => ['published', 'uncertain', 'sending'].includes(d.status))
    )
      throw new Error('This draft cannot be rewritten after delivery or rejection.');
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
      const page = await this.fetchText(draft.url, source);
      const full = { ...draft, ...extractArticle(page.text), url: page.url };
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
  stop() {
    this.stopRequested = true;
    this.store.event('boss', 'Asked the team to stop after the current operation.');
  }
  tick() {
    const s = this.store.settings();
    if (
      s.scheduleHours > 0 &&
      !this.busy &&
      (!s.lastScan || Date.now() - Date.parse(s.lastScan) >= s.scheduleHours * 3600000)
    )
      void this.runScan();
  }
}
