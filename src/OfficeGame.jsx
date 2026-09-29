import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  Coffee,
  FileText,
  Flag,
  Globe2,
  History,
  Home,
  Minus,
  Plus,
  RotateCcw,
  Settings2,
  Sparkles,
  VolumeX,
  X,
} from 'lucide-react';
import { createOfficeWorld } from './game/world.js';
import './game/game.css';

function ToyPortrait({ person }) {
  return (
    <span className={`toy-portrait toy-${person}`}>
      <i className="toy-hair" />
      <i className="toy-face">
        <b />
        <b />
        <em />
      </i>
      <i className="toy-shirt" />
    </span>
  );
}
export default function OfficeGame({
  state,
  model,
  busy,
  error,
  action,
  navigate,
  openDraft,
  children,
  panel,
  closePanel,
}) {
  const host = useRef(),
    world = useRef(),
    latest = useRef({ navigate, openDraft, state });
  latest.current = { navigate, openDraft, state };
  const [activity, setActivity] = useState({}),
    [selected, setSelected] = useState(null),
    [worldError, setWorldError] = useState(''),
    [motion, setMotion] = useState(
      () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    ),
    [help, setHelp] = useState(false),
    [time, setTime] = useState(new Date());
  useEffect(() => {
    try {
      world.current = createOfficeWorld(host.current, {
        onSelect(id) {
          if (id === 'boss') latest.current.navigate('drafts');
          else if (id === 'coffee') setSelected('coffee');
          else setSelected(id);
        },
        onActivity: setActivity,
      });
      world.current.setReducedMotion(motion);
    } catch (e) {
      setWorldError(
        'The 3D office could not start. Enable hardware acceleration in your browser, then reload. Your files are still available in the desk menu.',
      );
    }
    const timer = setInterval(() => setTime(new Date()), 10000);
    return () => {
      clearInterval(timer);
      world.current?.dispose();
    };
  }, []);
  useEffect(() => {
    if (state) world.current?.update(state);
  }, [state]);
  useEffect(() => {
    const listener = (e) => {
      if (e.key === 'Escape') {
        closePanel();
        setSelected(null);
        setHelp(false);
      }
    };
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, [closePanel]);
  const reviews =
    state?.drafts.filter((d) => ['review', 'attention', 'approved'].includes(d.status)) || [];
  const visitor = state?.drafts.find((d) => d.id === activity.approval);
  const working = state
    ? Object.values(state.agents).filter((a) => a.status === 'working').length
    : 0;
  const headings = {
    drafts: 'The boss’s desk',
    activity: 'The office journal',
    sources: 'Scout’s source library',
    settings: 'Office preferences',
  };
  const selectedAgent = selected && state?.agents[selected];
  return (
    <main className="game-shell">
      <header className="game-topbar">
        <button className="game-brand" onClick={closePanel} aria-label="Return to office">
          <span className="brick-logo">
            <i />
            <i />
          </span>
          <span>
            butler<span className="game-brand-sub">YOUR LITTLE OFFICE WORLD</span>
          </span>
          <b>ALPHA</b>
        </button>
        <div className="game-workspace">
          <span className="game-live-dot" />
          {state?.settings.officeName || 'Opening the office…'}
          <span className="world-divider" />
          <span>
            Day{' '}
            {state
              ? Math.max(
                  1,
                  Math.floor(
                    (Date.now() - Date.parse(state.tasks.at(-1)?.started_at || new Date())) /
                      86400000,
                  ) + 1,
                )
              : 1}
          </span>
        </div>
        <div className="game-top-actions">
          <button
            onClick={() => navigate('activity')}
            title="Office journal"
            aria-label="Office journal"
          >
            <History size={18} />
          </button>
          <button
            onClick={() => navigate('sources')}
            title="Source library"
            aria-label="Source library"
          >
            <BookOpen size={18} />
          </button>
          <button
            onClick={() => navigate('settings')}
            title="Office settings"
            aria-label="Office settings"
          >
            <Settings2 size={18} />
          </button>
          <span className="topbar-boss">
            <ToyPortrait person="boss" />
            <span>THE BOSS</span>
          </span>
        </div>
      </header>
      <section className="game-stage" aria-label="Your living office">
        <div className="game-world" ref={host} />
        <div className="office-location">
          <span>WELCOME TO THE OFFICE</span>
          <h1>
            A small team.
            <br />A world of possibilities.
          </h1>
          <p>Pull up a chair, boss. We’ve got work to do.</p>
        </div>
        <div className="game-clock">
          <span className="sun-icon">☀</span>
          <div>
            <strong>{time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</strong>
            <small>{time.toLocaleDateString([], { weekday: 'long' })} · Office open</small>
          </div>
        </div>
        <div className="game-legend">
          <span>
            <i className="legend-scout" />
            Research
          </span>
          <span>
            <i className="legend-quinn" />
            Social studio
          </span>
          <span>
            <i className="legend-boss" />
            Your chamber
          </span>
        </div>
        {worldError && (
          <div className="game-error" role="alert">
            {worldError}
            <button onClick={() => navigate('drafts')}>Open the desk</button>
          </div>
        )}
        {error && (
          <div className="game-error" role="alert">
            {error}
          </div>
        )}
        {visitor && !panel && (
          <button className="visitor-request" onClick={() => openDraft(visitor.id)}>
            <ToyPortrait person="manager" />
            <span>
              <small>QUINN IS AT YOUR DOOR</small>
              <strong>“Got a minute, boss?”</strong>
              <span>
                {visitor.editorial?.status === 'ready'
                  ? 'Your polished draft is ready for a look.'
                  : 'There’s a draft on your desk to discuss.'}
              </span>
            </span>
            <ArrowRight size={18} />
            <i />
          </button>
        )}
        {activity.scene && !panel && (
          <div className="scene-caption">
            <span className="game-live-dot" />
            <span>{activity.scene}</span>
          </div>
        )}
        <div className="game-camera">
          <button onClick={() => world.current?.zoom(0.16)} aria-label="Zoom in" title="Zoom in">
            <Plus size={17} />
          </button>
          <button onClick={() => world.current?.zoom(-0.16)} aria-label="Zoom out" title="Zoom out">
            <Minus size={17} />
          </button>
          <span />
          <button
            onClick={() => world.current?.resetCamera()}
            aria-label="Reset camera"
            title="Reset camera"
          >
            <Home size={16} />
          </button>
        </div>
        <div className="game-controls-hint">
          <span>DRAG TO LOOK AROUND</span>
          <i>·</i>
          <span>SCROLL TO ZOOM</span>
          <i>·</i>
          <span>CLICK TO SAY HELLO</span>
        </div>
        <div className="world-tools">
          <button
            onClick={() => {
              setMotion(!motion);
              world.current?.setReducedMotion(!motion);
            }}
            aria-pressed={motion}
            title="Reduce animation"
          >
            {motion ? 'Gentle motion on' : 'Gentle motion'}
          </button>
          <button onClick={() => setHelp(!help)} aria-label="How the office works">
            ?
          </button>
        </div>
      </section>
      <footer className="game-bottom-bar">
        <div className="team-status">
          <div className="team-label">
            <span>ON THE FLOOR</span>
            <small>{working ? `${working} on assignment` : 'The team is taking a breather'}</small>
          </div>
          {['researcher', 'manager'].map((id) => (
            <button className="game-team-member" key={id} onClick={() => setSelected(id)}>
              <ToyPortrait person={id} />
              <span>
                <strong>
                  {id === 'researcher' ? 'Scout' : 'Quinn'}
                  <i className={state?.agents[id].status === 'working' ? 'working' : ''} />
                </strong>
                <small>{activity[id] || 'Settling in…'}</small>
              </span>
            </button>
          ))}
        </div>
        <div className="game-primary-actions">
          <button className="game-inbox" onClick={() => navigate('drafts')}>
            <FileText size={18} />
            <span>Your desk</span>
            <b>{reviews.length}</b>
          </button>
          {state?.busy ? (
            <button
              className="game-assign stop"
              disabled={(busy && !state?.busy) || state?.stopping}
              onClick={() =>
                action('/stop', 'POST', {}, 'The team will finish the current operation and stop.')
              }
            >
              Stop assignment
            </button>
          ) : (
            <button
              className="game-assign"
              disabled={busy || !state}
              onClick={() =>
                action('/scan', 'POST', {}, 'Scout has a new assignment. Watch the research desk.')
              }
            >
              <Plus size={18} />
              New assignment
            </button>
          )}
        </div>
      </footer>
      <div className="game-status-line">
        <span>
          <span className="game-live-dot" />
          {model?.loaded
            ? 'Local brain is working'
            : model?.online
              ? 'Local brain is resting'
              : 'Local engine not connected'}
          <i>·</i>
          {state?.settings.autoPublish
            ? 'Automatic publishing enabled'
            : 'You approve before anything goes live'}
        </span>
        <span>
          Built little. Think big. <b>butler & co.</b>
        </span>
      </div>
      {selected && !panel && (
        <div className="game-dialog-backdrop" onClick={() => setSelected(null)}>
          <section
            className="character-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={
              selected === 'coffee'
                ? 'The coffee club'
                : `Talk to ${selected === 'researcher' ? 'Scout' : 'Quinn'}`
            }
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="game-dialog-close"
              aria-label="Close conversation"
              onClick={() => setSelected(null)}
            >
              <X size={18} />
            </button>
            {selected === 'coffee' ? (
              <>
                <div className="coffee-dialog-icon">
                  <Coffee size={34} />
                </div>
                <span className="game-eyebrow">THE COFFEE CLUB</span>
                <h2>Good ideas need little breaks.</h2>
                <p>
                  When the work is done, Scout and Quinn wander, grab a coffee, or unwind in the
                  lounge. A new assignment brings them back to their desks.
                </p>
              </>
            ) : (
              <>
                <ToyPortrait person={selected} />
                <span className="game-eyebrow">
                  {selected === 'researcher' ? 'AI NEWS RESEARCHER' : 'SOCIAL MEDIA MANAGER'}
                </span>
                <h2>
                  {selected === 'researcher' ? 'Hey boss, Scout here.' : 'Hey boss, I’m Quinn.'}
                </h2>
                <p>
                  {selectedAgent?.status === 'working'
                    ? selectedAgent.current
                    : selected === 'researcher'
                      ? 'I’ll read the latest announcements, put together a proper brief, and walk the file over to Quinn.'
                      : 'I turn Scout’s research into a story worth reading. When it’s ready, I’ll bring the draft to your chamber.'}
                </p>
                <div className="conversation-status">
                  <i className={selectedAgent?.status} />
                  {selectedAgent?.status === 'working'
                    ? 'On assignment'
                    : activity[selected] || 'Ready when you are'}
                </div>
                <button
                  className="game-assign"
                  disabled={busy && selected === 'researcher'}
                  onClick={() => {
                    setSelected(null);
                    if (selected === 'researcher')
                      action('/scan', 'POST', {}, 'Scout is heading to the research desk.');
                    else navigate('drafts');
                  }}
                >
                  {selected === 'researcher' ? 'Find me a good AI story' : 'Let’s see the drafts'}
                  <ArrowRight size={16} />
                </button>
              </>
            )}
          </section>
        </div>
      )}
      {help && !panel && (
        <div className="game-dialog-backdrop" onClick={() => setHelp(false)}>
          <section
            className="character-dialog howto"
            role="dialog"
            aria-modal="true"
            aria-label="How the office works"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="game-dialog-close"
              aria-label="Close help"
              onClick={() => setHelp(false)}
            >
              <X size={18} />
            </button>
            <span className="game-eyebrow">A LITTLE OFFICE, REAL WORK</span>
            <h2>You’re in charge here.</h2>
            <ol>
              <li>
                <strong>Give Scout an assignment.</strong> He reads approved sources at his
                computer.
              </li>
              <li>
                <strong>Follow the file.</strong> Scout delivers the research to Quinn, who writes
                and reviews the posts.
              </li>
              <li>
                <strong>Answer the knock.</strong> Quinn brings the draft to your chamber. Review it
                or ask for a rewrite.
              </li>
              <li>
                <strong>Approve and send.</strong> Quinn returns to the computer and publishes to
                connected accounts.
              </li>
            </ol>
            <p>
              Walking and breaks are visual. Sources, assignments, drafts, approvals and publishing
              receipts are real.
            </p>
            <button
              className="game-assign"
              onClick={() => {
                world.current?.replay();
                setHelp(false);
              }}
            >
              Preview a file handoff
              <ArrowRight size={16} />
            </button>
            <small>Animation only. No research or posts are created.</small>
          </section>
        </div>
      )}
      {panel && (
        <div className="game-overlay" role="dialog" aria-modal="true" aria-label={headings[panel]}>
          <div className="game-overlay-top">
            <button onClick={closePanel}>
              <span>←</span>Back to the office
            </button>
            <span>
              <BriefcaseBusiness size={16} />
              {headings[panel]}
            </span>
            <button aria-label="Close desk" onClick={closePanel}>
              <X size={20} />
            </button>
          </div>
          <div className="game-overlay-content">{children}</div>
        </div>
      )}
    </main>
  );
}
