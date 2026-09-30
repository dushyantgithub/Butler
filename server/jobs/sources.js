import * as cheerio from 'cheerio';
import { createHash } from 'node:crypto';
import { publicWebsite } from '../projects.js';

const clean = (value) =>
  cheerio
    .load(String(value || ''))
    .text()
    .replace(/\s+/g, ' ')
    .trim();
export function leverTarget(value) {
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.port || u.username || u.password) return null;
    if (!['jobs.lever.co', 'jobs.eu.lever.co'].includes(u.hostname)) return null;
    const m = u.pathname.match(/^\/([a-z0-9_-]+)\/([a-f0-9-]{36})(?:\/apply)?\/?$/i);
    return m
      ? {
          host: u.hostname,
          site: m[1],
          posting: m[2],
          url: `https://${u.hostname}/${m[1]}/${m[2]}/apply`,
        }
      : null;
  } catch {
    return null;
  }
}
export function normalizeJob(raw) {
  const parsedURL = new URL(publicWebsite(raw.url));
  parsedURL.hash = '';
  for (const key of [...parsedURL.searchParams.keys()])
    if (/^(utm_|source$|ref$)/i.test(key)) parsedURL.searchParams.delete(key);
  if (
    /(^|\.)linkedin\.com$/.test(parsedURL.hostname) &&
    /\/jobs\/view\//.test(parsedURL.pathname)
  ) {
    const id = parsedURL.pathname.match(/(?:-|\/)(\d+)\/?$/)?.[1];
    if (id) {
      parsedURL.hostname = 'www.linkedin.com';
      parsedURL.pathname = '/jobs/view/' + id;
      parsedURL.search = '';
    }
  }
  if (/(^|\.)indeed\.com$/.test(parsedURL.hostname) && parsedURL.searchParams.get('jk')) {
    const key = parsedURL.searchParams.get('jk');
    parsedURL.pathname = '/viewjob';
    parsedURL.search = '';
    parsedURL.searchParams.set('jk', key);
  }
  const targetURL = leverTarget(parsedURL.href);
  const url = targetURL ? targetURL.url.replace(/\/apply$/, '') : parsedURL.href;
  const target = leverTarget(url);
  return {
    ...raw,
    title: clean(raw.title).slice(0, 240),
    company: clean(raw.company).slice(0, 160),
    location: clean(raw.location).slice(0, 400),
    description: clean(raw.description).slice(0, 20000),
    url,
    id: createHash('sha256').update(url.replace(/\/$/, '')).digest('hex').slice(0, 32),
    applicationUrl: target?.url || url,
    canAutoApply: Boolean(target),
    fetchedAt: new Date().toISOString(),
  };
}
export async function fetchJSON(url, fetcher = fetch, signal) {
  const response = await fetcher(url, {
    redirect: 'error',
    headers: { Accept: 'application/json', 'User-Agent': 'ButlerLocal/1.0' },
    signal: AbortSignal.any([AbortSignal.timeout(25000), ...(signal ? [signal] : [])]),
  });
  if (!response.ok)
    throw new Error(`Job source returned HTTP ${response.status}. Try again later.`);
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    if (size > 12_000_000) throw new Error('Job source response exceeded the size limit.');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
export async function discoverJobs(prefs, get, cache = new Map(), signal) {
  get ||= (url) => fetchJSON(url, fetch, signal);
  const jobs = [],
    sources = [];
  async function collect(name, url, map, ttl) {
    signal?.throwIfAborted();
    try {
      let entry = cache.get(url);
      if (!entry || Date.now() - entry.at > ttl) {
        entry = { at: Date.now(), data: await get(url) };
        cache.set(url, entry);
      }
      const rows = map(entry.data),
        valid = [];
      for (const row of rows) {
        try {
          valid.push(normalizeJob(row));
        } catch {}
      }
      jobs.push(...valid);
      sources.push({ name, count: valid.length, cachedAt: new Date(entry.at).toISOString() });
    } catch {
      signal?.throwIfAborted();
      sources.push({
        name,
        count: 0,
        error: 'Could not read this source. Other sources may still have results.',
      });
    }
  }
  if (prefs.sources.includes('remotive'))
    await collect(
      'Remotive',
      'https://remotive.com/api/remote-jobs',
      (d) =>
        (d.jobs || []).map((j) => ({
          title: j.title,
          company: j.company_name,
          location: j.candidate_required_location,
          mode: 'remote',
          employment: j.job_type || '',
          description: j.description,
          url: j.url,
          source: 'Remotive',
          postedAt: j.publication_date,
          salary: j.salary || '',
        })),
      6 * 3600000,
    );
  if (prefs.sources.includes('arbeitnow')) {
    for (let page = 1; page <= 3; page++)
      await collect(
        `Arbeitnow · page ${page}`,
        `https://www.arbeitnow.com/api/job-board-api?page=${page}`,
        (d) =>
          (d.data || []).map((j) => ({
            title: j.title,
            company: j.company_name,
            location: j.location,
            mode: j.remote ? 'remote' : 'unknown',
            employment: (j.job_types || []).join(', '),
            description: j.description,
            url: j.url,
            source: 'Arbeitnow',
            postedAt: j.created_at ? new Date(j.created_at * 1000).toISOString() : null,
            salary: '',
          })),
        3600000,
      );
  }
  for (const board of prefs.leverBoards) {
    const [region, site] = board.includes(':') ? board.split(':') : ['global', board];
    for (let skip = 0; skip < 1000; skip += 100) {
      let count = 0;
      await collect(
        `Lever · ${board} · ${skip / 100 + 1}`,
        `https://api${region === 'eu' ? '.eu' : ''}.lever.co/v0/postings/${site}?mode=json&skip=${skip}&limit=100`,
        (d) => {
          if (!Array.isArray(d)) throw new Error('Invalid listings');
          count = d.length;
          return d.map((j) => ({
            title: j.text,
            company: site,
            location: (j.categories?.allLocations || [j.categories?.location])
              .filter(Boolean)
              .join(' / '),
            mode:
              { 'on-site': 'office', remote: 'remote', hybrid: 'hybrid' }[j.workplaceType] ||
              'unknown',
            employment: j.categories?.commitment || '',
            description: [
              j.descriptionPlain,
              ...(j.lists || []).map((l) => `${l.text}: ${clean(l.content)}`),
              j.additionalPlain,
            ].join('\n'),
            url: j.hostedUrl,
            source: 'Lever',
            postedAt: null,
            salary: j.salaryRange
              ? `${j.salaryRange.currency} ${j.salaryRange.min}–${j.salaryRange.max} / ${j.salaryRange.interval}`
              : '',
          }));
        },
        15 * 60000,
      );
      if (count < 100) break;
    }
  }
  return { jobs: [...new Map(jobs.map((j) => [j.id, j])).values()], sources };
}
const lower = (v) => String(v || '').toLowerCase();
export function matchJob(job, prefs, resume) {
  const title = lower(job.title),
    text = lower(`${job.title} ${job.description}`),
    reasons = [],
    gaps = [];
  if (!prefs.roles.some((r) => title.includes(lower(r)))) return null;
  if (prefs.excludedCompanies.some((c) => lower(job.company).includes(lower(c)))) return null;
  if (prefs.excludedKeywords.some((k) => text.includes(lower(k)))) return null;
  if (job.mode === 'unknown') {
    if (!prefs.includeUnknown) return null;
    gaps.push('Work arrangement is not stated.');
  } else if (!prefs.modes.includes(job.mode)) return null;
  const location = lower(job.location);
  const worldwide = /^(worldwide|anywhere|global|remote worldwide)$/i.test(job.location.trim());
  if (
    prefs.locations.length &&
    !prefs.locations.some((l) => location.includes(lower(l))) &&
    !(job.mode === 'remote' && worldwide)
  ) {
    if (location && location !== 'remote') return null;
    if (!prefs.includeUnknown) return null;
    gaps.push('Location eligibility needs checking.');
  }
  if (
    prefs.employmentTypes.length &&
    !prefs.employmentTypes.some((t) =>
      lower(job.employment).replace(/[_ -]/g, '').includes(lower(t).replace(/[_ -]/g, '')),
    )
  ) {
    if (job.employment || !prefs.includeUnknown) return null;
    gaps.push('Employment type is not stated.');
  }
  if (job.postedAt && Date.now() - new Date(job.postedAt).getTime() > prefs.maxAgeDays * 86400000)
    return null;
  if (job.summaryOnly)
    gaps.push(
      'Only a search summary is available. Import the full listing before relying on the skill score.',
    );
  if (!job.postedAt) gaps.push('Posting date is unavailable; check the vacancy is still open.');
  const skills = (prefs.skills.length ? prefs.skills : resumeSkills(resume)).filter((s) =>
    lower(resume).includes(lower(s)),
  );
  const matched = skills.filter((s) => text.includes(lower(s)));
  reasons.push(
    `Matches a saved role: ${prefs.roles.filter((r) => title.includes(lower(r))).join(', ')}`,
  );
  if (matched.length) reasons.push(`Résumé skills mentioned: ${matched.join(', ')}`);
  if (prefs.salaryNotes)
    gaps.push('Compare the advertised salary with your saved salary preference.');
  if (prefs.eligibilityNotes)
    gaps.push('Check work authorization and sponsorship against your saved notes.');
  const score = Math.min(
    100,
    50 +
      (skills.length ? Math.round((40 * matched.length) / skills.length) : 0) +
      (gaps.length ? 0 : 10),
  );
  return { score, reasons, gaps, matchedSkills: matched };
}

export function resumeSkills(text) {
  const candidates = [
    'JavaScript',
    'TypeScript',
    'React',
    'Node.js',
    'Python',
    'Java',
    'C++',
    'C#',
    'SQL',
    'PostgreSQL',
    'MongoDB',
    'Redis',
    'AWS',
    'Azure',
    'Docker',
    'Kubernetes',
    'Terraform',
    'Git',
    'Linux',
    'HTML',
    'CSS',
    'Angular',
    'Vue',
    'Django',
    'Flask',
    'Spring',
    'Swift',
    'Kotlin',
    'Flutter',
    'Figma',
    'Excel',
    'Power BI',
    'Tableau',
    'Salesforce',
    'HubSpot',
    'SEO',
    'Copywriting',
    'Content marketing',
    'Project management',
    'Product management',
    'Customer support',
    'Accounting',
    'Financial analysis',
    'Recruiting',
    'Operations',
    'Data analysis',
    'Machine learning',
    'Deep learning',
    'TensorFlow',
    'PyTorch',
    'Communication',
    'Leadership',
    'Negotiation',
  ];
  const value = String(text).toLowerCase();
  return candidates.filter((skill) => {
    const escaped = skill.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`).test(value);
  });
}
