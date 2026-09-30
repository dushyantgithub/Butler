import React, { useState } from 'react';
import { ExternalLink } from 'lucide-react';
const empty = {
  url: '',
  title: '',
  company: '',
  location: '',
  description: '',
  mode: 'unknown',
  employment: '',
  salary: '',
};
export default function JobPortals({ data, api, refresh, busy }) {
  const [draft, setDraft] = useState(empty),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState(''),
    [roleIndex, setRoleIndex] = useState(0),
    [locationIndex, setLocationIndex] = useState(0);
  const plans = data.portalSearches || [],
    prefs = data.preferences;
  const role = prefs.roles[roleIndex] || prefs.roles[0] || '',
    location = prefs.locations[locationIndex] || prefs.locations[0] || '';
  async function preview() {
    setPending(true);
    setMessage('');
    try {
      const job = await api('/jobs/portal-preview', 'POST', { url: draft.url });
      setDraft(Object.fromEntries(Object.keys(empty).map((k) => [k, job[k] || empty[k]])));
      setMessage('Details loaded. Check the listing before saving.');
    } catch (e) {
      setMessage(`${e.message} You can copy the details from your browser into this form.`);
    } finally {
      setPending(false);
    }
  }
  async function save(e) {
    e.preventDefault();
    setPending(true);
    setMessage('');
    try {
      const job = await api('/jobs/import', 'POST', draft);
      await refresh();
      setDraft(empty);
      setMessage(
        job.currentMatch
          ? 'Listing saved to your matches. You can review it with Qwen and track your application.'
          : 'Listing saved under All saved jobs. It does not match your current filters.',
      );
    } catch (e) {
      setMessage(e.message);
    } finally {
      setPending(false);
    }
  }
  return (
    <section className="job-card job-portals">
      <div className="eyebrow">MORE PLACES TO LOOK</div>
      <h2>Your job portals.</h2>
      <p>
        Select portals under Where to look and save your preferences. Public readers run with Find
        matching jobs. Browser portals open in your browser; no résumé or account credentials are
        shared automatically.
      </p>
      {!!plans.length && (
        <>
          <div className="job-portal-selectors">
            <label className="job-field">
              Search role
              <select
                aria-label="Search role"
                value={roleIndex}
                onChange={(e) => setRoleIndex(Number(e.target.value))}
              >
                {(prefs.roles.length ? prefs.roles : ['Any role']).map((r, i) => (
                  <option key={i} value={i}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="job-field">
              Search location
              <select
                aria-label="Search location"
                value={locationIndex}
                onChange={(e) => setLocationIndex(Number(e.target.value))}
              >
                {(prefs.locations.length ? prefs.locations : ['Any location']).map((l, i) => (
                  <option key={i} value={i}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {plans.map((p) => {
            const search =
              p.searches.find((s) => s.role === role && s.location === location) || p.searches[0];
            const health = data.sourceHealth?.find((s) => s.portalId === p.id);
            return (
              <div className="job-portal" key={p.id}>
                <div className="job-listing-top">
                  <strong>{p.name}</strong>
                  <span className="job-status">
                    {p.mode === 'feed'
                      ? 'Public feed'
                      : p.mode === 'public'
                        ? 'Public search'
                        : p.mode === 'unverified'
                          ? 'Address needed'
                          : 'Browser search'}
                  </span>
                </div>
                <p>{p.note}</p>
                {health?.message && (
                  <p className={health.status === 'browser_required' ? 'job-gap' : ''}>
                    {health.message}
                  </p>
                )}
                {search && (
                  <>
                    <a
                      className="button"
                      href={search.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Open {p.name} <ExternalLink size={14} />
                    </a>
                    {!search.filtersInLink && (
                      <p>
                        Enter in the portal: <strong>{search.query}</strong>. Your saved filters are
                        not transferred to this portal.
                      </p>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </>
      )}
      <details>
        <summary>Import a chosen job into Butler</summary>
        <p>
          Paste the specific job link and try Read listing. If the portal requires sign-in, copy its
          details below. Saved jobs use the same Qwen review and application history as feed
          results.
        </p>
        <form onSubmit={save}>
          <fieldset disabled={busy || pending}>
            <label className="job-field">
              Job listing URL
              <input
                required
                type="url"
                value={draft.url}
                onChange={(e) => setDraft({ ...draft, url: e.target.value })}
                placeholder="https://…"
              />
            </label>
            <button className="button" type="button" disabled={!draft.url} onClick={preview}>
              Read listing
            </button>
            {['title', 'company', 'location', 'employment', 'salary'].map((k) => (
              <label className="job-field" key={k}>
                {
                  {
                    title: 'Job title',
                    company: 'Company',
                    location: 'Job location',
                    employment: 'Employment type',
                    salary: 'Advertised salary',
                  }[k]
                }
                <input
                  required={['title', 'company'].includes(k)}
                  value={draft[k]}
                  onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                />
              </label>
            ))}
            <label className="job-field">
              Listing work arrangement
              <select
                aria-label="Listing work arrangement"
                value={draft.mode}
                onChange={(e) => setDraft({ ...draft, mode: e.target.value })}
              >
                <option value="unknown">Not stated</option>
                <option value="remote">Remote / WFH</option>
                <option value="hybrid">Hybrid</option>
                <option value="office">Office / WFO</option>
              </select>
            </label>
            <label className="job-field">
              Job description
              <textarea
                required
                minLength={60}
                maxLength={20000}
                rows={6}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </label>
            <button className="button primary" type="submit">
              Save job to Butler
            </button>
          </fieldset>
        </form>
      </details>
      {message && (
        <p className="job-notice" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
