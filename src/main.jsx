import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Armchair,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  Coffee,
  Copy,
  Cpu,
  ExternalLink,
  FileCheck2,
  FileText,
  Globe2,
  History,
  LayoutGrid,
  Leaf,
  LoaderCircle,
  Monitor,
  Pause,
  Plus,
  Radio,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Sprout,
  Users,
  X as Close,
} from 'lucide-react';
import twitterText from 'twitter-text';
import './styles.css';
import OfficeGame from './OfficeGame.jsx';

const names = { researcher: 'Scout', manager: 'Quinn', boss: 'You' };
const nav = [
  { id: 'office', label: 'My office', Icon: LayoutGrid },
  { id: 'drafts', label: 'Drafts & publishing', Icon: FileText },
  { id: 'activity', label: 'Activity log', Icon: History },
  { id: 'sources', label: 'Trusted sources', Icon: Globe2 },
  { id: 'settings', label: 'Office settings', Icon: Settings2 },
];
const formatDate = (value) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';
const duration = (ms) =>
  ms == null
    ? 'In progress'
    : ms < 1000
      ? '<1s'
      : ms < 60000
        ? `${Math.round(ms / 1000)}s`
        : `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
const badgeName = {
  review: 'Needs your review',
  approved: 'Approved',
  published: 'Published',
  rejected: 'Rejected',
  attention: 'Needs attention',
  publishing: 'Publishing',
  completed: 'Completed',
  running: 'In progress',
  failed: 'Failed',
  interrupted: 'Interrupted',
  cancelled: 'Stopped',
  uncertain: 'Check account',
};
async function api(path, method = 'GET', body) {
  const r = await fetch('/api' + path, {
    method,
    headers:
      method === 'GET' ? {} : { 'Content-Type': 'application/json', 'X-Butler-Client': 'office' },
    ...(method !== 'GET' ? { body: JSON.stringify(body || {}) } : {}),
  });
  const result = await r.json();
  if (!r.ok) throw new Error(result.error || 'The office could not complete that action.');
  return result;
}
function Badge({ status, children }) {
  return (
    <span className={`badge ${status || ''}`}>
      <i />
      {children || badgeName[status] || status}
    </span>
  );
}
function Avatar({ who, small = false }) {
  return (
    <div className={`avatar ${who} ${small ? 'small' : ''}`}>
      <span className="hair" />
      <span className="face">
        <i />
        <i />
        <b />
      </span>
      <span className="shirt" />
    </div>
  );
}
function Empty({ Icon = FileText, title, text, children }) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon size={26} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {children}
    </div>
  );
}
function Toggle({ value, onChange, label, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label={label}
      disabled={disabled}
      className={`toggle ${value ? 'on' : ''}`}
      onClick={() => onChange(!value)}
    >
      <span />
    </button>
  );
}
function XIcon() {
  return <span className="x-icon">𝕏</span>;
}
function Linkedin({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.4 2H3.6C2.7 2 2 2.7 2 3.6v16.8c0 .9.7 1.6 1.6 1.6h16.8c.9 0 1.6-.7 1.6-1.6V3.6c0-.9-.7-1.6-1.6-1.6ZM8 19H5V9h3v10ZM6.5 7.7a1.8 1.8 0 1 1 0-3.6 1.8 1.8 0 0 1 0 3.6ZM19 19h-3v-5.3c0-1.3-.5-2-1.5-2s-1.5.7-1.5 2V19h-3V9h3v1.3c.6-1 1.5-1.5 2.8-1.5 2.1 0 3.2 1.4 3.2 4.1V19Z" />
    </svg>
  );
}

function App() {
  const [page, setPage] = useState('office'),
    [state, setState] = useState(null),
    [model, setModel] = useState(null),
    [error, setError] = useState(''),
    [toast, setToast] = useState(''),
    [pending, setPending] = useState(false),
    [selectedId, setSelectedId] = useState(null);
  const toastTimer = useRef();
  async function refresh() {
    try {
      const data = await api('/state');
      setState(data);
      setError('');
    } catch {
      setError('The office is offline. Start Butler to reconnect.');
    }
  }
  async function refreshModel() {
    try {
      setModel(await api('/model'));
    } catch {
      setModel(null);
    }
  }
  useEffect(() => {
    refresh();
    refreshModel();
    const a = setInterval(refresh, 3000),
      b = setInterval(refreshModel, 12000);
    return () => {
      clearInterval(a);
      clearInterval(b);
      clearTimeout(toastTimer.current);
    };
  }, []);
  async function action(path, method = 'POST', body, message = 'Done') {
    setPending(true);
    try {
      await api(path, method, body);
      await refresh();
      setToast(message);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(''), 5000);
      return true;
    } catch (e) {
      setToast(e.message);
      return false;
    } finally {
      setPending(false);
    }
  }
  function openDraft(id) {
    setSelectedId(id);
    setPage('drafts');
  }
  const drafts = state?.drafts || [],
    review = drafts.filter((d) => ['review', 'attention', 'approved'].includes(d.status));
  const busy = state?.busy || pending;
  const navigate = (id) => {
    setPage(id);
    if (id === 'drafts') setSelectedId(null);
  };
  return (
    <>
      <OfficeGame
        state={state}
        model={model}
        busy={busy}
        error={error}
        action={action}
        navigate={navigate}
        openDraft={openDraft}
        panel={page === 'office' ? null : page}
        closePanel={() => setPage('office')}
      >
        {state && page === 'drafts' && (
          <DraftsPage
            state={state}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            action={action}
            busy={busy}
            returnToOffice={() => setPage('office')}
          />
        )}
        {state && page === 'activity' && <ActivityPage state={state} />}
        {state && page === 'sources' && <SourcesPage state={state} action={action} busy={busy} />}
        {state && page === 'settings' && (
          <SettingsPage
            state={state}
            model={model}
            action={action}
            refreshModel={refreshModel}
            busy={busy}
          />
        )}
      </OfficeGame>
      {toast && (
        <div className="toast" role="status">
          <span>{toast}</span>
          <button aria-label="Dismiss notification" onClick={() => setToast('')}>
            <Close size={16} />
          </button>
        </div>
      )}
    </>
  );
}

function PageHeader({ eyebrow, title, subtitle, children }) {
  return (
    <div className="page-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="header-actions">{children}</div>
    </div>
  );
}
function DraftsPage({ state, selectedId, setSelectedId, action, busy, returnToOffice }) {
  const [filter, setFilter] = useState('open');
  const filtered = state.drafts.filter(
    (d) =>
      filter === 'all' ||
      (filter === 'open' && !['published', 'rejected'].includes(d.status)) ||
      d.status === filter,
  );
  const selected = state.drafts.find((d) => d.id === selectedId);
  return (
    <>
      <PageHeader
        eyebrow="THE EDITORIAL DESK"
        title="Good stories, ready for your voice."
        subtitle="Review the evidence, make it yours, and give Quinn the go-ahead."
      />
      {selected ? (
        <DraftEditor
          key={selected.id}
          draft={selected}
          action={action}
          busy={busy}
          onBack={() => setSelectedId(null)}
          returnToOffice={returnToOffice}
        />
      ) : (
        <>
          <div className="tabs">
            {[
              ['open', 'On your desk'],
              ['published', 'Published'],
              ['rejected', 'Rejected'],
              ['all', 'All drafts'],
            ].map(([id, label]) => (
              <button
                className={filter === id ? 'active' : ''}
                onClick={() => setFilter(id)}
                key={id}
              >
                {label}
                <span>
                  {
                    state.drafts.filter(
                      (d) =>
                        id === 'all' ||
                        (id === 'open' && !['published', 'rejected'].includes(d.status)) ||
                        d.status === id,
                    ).length
                  }
                </span>
              </button>
            ))}
          </div>
          {!filtered.length ? (
            <div className="panel">
              <Empty
                title="Your next story starts here."
                text="Run a news round from My office. Your researcher will send new drafts here with their original sources."
              />
            </div>
          ) : (
            <div className="draft-grid">
              {filtered.map((d) => (
                <button className="panel draft-card" key={d.id} onClick={() => setSelectedId(d.id)}>
                  <div className="draft-card-top">
                    <Badge status={d.status} />
                    <span>{formatDate(d.createdAt)}</span>
                  </div>
                  <h2>{d.title}</h2>
                  <p>{d.summary}</p>
                  <div className="source-pill">
                    <ShieldCheck size={14} />
                    {d.sourceName} · Source checked
                  </div>
                  <div className="draft-card-footer">
                    <span>
                      {d.platforms.includes('linkedin') && <Linkedin size={16} />}{' '}
                      {d.platforms.includes('x') && <XIcon />}
                    </span>
                    <span>
                      Open draft <ArrowRight size={15} />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </>
  );
}
function DraftEditor({ draft, action, busy, onBack, returnToOffice }) {
  const [posts, setPosts] = useState(draft.posts),
    [platforms, setPlatforms] = useState(draft.platforms),
    [tab, setTab] = useState('linkedin'),
    [notes, setNotes] = useState(draft.writingNotes || '');
  useEffect(() => {
    setPosts(draft.posts);
    setPlatforms(draft.platforms);
  }, [draft.updatedAt]);
  async function approveAndPublish() {
    if (
      await action(
        `/drafts/${draft.id}/approve`,
        'POST',
        {},
        'Approved. Handing the file back to Quinn.',
      )
    ) {
      if (
        await action(
          `/drafts/${draft.id}/publish`,
          'POST',
          {},
          'Quinn is taking your approved draft to the publishing desk.',
        )
      )
        returnToOffice?.();
    }
  }
  const dirty =
    JSON.stringify(posts) !== JSON.stringify(draft.posts) ||
    JSON.stringify(platforms) !== JSON.stringify(draft.platforms);
  const locked =
    ['published', 'rejected'].includes(draft.status) ||
    draft.deliveries.some((d) => ['published', 'uncertain', 'sending'].includes(d.status));
  const count =
    tab === 'x' ? twitterText.parseTweet(posts.x).weightedLength : [...posts.linkedin].length;
  return (
    <>
      <button className="text-button back-button" onClick={onBack}>
        ← Back to drafts
      </button>
      <div className="editor-grid">
        <section className="panel editor">
          <div className="panel-heading">
            <Badge status={draft.status} />
            <span className="muted">Prepared by Scout & Quinn</span>
          </div>
          <h2>{draft.title}</h2>
          <div className={`editorial-state ${draft.editorial?.status || 'needs-writing'}`}>
            <Sparkles size={14} />
            {draft.editorial?.status === 'ready'
              ? 'Written for each platform · Source review complete'
              : draft.editorial?.status === 'edited'
                ? 'Edited draft · Review before approval'
                : draft.editorial?.status === 'needs-review'
                  ? 'Editor flagged details · Check the notes before approval'
                  : 'Basic first draft · Ask Quinn for a refined version'}
          </div>
          {draft.keyPoints?.length > 0 && (
            <div className="editorial-brief">
              <h3>Scout’s brief</h3>
              <p>{draft.summary}</p>
              <ul>
                {draft.keyPoints.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
              {draft.caveat && (
                <p>
                  <strong>Keep in mind:</strong> {draft.caveat}
                </p>
              )}
            </div>
          )}
          <div className="editor-tabs">
            <button
              className={tab === 'linkedin' ? 'active' : ''}
              onClick={() => setTab('linkedin')}
            >
              <Linkedin size={16} />
              LinkedIn
            </button>
            <button className={tab === 'x' ? 'active' : ''} onClick={() => setTab('x')}>
              <XIcon />X / Twitter
            </button>
          </div>
          <div className="post-author">
            <span className="boss-initial">Y</span>
            <span>
              <strong>Your connected account</strong>
              <small>Post preview · Public</small>
            </span>
          </div>
          <textarea
            aria-label={`${tab === 'x' ? 'X' : 'LinkedIn'} draft`}
            className="post-text"
            value={posts[tab]}
            disabled={locked || busy}
            onChange={(e) => setPosts({ ...posts, [tab]: e.target.value })}
          />
          <div className="post-meta">
            <button
              className="text-button"
              onClick={() => navigator.clipboard.writeText(posts[tab]).catch(() => {})}
            >
              <Copy size={13} />
              Copy text
            </button>
            <span className={count > (tab === 'x' ? 280 : 3000) ? 'error-text' : ''}>
              {count} / {tab === 'x' ? '280 weighted' : '3,000'} characters
            </span>
          </div>
          <div className="platform-selector">
            <strong>Publish to</strong>
            {['linkedin', 'x'].map((p) => (
              <label key={p}>
                <input
                  type="checkbox"
                  disabled={locked || busy}
                  checked={platforms.includes(p)}
                  onChange={(e) =>
                    setPlatforms(
                      e.target.checked ? [...platforms, p] : platforms.filter((a) => a !== p),
                    )
                  }
                />
                {p === 'x' ? 'X / Twitter' : 'LinkedIn'}
              </label>
            ))}
          </div>
          <div className="editor-actions">
            {!locked && (
              <>
                <button
                  className="button secondary"
                  disabled={busy || !dirty || !platforms.length}
                  onClick={() =>
                    action(
                      `/drafts/${draft.id}`,
                      'PATCH',
                      { posts, platforms },
                      'Changes saved. Review and approve the updated draft.',
                    )
                  }
                >
                  Save changes
                </button>
                <button
                  className="button subtle danger"
                  disabled={busy || dirty}
                  onClick={() =>
                    action(`/drafts/${draft.id}/reject`, 'POST', {}, 'Draft rejected.')
                  }
                >
                  Reject
                </button>
              </>
            )}
            {!['published', 'rejected'].includes(draft.status) &&
              (draft.approvedAt ? (
                <button
                  className="button primary"
                  disabled={busy || dirty || draft.deliveries.some((d) => d.status === 'uncertain')}
                  onClick={() =>
                    action(
                      `/drafts/${draft.id}/publish`,
                      'POST',
                      {},
                      'Quinn is publishing the remaining posts.',
                    )
                  }
                >
                  <Send size={15} />
                  Publish now
                </button>
              ) : (
                <button
                  className="button primary"
                  disabled={busy || dirty}
                  onClick={approveAndPublish}
                >
                  <Check size={15} />
                  Approve & publish
                </button>
              ))}
          </div>
          {!locked && (
            <p className="form-hint">
              Approval sends this draft to Quinn for publishing to the selected connected accounts.
            </p>
          )}
          {dirty && (
            <p className="form-hint">
              Save your edits before approving. Edits reset previous approval.
            </p>
          )}
        </section>
        <aside className="evidence-column">
          <section className="panel evidence-panel">
            <span className="eyebrow">FOLLOW THE FACTS</span>
            <h2>
              <ShieldCheck size={20} />
              The source file
            </h2>
            <a className="original-source" href={draft.url} target="_blank" rel="noreferrer">
              <span>
                <strong>{draft.sourceName}</strong>
                <small>{draft.evidence.domain}</small>
              </span>
              <ExternalLink size={16} />
            </a>
            <dl>
              <div>
                <dt>Announced</dt>
                <dd>{formatDate(draft.publishedAt)}</dd>
              </div>
              <div>
                <dt>Source checked</dt>
                <dd>{formatDate(draft.checkedAt)}</dd>
              </div>
              <div>
                <dt>Brief written with</dt>
                <dd>
                  {draft.method === 'editor-refined'
                    ? 'Editorially refined'
                    : draft.method === 'local-model'
                      ? 'Local LLM'
                      : 'Source excerpts'}
                </dd>
              </div>
            </dl>
            <div className="evidence-check">
              <Check size={15} />
              {draft.evidence.primarySource
                ? 'Approved publisher and article path'
                : 'Publisher policy no longer satisfied'}
            </div>
            <div className="evidence-check">
              <Check size={15} />
              Excerpt matched to article
            </div>
            <h4>Supporting excerpt</h4>
            <blockquote>“{draft.quote}”</blockquote>
            <p className="evidence-limit">
              {draft.reviewNote && (
                <>
                  <strong>{draft.reviewNote}</strong>
                  <br />
                </>
              )}
              This confirms what the publisher said, not independent truth. AI authorship is
              unknown. Check the original before approving.
            </p>
            <details>
              <summary>Researcher’s internal brief</summary>
              <p>{draft.summary}</p>
              {draft.method === 'local-model' && (
                <p className="form-hint">
                  AI-written summary; not independently verified or included in automatic posts.
                </p>
              )}
            </details>
            {!locked && (
              <div className="rewrite-box">
                <label htmlFor="writing-notes">Give Quinn editorial direction</label>
                <textarea
                  id="writing-notes"
                  value={notes}
                  maxLength={600}
                  disabled={busy}
                  placeholder="e.g. Focus on what developers can actually use. More concrete detail, less hype."
                  onChange={(e) => setNotes(e.target.value)}
                />
                <button
                  className="button secondary"
                  disabled={busy || dirty}
                  onClick={async () => {
                    if (
                      await action(
                        `/drafts/${draft.id}/refine`,
                        'POST',
                        { notes },
                        'Quinn is rewriting and checking the draft. Watch the social studio.',
                      )
                    )
                      returnToOffice?.();
                  }}
                >
                  <Sparkles size={15} />
                  Ask Quinn to rewrite
                </button>
                {draft.lastRewriteError && (
                  <p className="form-hint">Last rewrite: {draft.lastRewriteError}</p>
                )}
                {draft.editorial?.issues?.map((issue, i) => (
                  <p className="form-hint" key={i}>
                    {issue}
                  </p>
                ))}
              </div>
            )}
          </section>
          {draft.deliveries.length > 0 && (
            <section className="panel delivery-panel">
              <h3>Publishing receipts</h3>
              {draft.deliveries.map((d) => (
                <div className="receipt" key={d.platform}>
                  <strong>{d.platform === 'x' ? 'X / Twitter' : 'LinkedIn'}</strong>
                  <Badge status={d.status} />
                  {d.remote_id && (
                    <a
                      href={
                        d.platform === 'x'
                          ? `https://x.com/i/web/status/${encodeURIComponent(d.remote_id)}`
                          : `https://www.linkedin.com/feed/update/${encodeURIComponent(d.remote_id)}/`
                      }
                      target="_blank"
                      rel="noreferrer"
                    >
                      View post <ExternalLink size={12} />
                    </a>
                  )}
                  <small>{formatDate(d.updated_at)}</small>
                  {d.error && <p>{d.error}</p>}
                  {d.status === 'uncertain' && (
                    <ResolveDelivery delivery={d} draftId={draft.id} action={action} busy={busy} />
                  )}
                </div>
              ))}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
