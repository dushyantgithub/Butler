import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CircleX,
  Clock3,
  Copy,
  Download,
  FileText,
  Hourglass,
  Inbox,
  LoaderCircle,
  Mail,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import {
  api,
  FaceAvatar,
  Markdown,
  workerOf,
  personName,
  firstName,
  deptOf,
  when,
  ago,
  APPROVAL_LABEL,
} from './ui.jsx';

function Header({ eyebrow, title, children }) {
  return (
    <div className="page-header">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{children}</p>
      </div>
    </div>
  );
}
function Segmented({ value, onChange, items }) {
  return (
    <div className="g-segmented" role="tablist">
      {items.map(([id, label, count]) => (
        <button
          key={id}
          role="tab"
          aria-selected={value === id}
          className={value === id ? 'on' : ''}
          onClick={() => onChange(id)}
        >
          {label}
          {count !== undefined && <b>{count}</b>}
        </button>
      ))}
    </div>
  );
}
function WorkerLine({ state, id, children }) {
  const worker = workerOf(state, id);
  const dept = deptOf(state, worker?.department);
  return (
    <div className="worker-line">
      <FaceAvatar worker={worker} size={34} />
      <div>
        <strong>{personName(worker)}</strong>
        <small>
          {worker?.title}
          {dept ? ` · ${dept.short}` : ''}
        </small>
      </div>
      {children}
    </div>
  );
}

