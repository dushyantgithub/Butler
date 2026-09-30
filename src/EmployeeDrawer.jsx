import React, { useRef, useState } from 'react';
import { EmployeeFigure } from './EmployeeFigure.jsx';
import { GripVertical, Search, Users, X } from 'lucide-react';

export default function EmployeeDrawer({
  state,
  busy,
  action,
  close,
  onDragStart,
  onDragEnd,
  onDragMove,
  reducedMotion,
  onDropWorker,
  manage,
  assign,
}) {
  const pointerDrag = useRef(null),
    drawerRef = useRef(null);
  const [search, setSearch] = useState(''),
    [department, setDepartment] = useState('all');
  const workers = (state?.workers || []).filter((worker) => {
    if (department !== 'all' && worker.department !== department) return false;
    const skills = worker.skillIds
      .map((id) => state.skills.find((s) => s.id === id))
      .filter(Boolean);
    return [
      worker.persona?.fullName,
      worker.title,
      worker.name,
      worker.description,
      ...skills.map((s) => s.name),
    ]
      .join(' ')
      .toLowerCase()
      .includes(search.toLowerCase());
  });
  return (
    <aside ref={drawerRef} className="employee-drawer" aria-label="Employee deployment drawer">
      <div className="employee-drawer-heading">
        <div>
          <span>BUILD YOUR TEAM</span>
          <h2>
            <Users size={20} /> Employees
          </h2>
        </div>
        <button onClick={close} aria-label="Close employee drawer">
          <X size={20} />
        </button>
      </div>
      <p className="employee-drawer-intro">
        Drag someone onto the campus to give them a desk in their studio, or tap Deploy.
      </p>
      <label className="drawer-search">
        <Search size={16} />
        <input
          aria-label="Find employees or skills"
          placeholder="Search employees or skills…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <select
        aria-label="Employee department"
        value={department}
        onChange={(e) => setDepartment(e.target.value)}
      >
        <option value="all">All designations & departments</option>
        {state?.departments.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <div className="employee-drawer-summary">
        <span>{workers.length} employees</span>
        <button onClick={manage}>Manage team & bench →</button>
      </div>
      {busy && (
        <p role="status" className="drawer-busy">
          An assignment is running. Deployment changes become available when it finishes.
        </p>
      )}
      <div className="employee-drawer-list">
        {workers.map((worker) => {
          const dept = state.departments.find((d) => d.id === worker.department);
          const skills = worker.skillIds
            .map((id) => state.skills.find((s) => s.id === id))
            .filter(Boolean);
          const deployed = worker.deployment === 'deployed';
          return (
            <article
              key={worker.id}
              className={'drawer-employee ' + (deployed ? 'deployed' : '')}
              draggable={!busy && !deployed}
              onDragStart={(e) => {
                if (busy || deployed) {
                  e.preventDefault();
                  return;
                }
                e.dataTransfer.setData('application/x-butler-worker', worker.id);
                e.dataTransfer.setData('text/plain', worker.id);
                e.dataTransfer.effectAllowed = 'copy';
                const blank = document.createElement('canvas');
                blank.width = blank.height = 1;
                e.dataTransfer.setDragImage(blank, 0, 0);
                onDragStart(worker.id, e.clientX, e.clientY);
              }}
              onDrag={(event) => {
                if (event.clientX || event.clientY) onDragMove(event.clientX, event.clientY);
              }}
              onDragEnd={onDragEnd}
              aria-label={worker.name + ' employee card'}
            >
              <div className="drawer-employee-title">
                <button
                  type="button"
                  className="drawer-drag-handle drawer-character"
                  aria-label={'Drag ' + worker.name + ' into office'}
                  disabled={busy || deployed}
                  onPointerDown={(event) => {
                    if (event.button !== 0 || busy || deployed) return;
                    event.preventDefault();
                    event.currentTarget.setPointerCapture(event.pointerId);
                    pointerDrag.current = {
                      id: worker.id,
                      x: event.clientX,
                      y: event.clientY,
                      moved: false,
                    };
                  }}
                  onPointerMove={(event) => {
                    const drag = pointerDrag.current;
                    if (
                      drag &&
                      !drag.moved &&
                      Math.hypot(event.clientX - drag.x, event.clientY - drag.y) > 8
                    ) {
                      drag.moved = true;
                      onDragStart(drag.id, event.clientX, event.clientY);
                    }
                    if (drag?.moved) onDragMove(event.clientX, event.clientY);
                  }}
                  onPointerUp={(event) => {
                    const drag = pointerDrag.current;
                    pointerDrag.current = null;
                    if (
                      drag?.moved &&
                      event.clientX < drawerRef.current.getBoundingClientRect().left
                    )
                      onDropWorker(drag.id, event.clientX, event.clientY);
                    onDragEnd();
                    if (event.currentTarget.hasPointerCapture(event.pointerId))
                      event.currentTarget.releasePointerCapture(event.pointerId);
                  }}
                  onPointerCancel={() => {
                    pointerDrag.current = null;
                    onDragEnd();
                  }}
                >
                  <EmployeeFigure worker={worker} reducedMotion={reducedMotion} />
                  <span className="figure-grab-cue">
                    <GripVertical size={12} />
                    {deployed ? 'At work' : 'Drag me'}
                  </span>
                </button>
                <div className="drawer-designation">
                  <small>{dept?.name}</small>
                  <h3>{worker.persona?.fullName || worker.name}</h3>
                  <span className="employee-wave-hint">
                    {worker.title}
                    {worker.head ? ' · Head' : ''}
                  </span>
                </div>
              </div>
              <p>{worker.persona?.traits?.join(' · ') || worker.description}</p>
              <div className="drawer-skill-chips">
                {skills.slice(0, 3).map((skill) => (
                  <span key={skill.id}>{skill.name}</span>
                ))}
              </div>
              <details>
                <summary>{skills.length} skills · view all</summary>
                <ul>
                  {skills.map((skill) => (
                    <li key={skill.id}>{skill.name}</li>
                  ))}
                </ul>
              </details>
              <div className="drawer-employee-actions">
                <span className={'deployment-pill ' + worker.deployment}>
                  {deployed
                    ? 'In the office'
                    : worker.deployment === 'bench'
                      ? 'On the bench'
                      : 'Not deployed'}
                </span>
                {deployed ? (
                  <>
                    <button
                      disabled={busy}
                      onClick={() =>
                        action(
                          '/workers/' + worker.id,
                          'PATCH',
                          { deployment: 'bench' },
                          (worker.persona?.firstName || worker.name) + ' is on the bench.',
                        )
                      }
                    >
                      Bench
                    </button>
                    <button onClick={() => assign(worker.id)}>Assign work</button>
                  </>
                ) : (
                  <button
                    disabled={busy}
                    onClick={() =>
                      action(
                        '/workers/' + worker.id,
                        'PATCH',
                        { deployment: 'deployed' },
                        (worker.persona?.firstName || worker.name) +
                          ' is deployed and ready for work.',
                      )
                    }
                  >
                    Deploy
                  </button>
                )}
              </div>
            </article>
          );
        })}
        {!workers.length && (
          <p className="employee-drawer-intro">No employees match this search.</p>
        )}
      </div>
    </aside>
  );
}
