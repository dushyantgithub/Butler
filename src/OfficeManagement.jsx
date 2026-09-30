import { EmployeeFigure } from './EmployeeFigure.jsx';
import React, { useEffect, useState } from 'react';
import { Users, BriefcaseBusiness, Search, Sparkles, ArrowRight, ShieldCheck } from 'lucide-react';

const deploymentNames = {
  deployed: 'In the office',
  bench: 'On the bench',
  undeployed: 'Undeployed',
};
function Heading({ eyebrow, title, children }) {
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
export function WorkforcePage({
  navigate,
  state,
  action,
  busy,
  initialDepartment = 'all',
  initialEmployee = null,
}) {
  const [department, setDepartment] = useState(initialDepartment),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState('all'),
    [selected, setSelected] = useState(initialEmployee);
  const workers = state.workers.filter(
    (w) =>
      (department === 'all' || w.department === department) &&
      (status === 'all' || w.deployment === status) &&
      `${w.persona?.fullName || ''} ${w.title || ''} ${w.name} ${w.description}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const employee = state.workers.find((w) => w.id === selected);
  return (
    <>
      <Heading eyebrow="YOUR TEAM" title="115 specialists. You pick who’s in.">
        Every employee has their own personality and a skill set that fits their role — department
        heads know every skill in their studio. Deploy people to give them desks and work.
      </Heading>
      <div className="workforce-metrics">
        {['deployed', 'bench', 'undeployed'].map((key) => (
          <button
            key={key}
            onClick={() => setStatus(status === key ? 'all' : key)}
            aria-pressed={status === key}
          >
            <strong>{state.workers.filter((w) => w.deployment === key).length}</strong>
            <span>{deploymentNames[key]}</span>
          </button>
        ))}
        <div>
          <strong>{state.skills.length}</strong>
          <span>Available skills</span>
        </div>
      </div>
      <div className="department-grid">
        {state.departments.map((dept) => (
          <button
            key={dept.id}
            className={`department-card ${department === dept.id ? 'selected' : ''}`}
            onClick={() => {
              setDepartment(department === dept.id ? 'all' : dept.id);
              setSelected(null);
            }}
            style={{ '--department-color': dept.color }}
          >
            <span className="department-icon">
              <BriefcaseBusiness size={20} />
            </span>
            <strong>{dept.name}</strong>
            <small>
              {
                state.workers.filter((w) => w.department === dept.id && w.deployment === 'deployed')
                  .length
              }{' '}
              deployed · {state.workers.filter((w) => w.department === dept.id).length} employees
            </small>
          </button>
        ))}
      </div>
      <div className="workforce-toolbar">
        <label className="roster-search">
          <Search size={16} />
          <input
            aria-label="Search employees"
            placeholder="Find an employee…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <select
          aria-label="Deployment filter"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="all">All deployment states</option>
          {Object.entries(deploymentNames).map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
        {department !== 'all' && (
          <>
            <button className="button secondary" onClick={() => setDepartment('all')}>
              All departments
            </button>
            <select
              aria-label="Deploy entire department"
              value=""
              disabled={busy}
              onChange={(e) =>
                action(
                  `/departments/${department}/deployment`,
                  'POST',
                  { deployment: e.target.value },
                  'Department deployment updated.',
                )
              }
            >
              <option value="" disabled>
                Manage this department…
              </option>
              <option value="deployed">Deploy department</option>
              <option value="bench">Bench department</option>
              <option value="undeployed">Undeploy department</option>
            </select>
          </>
        )}
      </div>
      <p className="form-hint">
        Bench keeps employees visible in the reserve area. Undeployed employees leave the floor.
        Both retain their skills and history, and can be redeployed anytime.
      </p>
      {employee && (
        <EmployeeDetail
          openJobs={() => navigate?.('jobs')}
          key={employee.id}
          employee={employee}
          state={state}
          action={action}
          busy={busy}
          close={() => setSelected(null)}
        />
      )}
      <div className="employee-grid">
        {workers.map((worker) => (
          <article className={`employee-card ${worker.deployment}`} key={worker.id}>
            <div className="employee-card-top">
              <EmployeeFigure worker={worker} />
              <span className={`deployment-pill ${worker.deployment}`}>
                {deploymentNames[worker.deployment]}
              </span>
            </div>
            <h3>{worker.persona?.fullName || worker.name}</h3>
            <p className="employee-title">
              {worker.title}
              {worker.head && <em className="head-badge">Head</em>}
            </p>
            <p>{worker.persona?.traits?.join(' · ')}</p>
            <small>
              {worker.skillIds.length} role skills ·{' '}
              {worker.origin === 'local'
                ? 'Local import'
                : state.departments.find((d) => d.id === worker.department)?.name}
            </small>
            <div className="employee-card-actions">
              <select
                aria-label={`Deployment for ${worker.name}`}
                disabled={busy}
                value={worker.deployment}
                onChange={(e) =>
                  action(
                    `/workers/${worker.id}`,
                    'PATCH',
                    { deployment: e.target.value },
                    `${worker.persona?.firstName || worker.name}: ${deploymentNames[e.target.value]}.`,
                  )
                }
              >
                {Object.entries(deploymentNames).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
              <button className="button secondary" onClick={() => setSelected(worker.id)}>
                Skills & work <ArrowRight size={14} />
              </button>
            </div>
            {worker.activity.status === 'working' && (
              <p className="employee-working">{worker.activity.current}</p>
            )}
          </article>
        ))}
      </div>
      {!workers.length && (
        <div className="empty">
          <Users size={26} />
          <h3>No employees match these filters.</h3>
          <button
            className="button secondary"
            onClick={() => {
              setSearch('');
              setStatus('all');
              setDepartment('all');
            }}
          >
            Clear filters
          </button>
        </div>
      )}
    </>
  );
}
function EmployeeDetail({ employee, state, action, busy, close, openJobs }) {
  const [query, setQuery] = useState(''),
    [skillIds, setSkillIds] = useState(employee.skillIds);
  useEffect(() => setSkillIds(employee.skillIds), [JSON.stringify(employee.skillIds)]);
  const skills = state.skills.filter((s) =>
    `${s.name} ${s.category || ''}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <section className="panel employee-detail">
      <div className="panel-heading">
        <h2>
          {employee.persona?.fullName || employee.name} ·{' '}
          <span className="muted">{employee.title}</span>
        </h2>
        <button className="button secondary" onClick={close}>
          Close employee
        </button>
      </div>
      <p>
        {employee.persona?.traits?.join(' · ')} — “{employee.persona?.catchphrase}”
      </p>
      <p className="form-hint">{employee.description}</p>
      <details>
        <summary>Manage {skillIds.length} assigned skills</summary>
        <p className="form-hint">
          Skills start from this role’s specialty
          {employee.head ? ' (department heads know every skill in their studio)' : ''}. Add or
          remove any installed skill; each assignment focuses on up to two.
        </p>
        <input
          aria-label="Search skills"
          placeholder="Search the skill library…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="skill-picker">
          {skills.map((skill) => (
            <label key={skill.id}>
              <input
                type="checkbox"
                checked={skillIds.includes(skill.id)}
                onChange={(e) =>
                  setSkillIds(
                    e.target.checked
                      ? [...skillIds, skill.id]
                      : skillIds.filter((id) => id !== skill.id),
                  )
                }
              />
              <span>
                <strong>{skill.name}</strong>
                <small>{skill.description}</small>
              </span>
            </label>
          ))}
        </div>
        <button
          className="button primary"
          disabled={busy}
          onClick={() =>
            action(`/workers/${employee.id}`, 'PATCH', { skillIds }, 'Employee skills saved.')
          }
        >
          Save skills
        </button>
      </details>
      {employee.id === 'job-hunter' ? (
        <button className="button primary" onClick={openJobs}>
          Open Job search
        </button>
      ) : employee.deployment === 'deployed' ? (
        <AssignmentForm state={state} action={action} busy={busy} workerId={employee.id} />
      ) : (
        <p className="form-hint">Deploy this employee to give them an assignment.</p>
      )}
      <h3>Recent work</h3>
      {state.tasks
        .filter((t) => t.agent === employee.id)
        .slice(0, 5)
        .map((task) => (
          <details className="worker-report" key={task.id}>
            <summary>
              {task.title} · {task.status}
            </summary>
            <p>{task.detail || 'Work in progress…'}</p>
          </details>
        ))}
    </section>
  );
}
const emptyProject = {
  name: '',
  website: '',
  company: '',
  products: '',
  audience: '',
  voice: '',
  goals: '',
  facts: '',
  restrictions: '',
  sources: [],
};
export function ProjectsPage({ state, action, busy }) {
  const [selected, setSelected] = useState(state.projects[0]?.id || 'new'),
    [creating, setCreating] = useState(!state.projects.length);
  const project = state.projects.find((p) => p.id === selected);
  return (
    <>
      <Heading eyebrow="PRIVATE PROJECTS & RESEARCH" title="Your company. Your voice.">
        Give employees the context they need to research, create and promote your work. Briefs and
        outputs stay in your local office data.
      </Heading>
      <div className="project-tabs">
        {state.projects.map((p) => (
          <button
            key={p.id}
            className={`button ${selected === p.id ? 'primary' : 'secondary'}`}
            onClick={() => {
              setSelected(p.id);
              setCreating(false);
            }}
          >
            {p.name}
          </button>
        ))}
        <button
          className="button secondary"
          onClick={() => {
            setSelected('new');
            setCreating(true);
          }}
        >
          + New project
        </button>
      </div>
      {(project || creating) && (
        <ProjectEditor
          key={selected}
          project={project}
          action={action}
          busy={busy}
          onSaved={() => setCreating(false)}
        />
      )}
      {!project && !creating && (
        <p className="form-hint">Project saved. Select it above to start a campaign.</p>
      )}
      {project && (
        <section className="panel project-assignment">
          <h2>
            <Sparkles size={20} /> Research & creative studio
          </h2>
          <p>
            Choose an employee and describe the work. Reports appear in employee history; campaign
            copy and visual briefs arrive at your CEO desk.
          </p>
          <AssignmentForm
            key={project.id}
            state={state}
            action={action}
            busy={busy}
            projectId={project.id}
          />
        </section>
      )}
      <div className="approval-promise">
        <ShieldCheck size={20} />
        <p>
          <strong>You make the publishing decision.</strong> Campaigns produce text posts, a
          downloadable branded graphic and a visual production brief. Paid ad placement and image
          uploads are not connected. Approved text posts can go to your connected LinkedIn and X
          accounts.
        </p>
      </div>
    </>
  );
}
function ProjectEditor({ project, action, busy, onSaved }) {
  const [form, setForm] = useState(() =>
      Object.fromEntries(
        Object.keys(emptyProject).map((key) => [key, project?.[key] ?? emptyProject[key]]),
      ),
    ),
    [remove, setRemove] = useState(false);
  const fields = [
    ['company', 'Company background', 2000],
    ['products', 'Products & what they do', 4000],
    ['audience', 'Who you want to reach', 1500],
    ['voice', 'Voice & visual direction', 1500],
    ['goals', 'Research interests & campaign goals', 2000],
    ['facts', 'Confirmed facts, proof & approved claims', 6000],
    ['restrictions', 'Avoid these topics, claims or promises', 2000],
  ];
  return (
    <form
      className="panel project-editor"
      onSubmit={async (e) => {
        e.preventDefault();
        if (
          await action(
            project ? `/projects/${project.id}` : '/projects',
            project ? 'PUT' : 'POST',
            form,
            'Private project brief saved.',
          )
        )
          onSaved();
      }}
    >
      <div className="panel-heading">
        <h2>{project ? 'Project brief' : 'Create a project'}</h2>
        <span className="deployment-pill deployed">Stored locally</span>
      </div>
      <div className="project-fields">
        <label>
          Project name
          <input
            required
            maxLength={100}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Your company or campaign"
          />
        </label>
        <label>
          Company website
          <input
            type="url"
            maxLength={1200}
            value={form.website}
            onChange={(e) => setForm({ ...form, website: e.target.value })}
            placeholder="https://your-company.com"
          />
        </label>
        {fields.map(([key, label, max]) => (
          <label key={key}>
            {label}
            <textarea
              maxLength={max}
              rows={key === 'facts' ? 5 : 3}
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
            />
          </label>
        ))}
        <label>
          Research sources · one HTTPS page per line
          <textarea
            rows={4}
            value={form.sources.join('\n')}
            onChange={(e) => setForm({ ...form, sources: e.target.value.split('\n') })}
            onBlur={() =>
              setForm({ ...form, sources: form.sources.map((v) => v.trim()).filter(Boolean) })
            }
          />
          <small>
            Up to 8 pages saved. Each assignment reads the website and up to 3 additional pages.
            Workers use bounded excerpts of sources and project fields. Put essential facts first.
            Source failures remain visible in the output.
          </small>
        </label>
      </div>
      <div className="employee-card-actions">
        <button className="button primary" disabled={busy}>
          Save private brief
        </button>
        {project && (
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={async () => {
              if (!remove) {
                setRemove(true);
                return;
              }
              await action(
                `/projects/${project.id}`,
                'DELETE',
                {},
                'Project removed. Existing drafts retain their original evidence.',
              );
            }}
          >
            {' '}
            {remove ? 'Confirm remove project' : 'Remove project'}
          </button>
        )}
      </div>
    </form>
  );
}
function AssignmentForm({ state, action, busy, workerId, projectId }) {
  const deployed = state.workers.filter((w) => w.deployment === 'deployed');
  const [worker, setWorker] = useState(
      workerId || deployed.find((w) => w.id === 'campaign-creative')?.id || deployed[0]?.id || '',
    ),
    [project, setProject] = useState(projectId || ''),
    [kind, setKind] = useState(projectId ? 'campaign' : 'report'),
    [brief, setBrief] = useState(''),
    [skillIds, setSkillIds] = useState([]);
  const employee = state.workers.find((w) => w.id === worker);
  return (
    <form
      className="assignment-form"
      onSubmit={async (e) => {
        e.preventDefault();
        await action(
          '/assignments',
          'POST',
          {
            workerId: worker,
            ...(project ? { projectId: project } : {}),
            kind,
            brief,
            ...(skillIds.length ? { skillIds } : {}),
          },
          'Assignment queued. Follow it under Work.',
        );
      }}
    >
      <div className="assignment-selects">
        {!workerId && (
          <label>
            Employee
            <select
              value={worker}
              onChange={(e) => {
                setWorker(e.target.value);
                setSkillIds([]);
              }}
              required
            >
              <option value="">Choose a deployed employee</option>
              {deployed.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.persona?.fullName || w.name} · {w.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {!projectId && (
          <label>
            Project context
            <select value={project} onChange={(e) => setProject(e.target.value)}>
              <option value="">No project · use the brief only</option>
              {state.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Deliverable
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="report">Research / specialist report</option>
            <option value="campaign" disabled={!project}>
              Campaign posts & visual brief
            </option>
          </select>
        </label>
      </div>
      <label>
        What should the employee create?
        <textarea
          required
          minLength={10}
          maxLength={2000}
          rows={4}
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="Describe the research question, content idea, audience, and what a useful result should contain…"
        />
      </label>
      <details>
        <summary>Choose up to two skills · automatic when empty</summary>
        <div className="assignment-skills">
          {state.skills
            .filter((s) => employee?.skillIds.includes(s.id))
            .map((s) => (
              <label key={s.id}>
                <input
                  type="checkbox"
                  checked={skillIds.includes(s.id)}
                  disabled={!skillIds.includes(s.id) && skillIds.length >= 2}
                  onChange={(e) =>
                    setSkillIds(
                      e.target.checked ? [...skillIds, s.id] : skillIds.filter((id) => id !== s.id),
                    )
                  }
                />
                {s.name}
              </label>
            ))}
        </div>
      </details>
      <button
        className="button primary"
        disabled={
          !worker || employee?.deployment !== 'deployed' || (kind === 'campaign' && !project)
        }
      >
        <Sparkles size={16} /> Start assignment
      </button>
    </form>
  );
}