export function DeliverableViewer({ id, state, action, onClose, openDraft }) {
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState('');
  const [followUp, setFollowUp] = useState(false);
  const [helper, setHelper] = useState('');
  const [brief, setBrief] = useState('');
  useEffect(() => {
    setDoc(null);
    api('/deliverables/' + id)
      .then((d) => {
        setDoc(d);
        setBrief(`Build on “${d.title}” by ${personName(workerOf(state, d.workerId))}: `);
      })
      .catch((e) => setError(e.message));
  }, [id]);
  const deployed = state.workers.filter(
    (w) => w.deployment === 'deployed' && w.id !== 'job-hunter',
  );
  if (error) return <div className="g-card">{error}</div>;
  if (!doc)
    return (
      <div className="g-card loading">
        <LoaderCircle className="spin" size={20} /> Opening…
      </div>
    );
  const worker = workerOf(state, doc.workerId);
  return (
    <article className="g-card deliverable-viewer">
      <div className="viewer-top">
        <WorkerLine state={state} id={doc.workerId}>
          <span className="muted">{when(doc.createdAt)}</span>
        </WorkerLine>
        <div className="viewer-actions">
          <a className="g-button" href={`/api/deliverables/${doc.id}/download`} download>
            <Download size={15} /> Download .md
          </a>
          <button
            className="g-button"
            onClick={() => navigator.clipboard.writeText(doc.content).catch(() => {})}
          >
            <Copy size={15} /> Copy
          </button>
          {doc.draftId && (
            <button className="g-button primary" onClick={() => openDraft(doc.draftId)}>
              <Send size={15} /> Review posts
            </button>
          )}
          {onClose && (
            <button className="g-icon-button" aria-label="Close" onClick={onClose}>
              <X size={17} />
            </button>
          )}
        </div>
      </div>
      <h2>{doc.title}</h2>
      {doc.summary && <p className="lede">{doc.summary}</p>}
      <div className="meta-row">
        {doc.skills?.length > 0 && <span>Skills: {doc.skills.join(', ')}</span>}
        <span>Engine: {doc.engine === 'cloud' ? 'Cloud' : 'Local'}</span>
        {doc.projectName && <span>Context: {doc.projectName}</span>}
      </div>
      <Markdown text={doc.content} />
      {doc.nextSteps?.length > 0 && (
        <div className="next-steps">
          <h3>Suggested next steps</h3>
          <ul>
            {doc.nextSteps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
      {doc.sourceErrors?.length > 0 && (
        <p className="g-note warn">
          Couldn’t read: {doc.sourceErrors.map((s) => s.url).join(', ')}
        </p>
      )}
      <div className="follow-up">
        {!followUp ? (
          <button className="g-button" onClick={() => setFollowUp(true)}>
            <Sparkles size={15} /> Ask someone to build on this
          </button>
        ) : (
          <div className="follow-form">
            <select value={helper} onChange={(e) => setHelper(e.target.value)}>
              <option value="">Choose a deployed employee…</option>
              {deployed.map((w) => (
                <option key={w.id} value={w.id}>
                  {personName(w)} · {w.title}
                </option>
              ))}
            </select>
            <textarea
              rows={3}
              maxLength={1800}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
            />
            <button
              className="g-button primary"
              disabled={!helper || brief.trim().length < 20}
              onClick={async () => {
                if (
                  await action(
                    '/work',
                    'POST',
                    {
                      workerId: helper,
                      kind: 'report',
                      title: `Follow-up: ${doc.title}`.slice(0, 140),
                      brief:
                        `${brief}\n\nPrevious deliverable (${worker?.title}):\n${doc.content.slice(0, 1500)}`.slice(
                          0,
                          2000,
                        ),
                      ...(state.projects.some((p) => p.id === 'company')
                        ? { projectId: 'company' }
                        : {}),
                    },
                    `${firstName(workerOf(state, helper))} picked it up.`,
                  )
                )
                  setFollowUp(false);
              }}
            >
              Assign follow-up
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

export function WorkPage({ state, action, openDraft, initial }) {
  const [tab, setTab] = useState(initial?.tab || 'queue');
  const [open, setOpen] = useState(initial?.deliverable || null);
  const [query, setQuery] = useState('');
  const [dept, setDept] = useState('all');
  const active = state.jobs.filter((j) => ['running', 'queued'].includes(j.status));
  const recent = state.jobs.filter((j) => !['running', 'queued'].includes(j.status));
  const library = useMemo(
    () =>
      state.deliverables.filter((d) => {
        const w = workerOf(state, d.workerId);
        if (dept !== 'all' && w?.department !== dept) return false;
        return `${d.title} ${d.summary} ${personName(w)} ${w?.title}`
          .toLowerCase()
          .includes(query.toLowerCase());
      }),
    [state.deliverables, query, dept],
  );
  return (
    <>
      {active.length > 0 && (
        <button
          className="g-button stop-all"
          onClick={() =>
            action(
              '/stop',
              'POST',
              {},
              'Stopping all work. Waiting tasks are cancelled; nothing half-finished is saved.',
            )
          }
        >
          Stop all work
        </button>
      )}
      <Header eyebrow="THE WORK" title="What your team is doing">
        {state.engine?.engine === 'cloud'
          ? `Cloud engine · up to ${state.engine.parallel} employees work at once.`
          : 'Local engine · one employee writes at a time; everyone else waits their turn in the queue.'}
      </Header>
      <Segmented
        value={tab}
        onChange={(t) => {
          setTab(t);
          setOpen(null);
        }}
        items={[
          ['queue', 'In progress', active.length],
          ['library', 'Library', state.deliverables.length],
          ['history', 'History', recent.length],
        ]}
      />
      {tab === 'queue' && (
        <div className="job-list">
          {!active.length && (
            <div className="g-empty">
              <Hourglass size={28} />
              <h3>Nobody is busy right now.</h3>
              <p>Tap an employee in the office for task ideas, or start a mission.</p>
            </div>
          )}
          {active.map((job) => (
            <div className={`g-card job ${job.status}`} key={job.id}>
              <WorkerLine state={state} id={job.workerId}>
                <span className={`g-pill ${job.status}`}>
                  {job.status === 'running' ? (
                    <>
                      <LoaderCircle size={13} className="spin" /> Working
                    </>
                  ) : (
                    <>
                      <Clock3 size={13} /> Queued · #
                      {active.filter((j) => j.status === 'queued').indexOf(job) + 1}
                    </>
                  )}
                </span>
              </WorkerLine>
              <h3>{job.title}</h3>
              <p className="brief">{job.brief}</p>
              <div className="job-foot">
                <small>
                  {job.kind === 'campaign' ? 'Campaign posts' : 'Deliverable'} · added{' '}
                  {ago(job.createdAt)}
                  {job.origin === 'mission'
                    ? ' · mission'
                    : job.origin === 'onboarding'
                      ? ' · starter task'
                      : ''}
                </small>
                <button
                  className="g-button ghost small"
                  onClick={() => action(`/work/${job.id}`, 'DELETE', {}, 'Assignment cancelled.')}
                >
                  Cancel
                </button>
              </div>
              {job.status === 'running' && <div className="g-progress" />}
            </div>
          ))}
        </div>
      )}
      {tab === 'library' && (
        <div className={`library ${open ? 'with-viewer' : ''}`}>
          <div className="library-list">
            <div className="library-tools">
              <label className="g-search">
                <Search size={15} />
                <input
                  placeholder="Search deliverables"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <select
                value={dept}
                onChange={(e) => setDept(e.target.value)}
                aria-label="Department"
              >
                <option value="all">All studios</option>
                {state.departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            {!library.length && (
              <div className="g-empty">
                <FileText size={28} />
                <h3>No deliverables yet.</h3>
                <p>Finished work lands here — reports, plans, copy and campaign posts.</p>
              </div>
            )}
            {library.map((d) => (
              <button
                key={d.id}
                className={`g-card deliverable-item ${open === d.id ? 'on' : ''}`}
                onClick={() => setOpen(d.id)}
              >
                <WorkerLine state={state} id={d.workerId}>
                  <span className="muted">{ago(d.createdAt)}</span>
                </WorkerLine>
                <strong>{d.title}</strong>
                <p>{d.summary || d.preview}</p>
                {d.kind === 'campaign' && <span className="g-pill approval">Campaign posts</span>}
              </button>
            ))}
          </div>
          {open && (
            <DeliverableViewer
              id={open}
              state={state}
              action={action}
              onClose={() => setOpen(null)}
              openDraft={openDraft}
            />
          )}
        </div>
      )}
      {tab === 'history' && (
        <div className="job-list">
          {recent.map((job) => (
            <div className={`g-card job ${job.status}`} key={job.id}>
              <WorkerLine state={state} id={job.workerId}>
                <span className={`g-pill ${job.status}`}>
                  {job.status === 'done'
                    ? 'Done'
                    : job.status === 'failed'
                      ? 'Failed'
                      : 'Cancelled'}
                </span>
              </WorkerLine>
              <h3>{job.title}</h3>
              {job.error && <p className="g-note warn">{job.error}</p>}
              <div className="job-foot">
                <small>{when(job.updatedAt)}</small>
                {job.deliverableId && (
                  <button
                    className="g-button ghost small"
                    onClick={() => {
                      setTab('library');
                      setOpen(job.deliverableId);
                    }}
                  >
                    Open deliverable
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function ApprovalCard({ approval, state, action }) {
  const [note, setNote] = useState('');
  const [followUp, setFollowUp] = useState(true);
  const worker = workerOf(state, approval.workerId);
  const decided = approval.status !== 'pending';
  const mail = ['send', 'contact'].includes(approval.type);
  const followable = !['verify', 'publish'].includes(approval.type);
  return (
    <div className={`g-card approval-card ${approval.status}`}>
      <WorkerLine state={state} id={approval.workerId}>
        <span className={`g-pill type-${approval.type}`}>
          {APPROVAL_LABEL[approval.type] || 'Decision'}
        </span>
      </WorkerLine>
      <h3>{approval.title}</h3>
      {approval.detail && <p>{approval.detail}</p>}
      {approval.content && (
        <div className="approval-content">
          <Markdown text={approval.content} />
        </div>
      )}
      {!decided ? (
        <>
          <div className="approval-explain">
            <ShieldCheck size={15} />
            {approval.type === 'verify'
              ? 'Approve if this is true — it joins your confirmed facts. Decline and your team will never claim it.'
              : approval.type === 'publish'
                ? 'Approving asks Quinn (or the author) to prepare final posts. You approve those again before anything is published.'
                : mail
                  ? 'Butler never sends messages itself. Approve to get the final version to send yourself.'
                  : 'Nothing happens outside Butler without your decision.'}
          </div>
          <input
            className="note-input"
            placeholder="Optional note for the team"
            maxLength={600}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {followable && (
            <label className="g-switch-label">
              <input
                type="checkbox"
                checked={followUp}
                onChange={(e) => setFollowUp(e.target.checked)}
              />
              Ask {firstName(worker)} to prepare the next step
            </label>
          )}
          <div className="approval-actions">
            <button
              className="g-button"
              onClick={() =>
                action(
                  `/approvals/${approval.id}`,
                  'POST',
                  { decision: 'decline', note },
                  'Declined. Nothing was done.',
                )
              }
            >
              <CircleX size={15} /> Decline
            </button>
            <button
              className="g-button primary"
              onClick={() =>
                action(
                  `/approvals/${approval.id}`,
                  'POST',
                  { decision: 'approve', note, followUp },
                  'Approved.',
                )
              }
            >
              <Check size={15} /> Approve
            </button>
          </div>
        </>
      ) : (
        <div className="approval-result">
          <span className={`g-pill ${approval.status}`}>
            {approval.status === 'approved' ? 'Approved' : 'Declined'}
          </span>
          <small>
            {when(approval.decidedAt)} · {approval.decision?.result}
          </small>
          {approval.status === 'approved' && mail && approval.content && (
            <div className="approval-actions">
              <button
                className="g-button small"
                onClick={() => navigator.clipboard.writeText(approval.content).catch(() => {})}
              >
                <Copy size={14} /> Copy message
              </button>
              <a
                className="g-button small"
                href={`mailto:?subject=${encodeURIComponent(approval.title)}&body=${encodeURIComponent(approval.content)}`}
              >
                <Mail size={14} /> Open in Mail
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function InboxPage({ state, action, openDraft }) {
  const [tab, setTab] = useState('pending');
  const pending = state.approvals.filter((a) => a.status === 'pending');
  const decided = state.approvals.filter((a) => a.status !== 'pending');
  const drafts = state.drafts.filter((d) => ['review', 'attention', 'approved'].includes(d.status));
  return (
    <>
      <Header eyebrow="YOUR APPROVALS" title="Nothing happens without you">
        Publishing, outreach, spending and new claims wait here. Your team does the work; you make
        the call.
      </Header>
      <Segmented
        value={tab}
        onChange={setTab}
        items={[
          ['pending', 'Needs you', pending.length + drafts.length],
          ['decided', 'Decided', decided.length],
        ]}
      />
      {tab === 'pending' && (
        <>
          {drafts.length > 0 && (
            <section className="inbox-section">
              <h2>Posts ready to publish</h2>
              <div className="approval-grid">
                {drafts.map((d) => (
                  <div className="g-card approval-card" key={d.id}>
                    <WorkerLine state={state} id={d.workerId || 'manager'}>
                      <span className="g-pill type-publish">
                        {d.status === 'approved' ? 'Approved · not sent' : 'Publish'}
                      </span>
                    </WorkerLine>
                    <h3>{d.title}</h3>
                    <p>{d.summary}</p>
                    <div className="approval-actions">
                      <button className="g-button primary" onClick={() => openDraft(d.id)}>
                        <Send size={15} /> Review posts
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          <section className="inbox-section">
            {drafts.length > 0 && <h2>Requests from your team</h2>}
            {!pending.length && !drafts.length && (
              <div className="g-empty">
                <Inbox size={28} />
                <h3>You’re all caught up.</h3>
                <p>
                  When someone needs a decision, they’ll walk over to your office — and it shows up
                  here.
                </p>
              </div>
            )}
            <div className="approval-grid">
              {pending.map((a) => (
                <ApprovalCard key={a.id} approval={a} state={state} action={action} />
              ))}
            </div>
          </section>
        </>
      )}
      {tab === 'decided' && (
        <div className="approval-grid">
          {decided.map((a) => (
            <ApprovalCard key={a.id} approval={a} state={state} action={action} />
          ))}
        </div>
      )}
    </>
  );
}