function ResolveDelivery({ delivery, draftId, action, busy }) {
  const [id, setId] = useState('');
  return (
    <div className="resolve">
      <p>Check your account first. Then record what happened.</p>
      <input
        aria-label="Published post ID"
        placeholder="Published post ID"
        value={id}
        onChange={(e) => setId(e.target.value)}
      />
      <button
        className="button secondary"
        disabled={busy || !id.trim()}
        onClick={() =>
          action(
            `/drafts/${draftId}/resolve`,
            'POST',
            { platform: delivery.platform, outcome: 'published', remoteId: id },
            'Delivery recorded.',
          )
        }
      >
        I found the post
      </button>
      <button
        className="text-button"
        disabled={busy}
        onClick={() =>
          action(
            `/drafts/${draftId}/resolve`,
            'POST',
            { platform: delivery.platform, outcome: 'not-published' },
            'Marked as not published. You can now retry.',
          )
        }
      >
        I checked — it was not published
      </button>
    </div>
  );
}
function EventList({ events }) {
  return (
    <div className="event-list">
      {events.map((e) => (
        <div className={`event ${e.kind}`} key={e.id}>
          <span className="event-marker">
            {e.kind === 'success' ? (
              <Check size={13} />
            ) : e.agent === 'boss' ? (
              <Users size={13} />
            ) : (
              <Radio size={13} />
            )}
          </span>
          <div>
            <p>
              <strong>{names[e.agent] || e.agent}</strong> {e.message}
            </p>
            <time>{formatDate(e.time)}</time>
          </div>
        </div>
      ))}
    </div>
  );
}
function ActivityPage({ state }) {
  const [filter, setFilter] = useState('all');
  const tasks = state.tasks.filter((t) => filter === 'all' || t.agent === filter);
  return (
    <>
      <PageHeader
        eyebrow="THE PAPER TRAIL"
        title="Every handoff. Every little win."
        subtitle="See who did what, when they did it, and how long it took."
      />
      <div className="tabs">
        {[
          ['all', 'Everyone'],
          ['researcher', 'Scout'],
          ['manager', 'Quinn'],
        ].map(([id, name]) => (
          <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>
            {name}
          </button>
        ))}
      </div>
      <section className="panel task-panel">
        <div className="panel-heading">
          <h2>Assignment history</h2>
          <span className="muted">Times shown in your local timezone</span>
        </div>
        {tasks.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>ASSIGNMENT</th>
                  <th>EMPLOYEE</th>
                  <th>STATUS</th>
                  <th>STARTED</th>
                  <th>FINISHED</th>
                  <th>TIME TAKEN</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <strong>{t.title}</strong>
                      <small>{t.detail}</small>
                    </td>
                    <td>{names[t.agent]}</td>
                    <td>
                      <Badge status={t.status} />
                    </td>
                    <td>{formatDate(t.started_at)}</td>
                    <td>{formatDate(t.finished_at)}</td>
                    <td>
                      <span className="duration">
                        <Clock3 size={13} />
                        {duration(t.duration_ms ?? Date.now() - Date.parse(t.started_at))}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            Icon={History}
            title="The story is just beginning."
            text="Completed, interrupted, and active assignments will appear here."
          />
        )}
      </section>
      <section className="panel timeline-panel">
        <div className="panel-heading">
          <h2>Office timeline</h2>
          <span className="muted">Most recent first</span>
        </div>
        {state.events.length ? (
          <EventList events={state.events} />
        ) : (
          <Empty
            Icon={Coffee}
            title="All quiet on the office floor."
            text="Start your first news round to get things moving."
          />
        )}
      </section>
    </>
  );
}
function SourcesPage({ state, action, busy }) {
  const enabled = state.settings.enabledSources;
  return (
    <>
      <PageHeader
        eyebrow="LESS NOISE. MORE SIGNAL."
        title="Go straight to the source."
        subtitle="Your researcher starts with official publishers, not anonymous reposts."
      />
      <div className="source-explainer">
        <ShieldCheck size={26} />
        <div>
          <h3>Source-backed, with a paper trail.</h3>
          <p>
            Butler checks publisher domains and dates, reads the original article, and keeps a
            matching excerpt. These are first-party claims, not independent fact checks. No
            AI-authorship detector can reliably certify an article.
          </p>
        </div>
      </div>
      <div className="sources-grid">
        {state.sources.map((s) => (
          <section className="panel source-card" key={s.id}>
            <div className="source-card-top">
              <span className="publisher-logo" style={{ background: s.color }}>
                {s.name === 'Hugging Face'
                  ? '🤗'
                  : s.name
                      .split(' ')
                      .map((w) => w[0])
                      .join('')}
              </span>
              <Toggle
                label={`Enable ${s.name}`}
                value={enabled.includes(s.id)}
                disabled={busy || (enabled.length === 1 && enabled.includes(s.id))}
                onChange={(v) =>
                  action(
                    '/settings',
                    'PATCH',
                    {
                      enabledSources: v ? [...enabled, s.id] : enabled.filter((id) => id !== s.id),
                    },
                    'Source preferences saved.',
                  )
                }
              />
            </div>
            <h2>{s.name}</h2>
            <p>{s.category}</p>
            <span className="source-type">
              <ShieldCheck size={13} />
              Primary publisher
            </span>
            <div className="source-health">
              {s.health ? (
                <>
                  <Badge status={s.health.ok ? 'completed' : 'attention'}>
                    {s.health.ok ? 'Feed reached' : 'Feed unavailable'}
                  </Badge>
                  <small>
                    {s.health.ok ? `${s.health.count} recent articles` : s.health.error}
                  </small>
                  <small>Checked {formatDate(s.health.checkedAt)}</small>
                </>
              ) : (
                <span>Not checked yet · Run a news round</span>
              )}
            </div>
            <a href={s.url} target="_blank" rel="noreferrer">
              View publisher feed <ArrowUpRight size={14} />
            </a>
          </section>
        ))}
      </div>
      <div className="panel source-policy">
        <h2>What makes it onto your desk?</h2>
        <div>
          {[
            [
              '01',
              'A known publisher',
              'Only approved HTTPS domains are fetched. Redirects to other domains are rejected.',
            ],
            [
              '02',
              'A recent announcement',
              `Stories must be dated within ${state.settings.lookbackHours} hours. Undated stories and duplicates are skipped.`,
            ],
            [
              '03',
              'Something you can trace',
              'Each draft keeps a matching source excerpt for review. Every post links back to the original article.',
            ],
          ].map(([n, title, text]) => (
            <section key={n}>
              <span>{n}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </section>
          ))}
        </div>
      </div>
    </>
  );
}
function SettingsPage({ state, model, action, refreshModel, busy }) {
  const [form, setForm] = useState(state.settings),
    [credentials, setCredentials] = useState({
      linkedinToken: '',
      xToken: '',
      linkedinAuthor: state.connections.linkedinAuthor,
      linkedinVersion: state.connections.linkedinVersion,
    });
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  async function save(e) {
    e.preventDefault();
    const { lastScan, ...body } = form;
    await action('/settings', 'PATCH', body, 'Your office preferences are saved.');
    refreshModel();
  }
  async function connect(e) {
    e.preventDefault();
    const body = {
      linkedinAuthor: credentials.linkedinAuthor,
      linkedinVersion: credentials.linkedinVersion,
    };
    if (credentials.linkedinToken) body.linkedinToken = credentials.linkedinToken.trim();
    if (credentials.xToken) body.xToken = credentials.xToken.trim();
    if (
      await action(
        '/connections',
        'PUT',
        body,
        'Credentials saved locally. Access is checked when publishing.',
      )
    )
      setCredentials({ ...credentials, linkedinToken: '', xToken: '' });
  }
  return (
    <>
      <PageHeader
        eyebrow="MAKE YOURSELF AT HOME"
        title="Your office. Your rules."
        subtitle="Choose how your team works, how it thinks, and where it shares."
      />
      <div className="settings-grid">
        <form className="settings-main" onSubmit={save}>
          <section className="panel settings-section">
            <h2>
              <Armchair size={20} /> The office essentials
            </h2>
            <label className="field">
              Office name
              <input
                maxLength={60}
                required
                value={form.officeName}
                onChange={(e) => set('officeName', e.target.value)}
              />
            </label>
            <div className="field-row">
              <label className="field">
                News round frequency
                <select
                  value={form.scheduleHours}
                  onChange={(e) => set('scheduleHours', Number(e.target.value))}
                >
                  {[
                    [0, 'Only when I ask'],
                    [1, 'Every hour'],
                    [3, 'Every 3 hours'],
                    [6, 'Every 6 hours'],
                    [12, 'Every 12 hours'],
                    [24, 'Every day'],
                  ].map(([v, t]) => (
                    <option key={v} value={v}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Drafts per round
                <select
                  value={form.batchSize}
                  onChange={(e) => set('batchSize', Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </label>
            </div>
            <label className="field">
              News freshness
              <select
                value={form.lookbackHours}
                onChange={(e) => set('lookbackHours', Number(e.target.value))}
              >
                {[6, 12, 24, 48, 72, 168].map((n) => (
                  <option key={n} value={n}>
                    Last {n === 168 ? '7 days' : `${n} hours`}
                  </option>
                ))}
              </select>
            </label>
            <p className="form-hint">
              Scheduled rounds run while Butler is open and your computer is awake. Missed rounds
              become one catch-up round.
            </p>
          </section>
          <section className="panel settings-section">
            <h2>
              <Cpu size={20} /> A little brainpower
            </h2>
            <div className="setting-row">
              <div>
                <strong>Use the local language model</strong>
                <p>
                  Writes detailed briefs and platform-specific posts, then checks the claims against
                  the source.
                </p>
              </div>
              <Toggle
                label="Use the local language model"
                value={form.useModel}
                onChange={(v) => set('useModel', v)}
              />
            </div>
            <label className="field">
              Local model
              <select value={form.model} onChange={(e) => set('model', e.target.value)}>
                <option value="qwen3:1.7b">Qwen3 1.7B · Faster, lighter drafts</option>
                <option value="qwen3:4b">
                  Qwen3 4B · Better writing · about 3 GB while active
                </option>
              </select>
            </label>
            <div className="memory-note">
              <Leaf size={18} />
              <p>
                One model request at a time. A 4,096-token context. Model weights unload after each
                writing or review pass; Ollama’s small background service may stay open.
              </p>
            </div>
            <p className="form-hint">
              If the model is unavailable, Scout uses a clearly labeled extractive brief. No cloud
              LLM is used.
            </p>
          </section>
          <section className="panel settings-section">
            <h2>
              <ShieldCheck size={20} /> The chain of command
            </h2>
            <div className="setting-row">
              <div>
                <strong>Automatic publishing</strong>
                <p>Let Quinn publish new source-backed drafts without waiting for your approval.</p>
              </div>
              <Toggle
                label="Automatic publishing"
                value={form.autoPublish}
                onChange={(v) => set('autoPublish', v)}
              />
            </div>
            {form.autoPublish && (
              <div className="auto-notice">
                New, unchanged drafts that pass the local editor’s source review can be published
                automatically. This is an AI check, not independent fact verification. Failed
                reviews and edited drafts come to your chamber.
              </div>
            )}
            <div className="platform-selector">
              <strong>Default destinations</strong>
              {['linkedin', 'x'].map((p) => (
                <label key={p}>
                  <input
                    type="checkbox"
                    checked={form.platforms.includes(p)}
                    onChange={(e) =>
                      set(
                        'platforms',
                        e.target.checked
                          ? [...form.platforms, p]
                          : form.platforms.filter((a) => a !== p),
                      )
                    }
                  />
                  {p === 'x' ? 'X / Twitter' : 'LinkedIn'}
                </label>
              ))}
            </div>
          </section>
          <button
            className="button primary save-settings"
            disabled={busy || !form.platforms.length}
          >
            <Check size={16} />
            Save office preferences
          </button>
        </form>
        <aside className="settings-aside">
          <section className="panel runtime-panel">
            <div className="runtime-heading">
              <span className="icon-circle">
                <Cpu size={21} />
              </span>
              <Badge status={model?.loaded ? 'working' : model?.online ? 'idle' : 'attention'}>
                {model?.loaded
                  ? 'Model loaded'
                  : model?.online
                    ? 'Model resting'
                    : 'Ollama offline'}
              </Badge>
            </div>
            <h2>Your local engine</h2>
            <p>Install Ollama for Mac or Windows, then download your small model once.</p>
            <a
              className="button secondary full-width"
              href="https://ollama.com/download"
              target="_blank"
              rel="noreferrer"
            >
              Get Ollama <ArrowUpRight size={15} />
            </a>
            <label className="code-label">RUN ONCE IN TERMINAL</label>
            <code>npm run setup:model</code>
            <small>
              Run this from the Butler folder. Qwen3 1.7B is about a 1.4 GB download. For the
              optional 4B model, run ollama pull qwen3:4b in your Ollama installation.
            </small>
            <dl>
              <div>
                <dt>Ollama</dt>
                <dd>{model?.online ? 'Connected locally' : 'Not connected'}</dd>
              </div>
              <div>
                <dt>Selected model</dt>
                <dd>{model?.installed ? 'Installed' : 'Not detected'}</dd>
              </div>
              <div>
                <dt>Model memory</dt>
                <dd>
                  {model
                    ? model.loaded
                      ? 'Loaded'
                      : model.online
                        ? 'Unloaded'
                        : 'Unknown'
                    : 'Checking…'}
                </dd>
              </div>
            </dl>
            {model?.lastError && <p className="error-text">{model.lastError}</p>}
            <div className="runtime-actions">
              <button className="text-button" onClick={refreshModel}>
                <RefreshCw size={13} />
                Check again
              </button>
              <button
                className="text-button"
                disabled={busy || !model?.loaded}
                onClick={async () => {
                  await action('/model/unload', 'POST', {}, 'Model unloaded.');
                  refreshModel();
                }}
              >
                Unload model
              </button>
            </div>
          </section>
          <section className="setup-note">
            <BookOpen size={19} />
            <div>
              <strong>Local doesn’t mean offline.</strong>
              <p>
                Your database, agents, and LLM run here. News fetching and posting need the
                internet. Platform API access is managed by LinkedIn and X.
              </p>
            </div>
          </section>
        </aside>
      </div>
      <form className="panel connections-panel" onSubmit={connect}>
        <div className="panel-heading">
          <div>
            <h2>Connect your audience</h2>
            <p>Bring your own developer app and user access tokens.</p>
          </div>
          <span className="source-type">
            <ShieldCheck size={13} />
            Stored on this computer
          </span>
        </div>
        <div className="connections-grid">
          <section>
            <div className="connection-title">
              <Linkedin size={24} />
              <h3>LinkedIn</h3>
              <Badge status={state.connections.linkedin ? 'completed' : 'idle'}>
                {state.connections.linkedin ? 'Credentials saved' : 'Not connected'}
              </Badge>
            </div>
            <p>Needs posting permission for your member or organization account.</p>
            <label className="field">
              User access token
              <input
                type="password"
                autoComplete="new-password"
                placeholder={
                  state.connections.linkedin
                    ? 'Saved · enter a token to replace'
                    : 'Paste your LinkedIn access token'
                }
                value={credentials.linkedinToken}
                onChange={(e) => setCredentials({ ...credentials, linkedinToken: e.target.value })}
              />
            </label>
            <div className="field-row">
              <label className="field">
                Author URN
                <input
                  placeholder="urn:li:person:your-id"
                  value={credentials.linkedinAuthor}
                  onChange={(e) =>
                    setCredentials({ ...credentials, linkedinAuthor: e.target.value })
                  }
                />
              </label>
              <label className="field version-field">
                API version
                <input
                  placeholder="202603"
                  value={credentials.linkedinVersion}
                  onChange={(e) =>
                    setCredentials({ ...credentials, linkedinVersion: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="connection-links">
              <a
                href="https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api"
                target="_blank"
                rel="noreferrer"
              >
                LinkedIn setup guide <ArrowUpRight size={13} />
              </a>
              {state.connections.linkedin && (
                <button
                  type="button"
                  className="text-button danger"
                  disabled={busy}
                  onClick={() =>
                    action(
                      '/connections',
                      'PUT',
                      { linkedinToken: '', linkedinAuthor: '' },
                      'LinkedIn disconnected.',
                    )
                  }
                >
                  Disconnect
                </button>
              )}
            </div>
          </section>
          <section>
            <div className="connection-title">
              <XIcon />
              <h3>X / Twitter</h3>
              <Badge status={state.connections.x ? 'completed' : 'idle'}>
                {state.connections.x ? 'Credentials saved' : 'Not connected'}
              </Badge>
            </div>
            <p>
              Needs an OAuth 2.0 user token with tweet.write, tweet.read, and users.read scopes. An
              app-only bearer token cannot publish.
            </p>
            <label className="field">
              User access token
              <input
                type="password"
                autoComplete="new-password"
                placeholder={
                  state.connections.x
                    ? 'Saved · enter a token to replace'
                    : 'Paste your X user access token'
                }
                value={credentials.xToken}
                onChange={(e) => setCredentials({ ...credentials, xToken: e.target.value })}
              />
            </label>
            <p className="form-hint">
              X may charge for API usage. Check credits and spending limits in your developer
              account. Replace tokens when they expire.
            </p>
            <div className="connection-links">
              <a
                href="https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code"
                target="_blank"
                rel="noreferrer"
              >
                X setup guide <ArrowUpRight size={13} />
              </a>
              {state.connections.x && (
                <button
                  type="button"
                  className="text-button danger"
                  disabled={busy}
                  onClick={() => action('/connections', 'PUT', { xToken: '' }, 'X disconnected.')}
                >
                  Disconnect
                </button>
              )}
            </div>
          </section>
        </div>
        <div className="connections-bottom">
          <p>
            Tokens are encrypted locally; the key lives on this computer too. They are never sent to
            the LLM. Saved credentials do not confirm platform access.
          </p>
          <button className="button primary" disabled={busy}>
            Save connections
          </button>
        </div>
      </form>
    </>
  );
}
createRoot(document.getElementById('root')).render(<App />);
