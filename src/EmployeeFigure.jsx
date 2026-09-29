import React, {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { registerEmployeePreview } from './game/employee-previews.js';
import { employeeAppearance } from './game/employee-figure.js';

export const EmployeeMotionContext = createContext(false);

export function EmployeeFigure({ worker, mode = 'idle', reducedMotion = false }) {
  const officeMotion = useContext(EmployeeMotionContext);
  const canvas = useRef(),
    registration = useRef(),
    [ready, setReady] = useState(false),
    [hover, setHover] = useState(false);
  const [systemMotion, setSystemMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    const listener = () => setSystemMotion(m.matches);
    m.addEventListener('change', listener);
    return () => m.removeEventListener('change', listener);
  }, []);
  useEffect(() => {
    try {
      registration.current = registerEmployeePreview(canvas.current, worker, () => setReady(true));
    } catch {
      setReady(false);
    }
    return () => {
      registration.current?.remove();
      registration.current = null;
    };
  }, [worker.id, worker.department]);
  useEffect(() => {
    registration.current?.update(
      mode === 'idle' && hover ? 'hover' : mode,
      reducedMotion || systemMotion || officeMotion,
    );
  }, [mode, hover, reducedMotion, systemMotion, officeMotion, worker.id]);
  useEffect(() => {
    const card =
      canvas.current.closest('.drawer-employee,.employee-card') || canvas.current.parentElement;
    const enter = () => setHover(true),
      leave = () => setHover(false);
    card.addEventListener('pointerenter', enter);
    card.addEventListener('pointerleave', leave);
    card.addEventListener('focusin', enter);
    card.addEventListener('focusout', leave);
    return () => {
      card.removeEventListener('pointerenter', enter);
      card.removeEventListener('pointerleave', leave);
      card.removeEventListener('focusin', enter);
      card.removeEventListener('focusout', leave);
    };
  }, []);
  const look = employeeAppearance(worker);
  return (
    <span className="employee-figure" style={{ '--figure-color': look.color }}>
      <span className="figure-plinth" aria-hidden="true" />
      <canvas
        ref={canvas}
        className={ready ? 'figure-canvas ready' : 'figure-canvas'}
        role="img"
        aria-label={'Full 3D brick employee: ' + worker.name}
      />
      {!ready && (
        <svg className="figure-fallback" viewBox="0 0 100 140" aria-hidden="true">
          <rect x="27" y="105" width="19" height="30" rx="3" fill="#354358" />
          <rect x="54" y="105" width="19" height="30" rx="3" fill="#354358" />
          <path d="M28 57h44l8 51H20z" fill={look.color} />
          <rect x="8" y="61" width="15" height="40" rx="5" fill={look.color} />
          <rect x="77" y="61" width="15" height="40" rx="5" fill={look.color} />
          <circle cx="15" cy="104" r="8" fill="#f5c94f" />
          <circle cx="85" cy="104" r="8" fill="#f5c94f" />
          <rect x="29" y="15" width="42" height="39" rx="12" fill="#f5c94f" />
          <rect x="27" y="9" width="46" height="16" rx="7" fill={look.hair} />
          <circle cx="41" cy="34" r="2" />
          <circle cx="59" cy="34" r="2" />
          <path d="M43 43q7 6 14 0" fill="none" stroke="#493f35" strokeWidth="2" />
        </svg>
      )}
    </span>
  );
}

export const EmployeeDragPreview = forwardRef(function EmployeeDragPreview({ reducedMotion }, ref) {
  const [visual, setVisual] = useState(null),
    position = useRef({ x: 0, y: 0 }),
    host = useRef(),
    phase = useRef('idle'),
    timer = useRef();
  const place = () => {
    if (host.current)
      host.current.style.transform =
        'translate3d(' + (position.current.x - 85) + 'px,' + (position.current.y - 105) + 'px,0)';
  };
  const finish = (success) => {
    phase.current = success ? 'landing' : 'cancelled';
    setVisual((v) => (v ? { ...v, phase: phase.current } : null));
    clearTimeout(timer.current);
    timer.current = setTimeout(
      () => {
        setVisual(null);
        phase.current = 'idle';
      },
      reducedMotion ? 150 : 700,
    );
  };
  useImperativeHandle(
    ref,
    () => ({
      start(worker, x, y) {
        clearTimeout(timer.current);
        position.current = { x, y };
        phase.current = 'drag';
        setVisual({ worker, phase: 'drag' });
      },
      move(x, y) {
        if (Number.isFinite(x) && Number.isFinite(y)) {
          position.current = { x, y };
          place();
        }
      },
      release() {
        phase.current = 'waiting';
        setVisual((v) => (v ? { ...v, phase: 'waiting' } : null));
      },
      complete: finish,
      cancel() {
        if (phase.current === 'drag') finish(false);
      },
      clear() {
        clearTimeout(timer.current);
        setVisual(null);
        phase.current = 'idle';
      },
    }),
    [reducedMotion],
  );
  useEffect(place, [visual?.worker.id]);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!visual) return null;
  return (
    <div
      ref={host}
      className={'employee-drag-preview ' + visual.phase + (reducedMotion ? ' reduced' : '')}
      aria-hidden="true"
    >
      <div className="drag-figure-lift">
        <EmployeeFigure worker={visual.worker} mode={visual.phase} reducedMotion={reducedMotion} />
      </div>
      <span className="drag-employee-caption">
        {visual.phase === 'waiting'
          ? 'Taking a desk…'
          : visual.phase === 'landing'
            ? 'Ready for work!'
            : visual.worker.name}
      </span>
      <i className="drag-landing-ring" />
    </div>
  );
});
