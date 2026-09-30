import React, { useEffect, useState } from 'react';
import { Search, FileText, MapPin, ExternalLink, Check, ArrowRight } from 'lucide-react';
import './jobs.css';
import JobPortals from './JobPortals.jsx';

const labels = {
  found: 'Ready to review',
  queued: 'Queued',
  applying: 'Applying',
  submitted: 'Submitted',
  needs_attention: 'Needs your input',
  uncertain: 'Check submission',
  skipped: 'Skipped',
};
const list = (value) =>
  String(value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
export default function JobSearchPage({ api, state, action }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(''),
    [pending, setPending] = useState(false),
    [selected, setSelected] = useState([]),
    [filter, setFilter] = useState('matches'),
    [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const d = await api('/jobs');
        if (active) setData(d);
      } catch (e) {
        if (active) setError(e.message);
      }
    };
    load();
    const timer = setInterval(load, 2500);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [api]);
  async function run(path, method = 'POST', body) {
    setPending(true);
    setError('');
    try {
      await api('/jobs' + path, method, body);
      setData(await api('/jobs'));
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setPending(false);
    }
  }
  if (!data) return <p role="status">Loading your job workspace…{error}</p>;
  const deployed = state.workers.find((w) => w.id === 'job-hunter')?.deployment === 'deployed';
  const busy = pending || data.busy || state.busy;
  const eligible = (j) =>
    data.searchFresh && j.currentMatch && ['found', 'needs_attention'].includes(j.status);
  const selectedJobs = data.jobs.filter((j) => selected.includes(j.id) && eligible(j));
  const jobs = data.jobs.filter(
    (j) => filter === 'all' || (filter === 'matches' ? j.currentMatch : j.status === filter),
  );
  const p = data.preferences;
  const arrayFields = new Set([
    'roles',
    'locations',
    'skills',
    'employmentTypes',
    'excludedCompanies',
    'excludedKeywords',
    'leverBoards',
  ]);
  async function save(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget),
      next = { ...p };
    for (const [key, value] of form)
      if (!['modes', 'sources', 'portals', 'includeUnknown', 'answers'].includes(key))
        next[key] = arrayFields.has(key)
          ? list(value)
          : key === 'maxAgeDays'
            ? Number(value)
            : value;
    next.modes = form.getAll('modes');
    next.sources = form.getAll('sources');
    next.portals = form.getAll('portals');
    next.includeUnknown = form.has('includeUnknown');
    try {
      next.answers = String(form.get('answers') || '')
        .split('\n')
        .filter((s) => s.trim())
        .map((line) => {
          const i = line.indexOf('=');
          if (i < 1) throw new Error('Use Question = Answer, one per line.');
          return { question: line.slice(0, i).trim(), answer: line.slice(i + 1).trim() };
        });
      if (await run('/preferences', 'PUT', next)) setSelected([]);
    } catch (e) {
      setError(e.message);
    }
  }
  async function upload(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setError('Choose a résumé smaller than 5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () =>
      run('/resume', 'POST', { name: file.name, base64: String(reader.result).split(',')[1] });
    reader.onerror = () => setError('The résumé file could not be read.');
    reader.readAsDataURL(file);
    e.target.value = '';
  }
  const field = (key, title, placeholder = '', type = 'text') => (
    <label className="job-field" key={key}>
      {title}
      <input
        name={key}
        type={type}
        defaultValue={Array.isArray(p[key]) ? p[key].join(', ') : p[key]}
        placeholder={placeholder}
      />
    </label>
  );
  return (
    <div className="job-workspace">
      <div className="page-header">
        <div>
          <div className="eyebrow">PERSONAL DEVELOPMENT · JOB HUNTER</div>
          <h1>A new chapter starts here.</h1>
          <p>Your résumé, your preferences, and a considered list of opportunities.</p>
        </div>
      </div>
      <div className="job-intro">
        <span>
          <FileText size={18} /> Private on this computer · Qwen for optional match reviews
        </span>
        <span>Applications use your original résumé.</span>
      </div>
      {(error || data.lastError) && (
        <div className="job-notice error" role="alert">
          {error || data.lastError}
        </div>
      )}
      {!deployed && (
        <div className="job-notice">
          Deploy Job hunter to start searching and applying.{' '}
          <button
            className="button primary"
            disabled={busy}
            onClick={() =>
              action(
                '/workers/job-hunter',
                'PATCH',
                { deployment: 'deployed' },
                'Job hunter deployed.',
              )
            }
          >
            Deploy Job hunter
          </button>
        </div>
      )}
      <div className="job-columns">
        <aside className="job-setup">
          <section className="job-card">
            <div className="eyebrow">01 · YOUR RÉSUMÉ</div>
            <h2>{data.resume?.name || 'Bring your experience.'}</h2>
            <p>PDF, DOCX or TXT · up to 5 MB. A text-based document is required.</p>
            <label className="job-field">
              Upload résumé
              <input
                aria-label="Upload résumé"
                type="file"
                accept=".pdf,.docx,.txt"
                disabled={busy}
                onChange={upload}
              />
            </label>
            {data.resume && (
              <>
                <a href="/api/jobs/resume/download" download>
                  Download saved résumé
                </a>
                <p>
                  Detected skills:{' '}
                  {data.resume.detectedSkills?.join(', ') ||
                    'Add your skills below for a more useful match score.'}
                </p>
                <details>
                  <summary>Check extracted text</summary>
                  <pre className="job-prose">{data.resume.text}</pre>
                </details>
              </>
            )}
          </section>
          <form className="job-card" key={JSON.stringify(p)} onSubmit={save}>
            <div className="eyebrow">02 · YOUR PREFERENCES</div>
            <h2>What comes next?</h2>
            <p>Separate multiple entries with commas. Save changes before searching.</p>
            <fieldset disabled={busy}>
              {field('roles', 'Role titles', 'Frontend, React developer, Software engineer')}
              {field(
                'locations',
                'Locations · cities, countries, or regions',
                'Bengaluru, Mumbai, India',
              )}
              <div className="job-field">
                Work arrangement
                <div className="job-checks">
                  {[
                    ['remote', 'Remote / WFH'],
                    ['hybrid', 'Hybrid'],
                    ['office', 'Office / WFO'],
                  ].map(([v, l]) => (
                    <label key={v}>
                      <input
                        type="checkbox"
                        name="modes"
                        value={v}
                        defaultChecked={p.modes.includes(v)}
                      />
                      {l}
                    </label>
                  ))}
                </div>
              </div>
              {field(
                'skills',
                'Skills · leave blank to use detected résumé skills',
                'React, JavaScript, Python',
              )}
              {field(
                'employmentTypes',
                'Employment types · blank means any',
                'Full time, Contract, Internship',
              )}
              {field('maxAgeDays', 'Maximum posting age in days', '', 'number')}
              <label className="job-check">
                <input type="checkbox" name="includeUnknown" defaultChecked={p.includeUnknown} />
                Include jobs with missing location or work-arrangement details
              </label>
              <details>
                <summary>Salary, eligibility & exclusions</summary>
                {field('salaryNotes', 'Salary preference · flagged for review', 'At least ₹20 LPA')}
                {field(
                  'eligibilityNotes',
                  'Experience, authorization & sponsorship notes',
                  '5 years experience; authorized in India',
                )}
                {field('excludedCompanies', 'Exclude companies')}
                {field(
                  'excludedKeywords',
                  'Exclude words in job descriptions',
                  'unpaid, commission only',
                )}
                <p>
                  Salary, experience, and eligibility notes guide Qwen reviews. They are not
                  automatic eligibility checks.
                </p>
              </details>
              <details open>
                <summary>Where to look</summary>
                <div className="job-checks">
                  {[
                    ['remotive', 'Remotive · remote roles'],
                    ['arbeitnow', 'Arbeitnow · mostly European roles'],
                  ].map(([v, l]) => (
                    <label key={v}>
                      <input
                        type="checkbox"
                        name="sources"
                        value={v}
                        defaultChecked={p.sources.includes(v)}
                      />
                      {l}
                    </label>
                  ))}
                </div>
                <p>Additional portals</p>
                <div className="job-checks job-portal-options">
                  {(data.portalCatalog || []).map((portal) => (
                    <label key={portal.id}>
                      <input
                        type="checkbox"
                        name="portals"
                        value={portal.id}
                        defaultChecked={p.portals?.includes(portal.id)}
                      />
                      {portal.name}
                      {portal.mode === 'unverified' && !p.protocoljobsUrl
                        ? ' · address needed'
                        : ''}
                    </label>
                  ))}
                </div>
                <p>
                  Public portals are read where available. Browser portals require you to open the
                  site and import a chosen job. Applications on these portals are completed
                  manually.
                </p>
                {field('protocoljobsUrl', 'Protocoljobs website address', 'https://…', 'url')}
                {field('leverBoards', 'Lever employer boards', 'company-name, eu:company-name')}
                <p>
                  Use the company part of jobs.lever.co/company-name. Add boards for your preferred
                  employers. These support automatic applications.
                </p>
              </details>
              <details>
                <summary>Your application details</summary>
                {field('fullName', 'Full name')}
                {field('email', 'Email', '', 'email')}
                {field('phone', 'Phone', '', 'tel')}
                {field('currentLocation', 'Where you currently live')}
                {field('currentCompany', 'Current company · optional')}
                {field('linkedin', 'LinkedIn profile URL', '', 'url')}
                {field('portfolio', 'Portfolio URL', '', 'url')}
                <label className="job-field">
                  Optional application note
                  <textarea
                    name="coverLetter"
                    rows="4"
                    defaultValue={p.coverLetter}
                    placeholder="Only include facts you want sent with your applications."
                  />
                </label>
                <label className="job-field">
                  Saved answers · Question = Answer
                  <textarea
                    name="answers"
                    rows="4"
                    defaultValue={p.answers.map((a) => `${a.question} = ${a.answer}`).join('\n')}
                    placeholder="Exact question label = Your answer"
                  />
                </label>
                <p>
                  Unknown questions, consent boxes, and CAPTCHA need your input. No answers or
                  qualifications are invented.
                </p>
              </details>
              <button className="button primary" type="submit">
                <Check size={15} /> Save preferences
              </button>
            </fieldset>
          </form>
        </aside>
        <section className="job-results">
          <div className="job-card">
            <div className="eyebrow">03 · OPPORTUNITIES</div>
            <h2>Find your next role.</h2>
            <p>
              Search the selected feeds and employer boards. Coverage is limited to those sources;
              remote roles may still restrict where you live.
            </p>
            <div className="job-actions">
              <button
                className="button primary"
                disabled={busy || !deployed || !data.resume}
                onClick={() => {
                  setSelected([]);
                  run('/search');
                }}
              >
                <Search size={16} /> Find matching jobs
              </button>
              {data.busy && (
                <button
                  className="button"
                  disabled={pending || data.stopping}
                  onClick={() => run('/stop')}
                >
                  {data.stopping ? 'Stopping…' : 'Stop worker'}
                </button>
              )}
            </div>
            {data.busy && <p role="status">{data.operation}…</p>}
            {data.searchedAt && (
              <p>
                {data.matches} matches from {data.scanned} listings · searched{' '}
                {new Date(data.searchedAt).toLocaleString()}
              </p>
            )}
            {!data.searchFresh && data.searchedAt && (
              <p className="job-notice">Your profile changed. Search again before applying.</p>
            )}
            {!!data.sourceHealth?.length && (
              <details>
                <summary>Source coverage & availability</summary>
                {data.sourceHealth.map((s, i) => (
                  <p key={i}>
                    {s.name}: {s.error || s.message || `${s.count} listings`}
                    {s.cachedAt &&
                      ` · ${s.count} listings · fetched ${new Date(s.cachedAt).toLocaleString()}`}
                  </p>
                ))}
                <p>
                  Remotive results are delayed by 24 hours and cached for six hours. Arbeitnow scans
                  the latest three pages. Each Lever board is capped at 1,000 listings.
                </p>
              </details>
            )}
          </div>
          <div className="job-toolbar">
            <label>
              Show{' '}
              <select
                aria-label="Filter jobs"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="matches">Current matches</option>
                <option value="all">All saved jobs</option>
                {Object.entries(labels)
                  .filter(([k]) =>
                    ['submitted', 'needs_attention', 'uncertain', 'skipped'].includes(k),
                  )
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </select>
            </label>
            <span>{jobs.length} opportunities</span>
          </div>
          {selectedJobs.length > 0 && (
            <div className="job-queue">
              <strong>{selectedJobs.length} selected</strong>
              <p>
                Starting the queue authorizes Job hunter to send your saved details and résumé to
                these employers, one at a time. Chrome, Edge, or Playwright Chromium must be
                installed for Lever applications.
              </p>
              <button
                className="button primary"
                disabled={busy || !deployed || selectedJobs.length > 30}
                onClick={async () => {
                  if (await run('/queue', 'POST', { ids: selectedJobs.map((j) => j.id) }))
                    setSelected([]);
                }}
              >
                Apply to selected jobs <ArrowRight size={16} />
              </button>
            </div>
          )}
          {!jobs.length && (
            <div className="job-empty">
              <Search size={28} />
              <h3>
                {data.searchedAt ? 'No jobs in this view.' : 'Your next opportunity is out there.'}
              </h3>
              <p>
                {data.searchedAt
                  ? 'Try broader role titles or locations, add employer boards, or check source availability.'
                  : 'Upload your résumé, save your preferences, and start a search.'}
              </p>
            </div>
          )}
          {jobs.map((j) => (
            <article className="job-card job-listing" key={j.id}>
              <div className="job-listing-top">
                <span className="eyebrow">{j.company}</span>
                <span className={`job-status ${j.status}`}>{labels[j.status]}</span>
              </div>
              <h3>{j.title}</h3>
              <div className="job-meta">
                <span>
                  <MapPin size={14} /> {j.location || 'Location not stated'}
                </span>
                <span>
                  {
                    {
                      remote: 'Remote',
                      hybrid: 'Hybrid',
                      office: 'Office',
                      unknown: 'Work arrangement unknown',
                    }[j.mode]
                  }
                </span>
              </div>
              <div className="job-fit">
                <strong>{j.match.score}/100</strong>
                <span>
                  Keyword match ·{' '}
                  {j.canAutoApply ? 'Lever application supported' : 'Apply on employer site'}
                </span>
              </div>
              {j.match.reasons.map((r) => (
                <p key={r} className="job-reason">
                  {r}
                </p>
              ))}
              {j.salary && <p>{j.salary}</p>}
              {j.match.gaps.map((g) => (
                <p key={g} className="job-gap">
                  {g}
                </p>
              ))}
              <details>
                <summary>Job description</summary>
                <p className="job-prose">{j.description}</p>
              </details>
              {j.review && (
                <details open>
                  <summary>Qwen match review</summary>
                  <p className="job-prose">{j.review}</p>
                </details>
              )}
              {j.detail && <p className="job-notice">{j.detail}</p>}
              <div className="job-actions">
                <a
                  className="button"
                  href={j.applicationUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open {j.source} listing <ExternalLink size={14} />
                </a>
                <button
                  className="button"
                  disabled={busy || !deployed}
                  onClick={() => run(`/${j.id}/review`)}
                >
                  Review with Qwen
                </button>
              </div>
              <div className="job-actions">
                {eligible(j) && (
                  <label className="job-check">
                    <input
                      type="checkbox"
                      checked={selected.includes(j.id)}
                      disabled={busy}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, j.id]
                            : selected.filter((id) => id !== j.id),
                        )
                      }
                    />
                    Select for application queue
                  </label>
                )}
                {!['submitted', 'applying', 'queued'].includes(j.status) && (
                  <>
                    <button
                      className="job-text-button"
                      disabled={busy}
                      onClick={() => run(`/${j.id}/resolve`, 'POST', { outcome: 'submitted' })}
                    >
                      I submitted this application
                    </button>
                    <button
                      className="job-text-button"
                      disabled={busy}
                      onClick={() => run(`/${j.id}/resolve`, 'POST', { outcome: 'skipped' })}
                    >
                      Skip
                    </button>
                  </>
                )}
                {['uncertain', 'skipped'].includes(j.status) && (
                  <button
                    className="job-text-button"
                    disabled={busy}
                    onClick={() => run(`/${j.id}/resolve`, 'POST', { outcome: 'not_submitted' })}
                  >
                    I checked: not submitted
                  </button>
                )}
              </div>
            </article>
          ))}
        </section>
      </div>
      <JobPortals
        data={data}
        api={api}
        busy={busy}
        refresh={async () => {
          setData(await api('/jobs'));
          setFilter('all');
        }}
      />
      <div className="job-privacy">
        <p>
          Your résumé and profile stay in Butler’s local database until you start an application.
          Qwen reviews run locally. No subscription token or cloud model is used.
        </p>
        {confirmClear ? (
          <>
            <span>Delete your résumé, preferences, and application history from Butler?</span>
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                if (await run('', 'DELETE')) {
                  setSelected([]);
                  setConfirmClear(false);
                }
              }}
            >
              Delete job data
            </button>
            <button className="button" onClick={() => setConfirmClear(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button className="job-text-button" disabled={busy} onClick={() => setConfirmClear(true)}>
            Clear private job data
          </button>
        )}
      </div>
    </div>
  );
}
