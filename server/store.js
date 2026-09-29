import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SOURCES } from './sources.js';

export const defaults = {
  officeName: 'My little empire',
  model: 'qwen3:4b',
  useModel: true,
  autoPublish: false,
  scheduleHours: 0,
  lookbackHours: 72,
  batchSize: 3,
  platforms: ['linkedin', 'x'],
  enabledSources: SOURCES.map((source) => source.id),
  lastScan: null,
};
export function createStore(dir = process.env.BUTLER_DATA_DIR || resolve('data')) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(dir, 'butler.sqlite'));
  try {
    chmodSync(join(dir, 'butler.sqlite'), 0o600);
  } catch {}
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS worker_config (id TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, agent TEXT, title TEXT, status TEXT, started_at TEXT, finished_at TEXT, duration_ms INTEGER, detail TEXT);
    CREATE TABLE IF NOT EXISTS drafts (id TEXT PRIMARY KEY, source_url TEXT UNIQUE, status TEXT, created_at TEXT, updated_at TEXT, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, time TEXT, agent TEXT, message TEXT, kind TEXT);
    CREATE TABLE IF NOT EXISTS scenes (id INTEGER PRIMARY KEY AUTOINCREMENT, time TEXT, action TEXT, payload TEXT);
    CREATE TABLE IF NOT EXISTS deliveries (draft_id TEXT, platform TEXT, status TEXT, remote_id TEXT, error TEXT, updated_at TEXT, PRIMARY KEY(draft_id, platform));`);
  const now = () => new Date().toISOString();
  const api = {
    db,
    dir,
    settings: () => ({
      ...defaults,
      ...JSON.parse(db.prepare('SELECT value FROM settings WHERE id=1').get()?.value || '{}'),
      autoPublish: false,
    }),
    workerConfig(worker) {
      return {
        deployment: worker.defaultDeployment,
        skillIds: worker.skillIds,
        ...JSON.parse(
          db.prepare('SELECT body FROM worker_config WHERE id=?').get(worker.id)?.body || '{}',
        ),
      };
    },
    saveWorker(worker, patch) {
      const value = { ...api.workerConfig(worker), ...patch };
      db.prepare('INSERT OR REPLACE INTO worker_config VALUES (?,?)').run(
        worker.id,
        JSON.stringify(value),
      );
      return value;
    },
    projects: () =>
      db
        .prepare('SELECT body FROM projects ORDER BY rowid')
        .all()
        .map((r) => JSON.parse(r.body)),
    project: (id) =>
      JSON.parse(db.prepare('SELECT body FROM projects WHERE id=?').get(id)?.body || 'null'),
    saveProject(body, id = randomUUID()) {
      const value = { ...body, id, updatedAt: now() };
      db.prepare('INSERT OR REPLACE INTO projects VALUES (?,?)').run(id, JSON.stringify(value));
      return value;
    },
    deleteProject(id) {
      db.prepare('DELETE FROM projects WHERE id=?').run(id);
    },
    saveSettings(patch) {
      const value = { ...api.settings(), ...patch };
      db.prepare('INSERT OR REPLACE INTO settings VALUES (1, ?)').run(JSON.stringify(value));
      return value;
    },
    event(agent, message, kind = 'info') {
      db.prepare('INSERT INTO events(time,agent,message,kind) VALUES(?,?,?,?)').run(
        now(),
        agent,
        message,
        kind,
      );
    },
    startTask(agent, title) {
      const id = randomUUID();
      db.prepare('INSERT INTO tasks VALUES(?,?,?,?,?,?,?,?)').run(
        id,
        agent,
        title,
        'running',
        now(),
        null,
        null,
        '',
      );
      return id;
    },
    finishTask(id, status, detail = '') {
      const task = db.prepare('SELECT * FROM tasks WHERE id=?').get(id);
      if (!task) return;
      const end = now();
      db.prepare('UPDATE tasks SET status=?,finished_at=?,duration_ms=?,detail=? WHERE id=?').run(
        status,
        end,
        Date.parse(end) - Date.parse(task.started_at),
        detail,
        id,
      );
    },
    tasks: () => db.prepare('SELECT * FROM tasks ORDER BY started_at DESC LIMIT 500').all(),
    events: () => db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT 150').all(),
    scene(action, payload = {}) {
      db.prepare('INSERT INTO scenes(time,action,payload) VALUES(?,?,?)').run(
        now(),
        action,
        JSON.stringify(payload),
      );
    },
    scenes: () =>
      db
        .prepare('SELECT * FROM scenes ORDER BY id DESC LIMIT 100')
        .all()
        .reverse()
        .map((r) => ({ ...r, ...JSON.parse(r.payload), payload: undefined })),
    hasUrl: (url) => Boolean(db.prepare('SELECT id FROM drafts WHERE source_url=?').get(url)),
    addDraft(body) {
      const id = randomUUID(),
        at = now();
      db.prepare('INSERT INTO drafts VALUES(?,?,?,?,?,?)').run(
        id,
        body.url,
        'review',
        at,
        at,
        JSON.stringify(body),
      );
      return api.draft(id);
    },
    draft(id) {
      const row = db.prepare('SELECT * FROM drafts WHERE id=?').get(id);
      return row
        ? {
            ...JSON.parse(row.body),
            id: row.id,
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            deliveries: api.deliveries(row.id),
          }
        : null;
    },
    drafts: () =>
      db
        .prepare('SELECT id FROM drafts ORDER BY created_at DESC LIMIT 500')
        .all()
        .map((r) => api.draft(r.id)),
    updateDraft(id, patch, status) {
      const draft = api.draft(id);
      if (!draft) throw new Error('Draft not found.');
      const { id: _, status: __, createdAt, updatedAt, deliveries, ...body } = draft;
      db.prepare('UPDATE drafts SET body=?,status=?,updated_at=? WHERE id=?').run(
        JSON.stringify({ ...body, ...patch }),
        status || draft.status,
        now(),
        id,
      );
      return api.draft(id);
    },
    deliveries: (id) => db.prepare('SELECT * FROM deliveries WHERE draft_id=?').all(id),
    delivery(id, platform, status, remoteId = null, error = null) {
      db.prepare('INSERT OR REPLACE INTO deliveries VALUES(?,?,?,?,?,?)').run(
        id,
        platform,
        status,
        remoteId,
        error,
        now(),
      );
    },
    recover() {
      for (const task of db.prepare("SELECT id FROM tasks WHERE status='running'").all())
        api.finishTask(task.id, 'interrupted', 'The office stopped before this task finished.');
      db.prepare(
        "UPDATE deliveries SET status='uncertain',error='Office stopped during publishing. Check the social account before resolving this delivery.' WHERE status='sending'",
      ).run();
      db.prepare("UPDATE drafts SET status='attention' WHERE status='publishing'").run();
    },
    close: () => db.close(),
  };
  return api;
}
