import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  Check,
  ChevronRight,
  CircleX,
  Clock3,
  Cloud,
  Coffee,
  Cpu,
  Crown,
  Ellipsis,
  FileText,
  Globe2,
  History,
  Home,
  Inbox,
  LayoutGrid,
  LoaderCircle,
  Minus,
  Newspaper,
  Pause,
  Play,
  Plus,
  Rocket,
  Settings2,
  Sparkles,
  UserPlus,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { createOfficeWorld } from './game/world.js';
import EmployeeDrawer from './EmployeeDrawer.jsx';
import { EmployeeDragPreview, EmployeeFigure, EmployeeMotionContext } from './EmployeeFigure.jsx';
import { thoughtFor } from '../shared/roster.js';
import {
  api,
  FaceAvatar,
  personName,
  firstName,
  workerOf,
  deptOf,
  STATUS_LABEL,
  APPROVAL_LABEL,
  ago,
  level,
} from './ui.jsx';

const TABS = [
  { id: 'office', label: 'Office', Icon: LayoutGrid },
  { id: 'team', label: 'Team', Icon: Users },
  { id: 'work', label: 'Work', Icon: Briefcase },
  { id: 'inbox', label: 'Approvals', Icon: Inbox },
  { id: 'company', label: 'Company', Icon: Building2 },
];
const MORE = [
  { id: 'drafts', label: 'News desk & posts', Icon: Newspaper },
  { id: 'activity', label: 'Office journal', Icon: History },
  { id: 'projects', label: 'Projects', Icon: FileText },
  { id: 'jobs', label: 'My job search', Icon: Briefcase },
  { id: 'sources', label: 'News sources', Icon: Globe2 },
  { id: 'settings', label: 'Settings', Icon: Settings2 },
];
const HEADINGS = {
  team: 'Team',
  work: 'Work',
  inbox: 'Approvals',
  company: 'Company',
  drafts: 'News desk & posts',
  activity: 'Office journal',
  projects: 'Projects',
  jobs: 'Job search',
  sources: 'News sources',
  settings: 'Settings',
};

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 15000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// ------------------------------------------------------------------ sheets
function Suggestions({ worker, state, action, company }) {
  const [list, setList] = useState(null);
  const [custom, setCustom] = useState('');
  const [kind, setKind] = useState('report');
  const [sending, setSending] = useState('');
  const load = () =>
    api(`/workers/${worker.id}/suggestions`)
      .then((r) => setList(r.suggestions))
      .catch(() => setList([]));
  useEffect(() => {
    setList(null);
    load();
  }, [worker.id, state.company?.updatedAt]);
  const projectId = state.projects.some((p) => p.id === 'company') ? 'company' : undefined;
  async function assign(task) {
    setSending(task.id || 'custom');
    const ok = await action(
      '/work',
      'POST',
      {
        workerId: worker.id,
        kind: task.kind,
        title: task.title,
        brief: task.brief,
        ...(projectId ? { projectId } : {}),
        ...(task.skillIds?.length ? { skillIds: task.skillIds } : {}),
      },
      `${firstName(worker)}: “On it!”`,
    );
    setSending('');
    if (ok) {
      load();
      if (task.id === 'custom') setCustom('');
    }
  }
  return (
    <div className="sheet-section">
      <h4>
        <Sparkles size={14} />{' '}
        {worker.activity?.status === 'idle'
          ? `${firstName(worker)} is free — pick a task`
          : 'Line up another task'}
      </h4>
      {!list && (
        <p className="muted">
          <LoaderCircle size={14} className="spin" /> Thinking of ideas…
        </p>
      )}
      <div className="suggestions">
        {list?.map((task) => (
          <button
            key={task.id}
            className="suggestion"
            disabled={Boolean(sending)}
            onClick={() => assign(task)}
            title={task.brief}
          >
            <span>
              <strong>{task.title}</strong>
              <small>
                {task.kind === 'campaign'
                  ? 'LinkedIn & X drafts → your approval'
                  : task.source === 'skill'
                    ? 'From their skills'
                    : 'Signature task'}
              </small>
            </span>
            {sending === task.id ? <LoaderCircle size={15} className="spin" /> : <Plus size={16} />}
          </button>
        ))}
      </div>
      <div className="custom-task">
        <textarea
          rows={3}
          maxLength={2000}
          value={custom}
          placeholder={`Or describe your own task for ${firstName(worker)}…`}
          onChange={(e) => setCustom(e.target.value)}
        />
        <div className="custom-row">
          <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Deliverable">
            <option value="report">Document / plan</option>
            <option value="campaign" disabled={!projectId}>
              Social campaign
            </option>
          </select>
          <button
            className="g-button primary small"
            disabled={custom.trim().length < 10 || Boolean(sending)}
            onClick={() =>
              assign({ id: 'custom', kind, title: custom.slice(0, 100), brief: custom })
            }
          >
            Assign <ArrowRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
function EmployeeSheet({ worker, state, action, close, navigate, openDraft, command }) {
  const dept = deptOf(state, worker.department);
  const status = worker.deployment === 'bench' ? 'bench' : worker.activity?.status || 'idle';
  const jobs = state.jobs.filter(
    (j) => j.workerId === worker.id && ['running', 'queued'].includes(j.status),
  );
  const done = state.deliverables.filter((d) => d.workerId === worker.id);
  const approvals = state.approvals.filter(
    (a) => a.workerId === worker.id && a.status === 'pending',
  );
  const lv = level(done.length);
  const skills = worker.skillIds.map((id) => state.skills.find((s) => s.id === id)).filter(Boolean);
  const persona = worker.persona || {};
  return (
    <aside className="sheet employee-sheet" aria-label={`${personName(worker)} details`}>
      <button className="sheet-close g-icon-button" aria-label="Close" onClick={close}>
        <X size={17} />
      </button>
      <div className="sheet-hero" style={{ '--dept': dept?.color }}>
        <div className="hero-figure">
          <EmployeeFigure worker={worker} mode="idle" />
        </div>
        <div className="hero-text">
          <span className="dept-chip">{dept?.name}</span>
          <h2>{personName(worker)}</h2>
          <p>
            {worker.title}
            {worker.head && <em className="head-badge">Head</em>}
          </p>
          <div className="level">
            <span>Lv {lv.level}</span>
            <i>
              <b style={{ width: `${Math.round(lv.progress * 100)}%` }} />
            </i>
            <small>{done.length} shipped</small>
          </div>
        </div>
      </div>
      <div className="persona">
        {persona.traits?.map((t) => (
          <span key={t}>{t}</span>
        ))}
        <span>☕ {persona.drink}</span>
        <span>♥ {persona.hobby}</span>
      </div>
      <p className="quote">
        “{persona.catchphrase}” <small>{persona.style}</small>
      </p>
      <div className={`status-card ${status}`}>
        <span className={`g-pill ${status}`}>{STATUS_LABEL[status]}</span>
        <p>{worker.activity?.task || worker.activity?.current}</p>
        {status === 'working' && <div className="g-progress" />}
        {status === 'idle' && worker.deployment === 'deployed' && (
          <div className="row play-row">
            <button className="g-button small" onClick={() => command(worker.id, 'break')}>
              <Coffee size={14} /> Coffee break
            </button>
            <button className="g-button small" onClick={() => command(worker.id, 'visit')}>
              <Crown size={14} /> Call to my office
            </button>
            <button className="g-button small ghost" onClick={() => command(worker.id, 'desk')}>
              Back to desk
            </button>
          </div>
        )}
      </div>
      {approvals.map((a) => (
        <div className="mini-approval" key={a.id}>
          <span className={`g-pill type-${a.type}`}>{APPROVAL_LABEL[a.type]}</span>
          <strong>{a.title}</strong>
          <div className="row">
            <button
              className="g-button small"
              onClick={() =>
                action(`/approvals/${a.id}`, 'POST', { decision: 'decline' }, 'Declined.')
              }
            >
              <CircleX size={14} /> Decline
            </button>
            <button
              className="g-button small primary"
              onClick={() =>
                action(
                  `/approvals/${a.id}`,
                  'POST',
                  { decision: 'approve', followUp: true },
                  'Approved.',
                )
              }
            >
              <Check size={14} /> Approve
            </button>
          </div>
        </div>
      ))}
      {jobs.length > 0 && (
        <div className="sheet-section">
          <h4>
            <Clock3 size={14} /> Assignments
          </h4>
          {jobs.map((job) => (
            <div className="queue-row" key={job.id}>
              {job.status === 'running' ? (
                <LoaderCircle size={14} className="spin" />
              ) : (
                <Clock3 size={14} />
              )}
              <span>{job.title}</span>
              <button
                className="g-icon-button subtle"
                aria-label="Cancel assignment"
                onClick={() => action(`/work/${job.id}`, 'DELETE', {}, 'Assignment cancelled.')}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
      {worker.id === 'researcher' && worker.deployment === 'deployed' && (
        <div className="sheet-section">
          <h4>
            <Newspaper size={14} /> AI news desk
          </h4>
          <button
            className="g-button primary small"
            disabled={state.busy}
            onClick={() =>
              action('/scan', 'POST', {}, 'Scout is reading the latest AI announcements.')
            }
          >
            Run a news round
          </button>
          <p className="muted">
            Scout reads trusted publisher feeds and hands the story to Quinn, who drafts posts for
            your approval.
          </p>
        </div>
      )}
      {worker.id === 'job-hunter' ? (
        <button className="g-button primary" onClick={() => navigate('jobs')}>
          Open job search <ArrowRight size={15} />
        </button>
      ) : worker.deployment === 'deployed' ? (
        <Suggestions worker={worker} state={state} action={action} />
      ) : (
        <div className="sheet-section">
          <p className="muted">
            {firstName(worker)} is{' '}
            {worker.deployment === 'bench' ? 'on the bench' : 'not in the office'}. Deploy them to
            start working.
          </p>
          <button
            className="g-button primary"
            onClick={() =>
              action(
                `/workers/${worker.id}`,
                'PATCH',
                { deployment: 'deployed' },
                `${firstName(worker)} is heading to their desk.`,
              )
            }
          >
            <UserPlus size={15} /> Deploy to {dept?.short}
          </button>
        </div>
      )}
      {done.length > 0 && (
        <div className="sheet-section">
          <h4>
            <FileText size={14} /> Recent work
          </h4>
          {done.slice(0, 4).map((d) => (
            <button
              key={d.id}
              className="recent-row"
              onClick={() => (d.draftId ? openDraft(d.draftId) : navigate(`work:library:${d.id}`))}
            >
              <span>{d.title}</span>
              <small>{ago(d.createdAt)}</small>
              <ChevronRight size={14} />
            </button>
          ))}
        </div>
      )}
      <div className="sheet-section">
        <h4>Skills · {skills.length}</h4>
        <div className="skill-chips">
          {skills.slice(0, 10).map((s) => (
            <span key={s.id}>{s.name}</span>
          ))}
          {skills.length > 10 && <span className="more">+{skills.length - 10} more</span>}
        </div>
      </div>
      <div className="sheet-footer">
        <button className="g-button ghost small" onClick={() => navigate(`team:all:${worker.id}`)}>
          Profile & skills
        </button>
        {worker.deployment === 'deployed' && worker.id !== 'job-hunter' && (
          <button
            className="g-button ghost small"
            onClick={() =>
              action(
                `/workers/${worker.id}`,
                'PATCH',
                { deployment: 'bench' },
                `${firstName(worker)} is taking a seat on the bench.`,
              )
            }
          >
            Move to bench
          </button>
        )}
      </div>
    </aside>
  );
}
function DepartmentSheet({ dept, state, action, close, select, compose }) {
  const members = state.workers.filter((w) => w.department === dept.id);
  const deployed = members.filter((w) => w.deployment === 'deployed');
  const head = members.find((w) => w.id === dept.head);
  return (
    <aside className="sheet dept-sheet" style={{ '--dept': dept.color }}>
      <button className="sheet-close g-icon-button" aria-label="Close" onClick={close}>
        <X size={17} />
      </button>
      <div className="dept-hero">
        <span className="dept-dot" />
        <h2>{dept.name}</h2>
        <p>{dept.blurb}</p>
        <div className="dept-stats">
          <span>
            <b>{deployed.length}</b> in the studio
          </span>
          <span>
            <b>{deployed.filter((w) => w.activity?.status === 'working').length}</b> working
          </span>
          <span>
            <b>{members.length}</b> on the roster
          </span>
        </div>
      </div>
      {head && (
        <button className="head-row" onClick={() => select({ kind: 'worker', id: head.id })}>
          <FaceAvatar worker={head} size={42} />
          <span>
            <small>Department head</small>
            <strong>{personName(head)}</strong>
          </span>
          <ChevronRight size={15} />
        </button>
      )}
      <div className="row">
        <button className="g-button primary small" onClick={() => compose(`${dept.name}: `)}>
          <Rocket size={14} /> Give this studio a mission
        </button>
        {deployed.length < members.length && (
          <button
            className="g-button small"
            onClick={() =>
              action(
                `/departments/${dept.id}/deployment`,
                'POST',
                { deployment: 'deployed' },
                `${dept.name} is fully staffed.`,
              )
            }
          >
            <UserPlus size={14} /> Deploy everyone
          </button>
        )}
      </div>
      <div className="member-list">
        {members.map((w) => (
          <button
            key={w.id}
            className={`member ${w.deployment}`}
            onClick={() => select({ kind: 'worker', id: w.id })}
          >
            <FaceAvatar
              worker={w}
              size={34}
              ring={
                w.activity?.status === 'working'
                  ? '#34C759'
                  : w.activity?.status === 'approval'
                    ? '#0A84FF'
                    : null
              }
            />
            <span>
              <strong>{personName(w)}</strong>
              <small>{w.title}</small>
            </span>
            <em
              className={`g-pill ${w.deployment === 'deployed' ? w.activity?.status : w.deployment}`}
            >
              {w.deployment === 'deployed'
                ? STATUS_LABEL[w.activity?.status || 'idle']
                : w.deployment === 'bench'
                  ? 'Bench'
                  : 'Hire'}
            </em>
          </button>
        ))}
      </div>
    </aside>
  );
}
function CeoSheet({ state, action, close, navigate, openDraft }) {
  const approvals = state.approvals.filter((a) => a.status === 'pending');
  const drafts = state.drafts.filter((d) => ['review', 'attention'].includes(d.status));
  const ceo = state.company?.ceo;
  return (
    <aside className="sheet ceo-sheet">
      <button className="sheet-close g-icon-button" aria-label="Close" onClick={close}>
        <X size={17} />
      </button>
      <div className="sheet-hero ceo">
        <div className="hero-figure">
          <EmployeeFigure
            worker={{ id: 'ceo', ceo: true, avatar: ceo?.avatar, department: null }}
            mode="idle"
          />
        </div>
        <div className="hero-text">
          <span className="dept-chip">
            <Crown size={12} /> CEO
          </span>
          <h2>{ceo?.name || 'You'}</h2>
          <p>{state.company?.companyName}</p>
        </div>
      </div>
      <div className="sheet-section">
        <h4>
          <Bell size={14} /> Waiting for you · {approvals.length + drafts.length}
        </h4>
        {!approvals.length && !drafts.length && (
          <p className="muted">All clear. Your team is working.</p>
        )}
        {drafts.slice(0, 3).map((d) => (
          <button className="recent-row" key={d.id} onClick={() => openDraft(d.id)}>
            <span>📣 {d.title}</span>
            <ChevronRight size={14} />
          </button>
        ))}
        {approvals.slice(0, 4).map((a) => (
          <div className="mini-approval" key={a.id}>
            <span className={`g-pill type-${a.type}`}>{APPROVAL_LABEL[a.type]}</span>
            <strong>{a.title}</strong>
            <small>from {personName(workerOf(state, a.workerId))}</small>
            <div className="row">
              <button
                className="g-button small"
                onClick={() =>
                  action(`/approvals/${a.id}`, 'POST', { decision: 'decline' }, 'Declined.')
                }
              >
                Decline
              </button>
              <button
                className="g-button small primary"
                onClick={() =>
                  action(
                    `/approvals/${a.id}`,
                    'POST',
                    { decision: 'approve', followUp: true },
                    'Approved.',
                  )
                }
              >
                Approve
              </button>
            </div>
          </div>
        ))}
        <button className="g-button" onClick={() => navigate('inbox')}>
          Open approvals <ArrowRight size={14} />
        </button>
      </div>
      <div className="sheet-section">
        <button className="recent-row" onClick={() => navigate('company')}>
          <span>Edit company profile</span>
          <ChevronRight size={14} />
        </button>
        <button className="recent-row" onClick={() => navigate('settings')}>
          <span>Office settings & accounts</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </aside>
  );
}

// ------------------------------------------------------------------ mission
const EXAMPLES = [
  'Launch our product on LinkedIn next week',
  'Write a blog post and SEO plan for our main product',
  'Prepare an investor update and a one-page pitch',
  'Audit our website copy for claims we can’t prove',
  'Plan our next quarter’s OKRs',
];
function MissionComposer({ state, close, action, initialGoal = '' }) {
  const [goal, setGoal] = useState(initialGoal);
  const [useAI, setUseAI] = useState(state.engine?.engine === 'cloud');
  const [plan, setPlan] = useState(null);
  const [planning, setPlanning] = useState(false);
  const [error, setError] = useState('');
  async function makePlan() {
    setPlanning(true);
    setError('');
    try {
      const result = await api('/missions/plan', 'POST', { goal, useAI });
      setPlan({ ...result, tasks: result.tasks.map((t) => ({ ...t, on: true })) });
    } catch (e) {
      setError(e.message);
    } finally {
      setPlanning(false);
    }
  }
  const chosen = plan?.tasks.filter((t) => t.on) || [];
  return (
    <div className="g-modal-backdrop" onClick={close}>
      <section
        className="g-modal mission"
        role="dialog"
        aria-modal="true"
        aria-label="New mission"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="sheet-close g-icon-button" aria-label="Close" onClick={close}>
          <X size={17} />
        </button>
        <span className="modal-icon">
          <Rocket size={22} />
        </span>
        <h2>New mission</h2>
        <p className="muted">
          Describe an outcome. Butler picks the right specialists, splits the work and queues it.
          Anything external still comes to you for approval.
        </p>
        <textarea
          autoFocus
          rows={3}
          maxLength={1000}
          value={goal}
          placeholder="e.g. Get our launch ready for next Tuesday"
          onChange={(e) => setGoal(e.target.value)}
        />
        {!plan && (
          <div className="g-chips compact">
            {EXAMPLES.map((x) => (
              <button type="button" key={x} onClick={() => setGoal(x)}>
                {x}
              </button>
            ))}
          </div>
        )}
        <div className="mission-row">
          <label className="g-switch-label">
            <input type="checkbox" checked={useAI} onChange={(e) => setUseAI(e.target.checked)} />
            Let the Chief of Staff plan with AI{' '}
            {state.engine?.engine === 'local' ? '(slower on the local engine)' : ''}
          </label>
          <button
            className="g-button"
            disabled={goal.trim().length < 8 || planning}
            onClick={makePlan}
          >
            {planning ? <LoaderCircle size={15} className="spin" /> : <Sparkles size={15} />}{' '}
            {plan ? 'Re-plan' : 'Plan it'}
          </button>
        </div>
        {error && <p className="g-error">{error}</p>}
        {plan && (
          <>
            <p className="plan-summary">
              {plan.summary}
              {plan.note && <small> {plan.note}</small>}
            </p>
            <div className="plan-tasks">
              {plan.tasks.map((task, i) => {
                const worker = workerOf(state, task.workerId);
                return (
                  <div key={i} className={`plan-task ${task.on ? 'on' : ''}`}>
                    <label>
                      <input
                        type="checkbox"
                        checked={task.on}
                        onChange={(e) =>
                          setPlan({
                            ...plan,
                            tasks: plan.tasks.map((t, j) =>
                              j === i ? { ...t, on: e.target.checked } : t,
                            ),
                          })
                        }
                      />
                      <FaceAvatar worker={worker} size={36} />
                      <span>
                        <strong>{personName(worker)}</strong>
                        <small>
                          {worker?.title}
                          {worker?.deployment !== 'deployed' ? ' · will be deployed' : ''}
                        </small>
                      </span>
                    </label>
                    <textarea
                      rows={3}
                      maxLength={2000}
                      value={task.brief}
                      onChange={(e) =>
                        setPlan({
                          ...plan,
                          tasks: plan.tasks.map((t, j) =>
                            j === i ? { ...t, brief: e.target.value } : t,
                          ),
                        })
                      }
                    />
                  </div>
                );
              })}
            </div>
            <button
              className="g-button primary large"
              disabled={!chosen.length}
              onClick={async () => {
                if (
                  await action(
                    '/missions',
                    'POST',
                    {
                      goal,
                      tasks: chosen.map(({ workerId, brief, why, kind }) => ({
                        workerId,
                        brief,
                        why,
                        kind: kind || 'report',
                      })),
                    },
                    `Mission launched: ${chosen.length} assignments queued.`,
                  )
                )
                  close();
              }}
            >
              <Rocket size={16} /> Launch mission · {chosen.length}{' '}
              {chosen.length === 1 ? 'task' : 'tasks'}
            </button>
          </>
        )}
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ HUD
export default function OfficeGame({
  state,
  model,
  pending,
  error,
  action,
  navigate,
  openDraft,
  children,
  panel,
  closePanel,
  notify,
}) {
  const host = useRef(),
    world = useRef(),
    dragPreview = useRef();
  const latest = useRef({});
  const [selection, setSelection] = useState(null);
  const [drawer, setDrawer] = useState(false);
  const [draggedWorker, setDraggedWorker] = useState(null);
  const [mission, setMission] = useState(null);
  const [more, setMore] = useState(false);
  const [worldError, setWorldError] = useState('');
  const [motion, setMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  const [bubblesOn, setBubblesOn] = useState(true);
  const [feedOpen, setFeedOpen] = useState(true);
  const now = useClock();
  latest.current = { state, navigate };
  useEffect(() => {
    try {
      world.current = createOfficeWorld(host.current, {
        onSelect(id) {
          if (!id) return setSelection(null);
          if (id.startsWith('worker:')) {
            const wid = id.slice(7);
            setSelection({ kind: 'worker', id: wid });
            world.current?.focusEmployee(wid);
          } else if (id.startsWith('department:')) {
            const did = id.split(':')[1];
            setSelection({ kind: 'department', id: did });
            world.current?.focusDepartment(did);
          } else if (id === 'ceo') {
            setSelection({ kind: 'ceo' });
            world.current?.focusCeo();
          } else if (id === 'room:library') latest.current.navigate('work:library');
          else if (id === 'room:lounge') latest.current.navigate('team');
          else if (id.startsWith('room:')) world.current?.focusDepartment(id.slice(5));
        },
      });
      world.current.setReducedMotion(motion);
    } catch (e) {
      console.error(e);
      setWorldError(
        'The 3D office could not start. Enable hardware acceleration in your browser or app, then reload. Every page still works from the tab bar.',
      );
    }
    return () => world.current?.dispose();
  }, []);
  useEffect(() => {
    if (state) world.current?.update(state);
  }, [state]);
  useEffect(() => {
    world.current?.setPaused(Boolean(panel) || !state?.company);
  }, [panel, Boolean(state?.company)]);
  useEffect(() => {
    world.current?.setSelected(
      selection?.kind === 'worker' ? selection.id : selection?.kind === 'ceo' ? 'ceo' : null,
    );
  }, [selection]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (mission) setMission(null);
      else if (panel) closePanel();
      else if (selection) setSelection(null);
      else setDrawer(false);
      setMore(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel, selection, mission]);

  // Thought bubbles rotate across the floor and always reflect real state.
  const skillNames = useMemo(
    () => new Map((state?.skills || []).map((s) => [s.id, s.name])),
    [state?.skills?.length],
  );
  useEffect(() => {
    if (!state || !world.current) return;
    let tick = 0;
    const refresh = () => {
      const s = latest.current.state;
      if (!s || !bubblesOn) return world.current?.setBubbles([]);
      tick++;
      const deployed = s.workers.filter((w) => w.deployment === 'deployed');
      const weight = { working: 4, approval: 3, queued: 2, idle: 1 };
      const pool = deployed
        .map((w) => ({ w, score: (weight[w.activity?.status] || 1) + Math.random() * 3 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, deployed.length > 30 ? 6 : 5)
        .map((x) => x.w);
      const sel = selection?.kind === 'worker' && s.workers.find((w) => w.id === selection.id);
      if (sel && sel.deployment !== 'undeployed' && !pool.includes(sel)) pool.unshift(sel);
      const product = s.company?.products?.[0]?.name || s.company?.companyName;
      world.current.setBubbles(
        pool.map((w) => {
          const skillIds = w.skillIds || [];
          const skill = skillNames.get(
            skillIds[(tick + w.id.length) % Math.max(1, skillIds.length)],
          );
          const approval = s.approvals.find((a) => a.workerId === w.id && a.status === 'pending');
          return {
            id: w.id,
            name: firstName(w),
            tone: w.deployment === 'bench' ? 'bench' : w.activity?.status || 'idle',
            text: thoughtFor(
              w,
              {
                status: w.deployment === 'bench' ? 'bench' : w.activity?.status,
                task: w.activity?.task,
                queueCount: w.activity?.queued,
                waitingTitle: approval?.title || w.activity?.task,
                lastDone: w.activity?.lastDone,
                skill,
                product,
              },
              tick,
            ),
          };
        }),
      );
    };
    refresh();
    const t = setInterval(refresh, 6000);
    return () => clearInterval(t);
  }, [
    Boolean(state),
    bubblesOn,
    selection?.id,
    state?.workers?.filter((w) => w.deployment === 'deployed').length,
  ]);

  const workers = state?.workers || [];
  const deployed = workers.filter((w) => w.deployment === 'deployed');
  const working = deployed.filter((w) => w.activity?.status === 'working').length;
  const queued = (state?.jobs || []).filter((j) => j.status === 'queued').length;
  const approvals =
    (state?.approvals || []).filter((a) => a.status === 'pending').length +
    (state?.drafts || []).filter((d) => ['review', 'attention'].includes(d.status)).length;
  const selectedWorker = selection?.kind === 'worker' && workerOf(state, selection.id);
  const selectedDept = selection?.kind === 'department' && deptOf(state, selection.id);
  const engine = state?.engine;
  const tab = panel ? panel.split(':')[0] : 'office';

  function startEmployeeDrag(id, x, y) {
    const worker = workers.find((w) => w.id === id);
    if (!worker) return;
    setDraggedWorker(id);
    dragPreview.current?.start(worker, x, y);
  }
  function endEmployeeDrag() {
    setDraggedWorker(null);
    dragPreview.current?.cancel();
  }
  async function deployDroppedEmployee(id, x, y) {
    const bounds = host.current?.getBoundingClientRect();
    if (
      !bounds ||
      x < bounds.left ||
      x > bounds.right ||
      y < bounds.top ||
      y > bounds.bottom ||
      !workers.some((w) => w.id === id && w.deployment !== 'deployed')
    ) {
      endEmployeeDrag();
      return;
    }
    dragPreview.current?.move(x, y);
    dragPreview.current?.release();
    setDraggedWorker(null);
    const worker = workers.find((w) => w.id === id);
    const ok = await action(
      '/workers/' + id,
      'PATCH',
      { deployment: 'deployed' },
      `${firstName(worker)} is walking to the ${deptOf(state, worker.department)?.short} studio.`,
    );
    dragPreview.current?.complete(ok);
    if (ok) {
      world.current?.welcomeEmployee(id);
      setSelection({ kind: 'worker', id });
    }
  }
  const events = (state?.events || []).slice(0, 5);
  return (
    <main className={`hud-shell ${panel ? 'has-panel' : ''}`}>
      <section
        className="world-stage"
        aria-label="Your 3D office"
        onDragOver={(event) => {
          if (draggedWorker) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }
        }}
        onDrop={async (event) => {
          event.preventDefault();
          const id = event.dataTransfer.getData('application/x-butler-worker');
          if (draggedWorker === id) await deployDroppedEmployee(id, event.clientX, event.clientY);
          else endEmployeeDrag();
        }}
      >
        <div className="world-canvas" ref={host} />
        {draggedWorker && (
          <div className="drop-hint glass">
            <UserPlus size={22} /> Drop {firstName(workerOf(state, draggedWorker))} anywhere on the
            campus
          </div>
        )}
      </section>

      {/* Top bar */}
      <header className="hud-top">
        <button
          className="glass company-pill"
          onClick={() => navigate('company')}
          title="Company profile"
        >
          <span className="app-glyph">
            <Sparkles size={16} />
          </span>
          <span className="company-text">
            <strong>{state?.company?.companyName || state?.settings.officeName || 'Butler'}</strong>
            <small>
              {now.toLocaleDateString([], { weekday: 'short' })} ·{' '}
              {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </small>
          </span>
        </button>
        <div className="glass stats-pill" role="status">
          <button onClick={() => navigate('team')} title="Employees in the office">
            <Users size={15} />
            <b>{deployed.length}</b>
            <span>team</span>
          </button>
          <button onClick={() => navigate('work')} title="Working now">
            <Zap size={15} className="c-green" />
            <b>{working}</b>
            <span>working</span>
          </button>
          <button onClick={() => navigate('work')} title="Waiting in the queue">
            <Clock3 size={15} className="c-orange" />
            <b>{queued}</b>
            <span>queued</span>
          </button>
          <button
            onClick={() => navigate('inbox')}
            title="Waiting for your approval"
            className={approvals ? 'alert' : ''}
          >
            <Bell size={15} className="c-blue" />
            <b>{approvals}</b>
            <span>for you</span>
          </button>
          <button onClick={() => navigate('work:library')} title="Deliverables">
            <FileText size={15} className="c-purple" />
            <b>{state?.deliverables?.length || 0}</b>
            <span>done</span>
          </button>
        </div>
        <div className="hud-top-right">
          <button
            className={`glass engine-pill ${engine?.engine}`}
            onClick={() => navigate('company')}
            title="AI engine"
          >
            {engine?.engine === 'cloud' ? <Cloud size={15} /> : <Cpu size={15} />}
            <span>
              {engine?.engine === 'cloud'
                ? `${engine.model} ×${engine.parallel}`
                : `Local · ${state?.settings.model || 'Qwen'}`}
            </span>
            <i className={model?.online || engine?.engine === 'cloud' ? 'ok' : 'off'} />
          </button>
          <button
            className="glass round"
            onClick={() => setDrawer(!drawer)}
            title="Hire & deploy"
            aria-label="Hire & deploy"
          >
            <UserPlus size={18} />
          </button>
          <button className="glass primary-pill" onClick={() => setMission({ goal: '' })}>
            <Rocket size={16} /> Mission
          </button>
          <button
            className="glass round avatar-button"
            onClick={() => setSelection({ kind: 'ceo' })}
            title="You"
          >
            <FaceAvatar avatar={state?.company?.ceo?.avatar || {}} size={34} />
          </button>
        </div>
      </header>

      {/* Live feed */}
      {!panel && state && (
        <aside className={`glass feed ${feedOpen ? '' : 'collapsed'}`}>
          <button className="feed-head" onClick={() => setFeedOpen(!feedOpen)}>
            <span className="live-dot" /> Live
            <small>{working ? `${working} working` : 'Quiet'}</small>
          </button>
          {feedOpen &&
            events.map((e) => {
              const w = workerOf(state, e.agent);
              return (
                <div className={`feed-item ${e.kind}`} key={e.id}>
                  {w ? (
                    <FaceAvatar worker={w} size={26} />
                  ) : (
                    <FaceAvatar avatar={state.company?.ceo?.avatar || {}} size={26} />
                  )}
                  <p>
                    <strong>{w ? firstName(w) : e.agent === 'boss' ? 'You' : e.agent}</strong>{' '}
                    {e.message.replace(/^\S+ (picked up|finished)/, '$1')}
                    <small>{ago(e.time)}</small>
                  </p>
                </div>
              );
            })}
        </aside>
      )}

      {/* Camera & view controls */}
      {!panel && (
        <div className="glass camera-controls">
          <button onClick={() => world.current?.zoom(0.75)} aria-label="Zoom in" title="Zoom in">
            <Plus size={16} />
          </button>
          <button onClick={() => world.current?.zoom(1.33)} aria-label="Zoom out" title="Zoom out">
            <Minus size={16} />
          </button>
          <button
            onClick={() => world.current?.resetCamera()}
            aria-label="Whole campus"
            title="Whole campus"
          >
            <Home size={15} />
          </button>
          <button
            onClick={() => setBubblesOn(!bubblesOn)}
            aria-pressed={bubblesOn}
            title="Thought bubbles"
          >
            💭
          </button>
          <button
            onClick={() => {
              setMotion(!motion);
              world.current?.setReducedMotion(!motion);
            }}
            aria-pressed={motion}
            title={motion ? 'Resume animation' : 'Reduce motion'}
          >
            {motion ? <Play size={15} /> : <Pause size={15} />}
          </button>
        </div>
      )}

      {!panel && !selection && deployed.length === 0 && state?.company && (
        <button className="glass empty-invite" onClick={() => setDrawer(true)}>
          <UserPlus size={20} />
          <strong>Your campus is empty.</strong>
          <span>Hire your team — or start a mission and Butler will staff it.</span>
        </button>
      )}
      {(worldError || error) && (
        <div className="glass hud-error" role="alert">
          {worldError || error}
        </div>
      )}

      {/* Sheets */}
      {!panel && selectedWorker && (
        <EmployeeSheet
          worker={selectedWorker}
          state={state}
          action={action}
          close={() => setSelection(null)}
          navigate={navigate}
          openDraft={openDraft}
          command={(id, cmd) => {
            if (!world.current?.command(id, cmd))
              notify?.(`${firstName(selectedWorker)} is busy right now.`);
            else if (cmd === 'break')
              notify?.(
                `${firstName(selectedWorker)} is grabbing a ${selectedWorker.persona?.drink || 'coffee'}.`,
              );
            else if (cmd === 'visit')
              notify?.(`${firstName(selectedWorker)} is walking over to your office.`);
          }}
        />
      )}
      {!panel && selectedDept && (
        <DepartmentSheet
          dept={selectedDept}
          state={state}
          action={action}
          close={() => setSelection(null)}
          select={(s) => {
            setSelection(s);
            if (s.kind === 'worker') world.current?.focusEmployee(s.id);
          }}
          compose={(goal) => setMission({ goal })}
        />
      )}
      {!panel && selection?.kind === 'ceo' && state && (
        <CeoSheet
          state={state}
          action={action}
          close={() => setSelection(null)}
          navigate={navigate}
          openDraft={openDraft}
        />
      )}

      {drawer && !panel && state && (
        <EmployeeDrawer
          state={state}
          busy={pending}
          action={action}
          close={() => {
            setDrawer(false);
            setDraggedWorker(null);
            dragPreview.current?.clear();
          }}
          reducedMotion={motion}
          onDragStart={startEmployeeDrag}
          onDragMove={(x, y) => dragPreview.current?.move(x, y)}
          onDragEnd={endEmployeeDrag}
          onDropWorker={deployDroppedEmployee}
          manage={() => {
            setDrawer(false);
            navigate('team');
          }}
          assign={(id) => {
            setDrawer(false);
            setSelection({ kind: 'worker', id });
            world.current?.focusEmployee(id);
          }}
        />
      )}
      <EmployeeDragPreview ref={dragPreview} reducedMotion={motion} />

      {/* Tab bar */}
      <nav className="glass tab-bar" aria-label="Main">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={tab === id ? 'on' : ''}
            onClick={() => (id === 'office' ? closePanel() : navigate(id))}
            aria-current={tab === id ? 'page' : undefined}
          >
            <span className="tab-icon">
              <Icon size={20} />
              {id === 'inbox' && approvals > 0 && <b className="badge-dot">{approvals}</b>}
            </span>
            <span>{label}</span>
          </button>
        ))}
        <div className="more-wrap">
          <button
            className={MORE.some((m) => m.id === tab) ? 'on' : ''}
            onClick={() => setMore(!more)}
            aria-expanded={more}
          >
            <span className="tab-icon">
              <Ellipsis size={20} />
            </span>
            <span>More</span>
          </button>
          {more && (
            <div className="glass more-menu" role="menu">
              {MORE.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  role="menuitem"
                  onClick={() => {
                    setMore(false);
                    navigate(id);
                  }}
                >
                  <Icon size={16} /> {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </nav>

      {mission && state && (
        <MissionComposer
          state={state}
          action={action}
          close={() => setMission(null)}
          initialGoal={mission.goal}
        />
      )}

      {panel && (
        <div className="page-sheet" role="dialog" aria-modal="true" aria-label={HEADINGS[tab]}>
          <div className="page-sheet-card">
            <div className="page-sheet-top">
              <button className="g-button ghost small" onClick={closePanel}>
                ← Office
              </button>
              <strong>{HEADINGS[tab]}</strong>
              <button className="g-icon-button" aria-label="Close" onClick={closePanel}>
                <X size={18} />
              </button>
            </div>
            <div className="page-sheet-content">
              <EmployeeMotionContext.Provider value={motion}>
                {children}
              </EmployeeMotionContext.Provider>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
