import * as cheerio from 'cheerio';
import { JOB_PORTALS, portalPlans } from '../../shared/job-portals.js';
import { readPublicPage, publicWebsite } from '../projects.js';
import { fetchJSON, normalizeJob } from './sources.js';
const text = (v) =>
  cheerio
    .load(String(v || ''))
    .text()
    .replace(/\s+/g, ' ')
    .trim();
const array = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
export function portalForURL(value) {
  const u = new URL(publicWebsite(value));
  return JOB_PORTALS.find(
    (p) =>
      p.url &&
      (u.hostname === new URL(p.url).hostname ||
        u.hostname.endsWith('.' + new URL(p.url).hostname.replace(/^www\./, '')) ||
        u.hostname === new URL(p.url).hostname.replace(/^www\./, '')),
  );
}
function address(location) {
  return array(location)
    .map((l) => {
      const a = l?.address || l;
      return typeof a === 'string'
        ? a
        : [
            a?.addressLocality,
            a?.addressRegion,
            typeof a?.addressCountry === 'string' ? a.addressCountry : a?.addressCountry?.name,
          ]
            .filter(Boolean)
            .join(', ');
    })
    .filter(Boolean)
    .join(' / ');
}
function workMode(value) {
  const s = text(value).toLowerCase();
  if (/hybrid/.test(s)) return 'hybrid';
  if (/remote|telecommute|work from home/.test(s)) return 'remote';
  if (/on[ -]?site|in[ -]?office/.test(s)) return 'office';
  return 'unknown';
}
export function parsePortalPage(html, url, portalId) {
  const $ = cheerio.load(html),
    rows = [],
    portal = JOB_PORTALS.find((p) => p.id === portalId),
    source = portal?.name || 'Employer website';
  const add = (raw) => {
    try {
      if (raw.title && raw.url)
        rows.push(
          normalizeJob({
            company: '',
            location: '',
            description: '',
            employment: '',
            mode: 'unknown',
            postedAt: null,
            salary: '',
            source,
            ...raw,
          }),
        );
    } catch {}
  };
  const walk = (value) => {
    if (!value || typeof value !== 'object') return;
    if (array(value['@type']).includes('JobPosting')) {
      if (value.validThrough && Date.parse(value.validThrough) < Date.now()) return;
      const salary = value.baseSalary;
      add({
        title: value.title,
        company: value.hiringOrganization?.name || '',
        description: value.description || '',
        url: new URL(value.url || url, url).href,
        location: address(value.jobLocation) || address(value.applicantLocationRequirements),
        mode: workMode(value.jobLocationType),
        employment: array(value.employmentType).join(', '),
        postedAt: Number.isFinite(Date.parse(value.datePosted)) ? value.datePosted : null,
        salary: salary
          ? [
              salary.currency,
              salary.value?.minValue || salary.value?.value,
              salary.value?.maxValue,
              salary.value?.unitText,
            ]
              .filter(Boolean)
              .join(' ')
          : '',
      });
    } else
      for (const child of Object.values(value))
        if (typeof child === 'object') array(child).forEach(walk);
  };
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      walk(JSON.parse($(el).text()));
    } catch {}
  });
  if (portalId === 'linkedin')
    $('.base-card').each((_, el) => {
      const card = $(el),
        href = card.find('a.base-card__full-link').attr('href');
      if (!href) return;
      add({
        title: text(card.find('.base-search-card__title').text()),
        company: text(card.find('.base-search-card__subtitle').text()),
        location: text(card.find('.job-search-card__location').text()),
        url: new URL(href, url).href,
        postedAt: card.find('time').attr('datetime') || null,
        description: '',
        summaryOnly: true,
      });
    });
  if (portalId === 'indeed')
    $('[data-jk]').each((_, el) => {
      const card = $(el),
        key = card.attr('data-jk'),
        title = text(card.find('h2').text());
      if (!key || !title) return;
      add({
        title,
        company: text(card.find('[data-testid="company-name"]').text()),
        location: text(card.find('[data-testid="text-location"]').text()),
        description: text(card.find('.job-snippet').text()),
        url: new URL('/viewjob?jk=' + encodeURIComponent(key), url).href,
        summaryOnly: true,
      });
    });
  return [...new Map(rows.map((j) => [j.id, j])).values()];
}
export async function discoverPortalJobs(
  prefs,
  { cache = new Map(), signal, readPage = readPublicPage, getJSON = fetchJSON } = {},
) {
  const jobs = [],
    sources = [];
  for (const portal of portalPlans(prefs)) {
    signal?.throwIfAborted();
    if (['browser', 'unverified'].includes(portal.mode)) {
      sources.push({
        name: portal.name,
        portalId: portal.id,
        count: 0,
        status: portal.mode === 'unverified' ? 'setup_required' : 'browser_required',
        message: portal.note,
      });
      continue;
    }
    const searches =
      portal.mode === 'feed'
        ? [{ url: 'https://www.atlassian.com/endpoint/careers/listings' }]
        : portal.searches.slice(0, portal.automaticSearchLimit);
    let count = 0,
      detailChecks = 0,
      failed = false,
      fetchedAt;
    for (const search of searches) {
      signal?.throwIfAborted();
      try {
        const key = 'portal:' + search.url;
        let entry = cache.get(key);
        if (!entry || Date.now() - entry.at > 3600000) {
          let rows;
          if (portal.id === 'atlassian') {
            const data = await getJSON(search.url, undefined, signal);
            if (!Array.isArray(data)) throw new Error('Unrecognized careers feed');
            rows = data
              .slice(0, 2000)
              .filter((j) => /^\d+$/.test(String(j.id)))
              .map((j) =>
                normalizeJob({
                  title: j.title,
                  company: 'Atlassian',
                  location: array(j.locations).join(' / '),
                  mode: workMode(array(j.locations).join(' ')),
                  employment: j.type || '',
                  description: [j.overview, j.responsibilities, j.qualifications]
                    .filter(Boolean)
                    .join('\n'),
                  url: `https://www.atlassian.com/company/careers/details/${j.id}`,
                  source: 'Atlassian',
                  postedAt: null,
                  salary: '',
                }),
              );
          } else {
            const page = await readPage(search.url, 0, { signal });
            if (portalForURL(page.url)?.id !== portal.id)
              throw new Error('Portal redirected elsewhere');
            rows = parsePortalPage(page.html, page.url, portal.id);
          }
          entry = { rows, at: Date.now() };
          cache.set(key, entry);
        }
        const enriched = [];
        for (const row of entry.rows) {
          signal?.throwIfAborted();
          let candidate = row;
          if (
            row.summaryOnly &&
            detailChecks < 6 &&
            prefs.roles.some((role) => row.title.toLowerCase().includes(role.toLowerCase()))
          ) {
            detailChecks++;
            const detailKey = 'portal-detail:' + row.url;
            let detail = cache.get(detailKey);
            if (!detail || Date.now() - detail.at > 3600000) {
              try {
                const page = await readPage(row.url, 0, { signal });
                const parsed = parsePortalPage(page.html, page.url, portal.id).find(
                  (j) => j.id === row.id && !j.summaryOnly,
                );
                detail = { at: Date.now(), job: parsed || null };
              } catch {
                signal?.throwIfAborted();
                detail = { at: Date.now(), job: null };
              }
              cache.set(detailKey, detail);
            }
            if (detail.job) candidate = detail.job;
          }
          enriched.push(candidate);
        }
        jobs.push(...enriched);
        count += entry.rows.length;
        fetchedAt = new Date(entry.at).toISOString();
        if (!entry.rows.length) failed = true;
      } catch {
        signal?.throwIfAborted();
        failed = true;
        break;
      }
    }
    sources.push({
      name: portal.name,
      portalId: portal.id,
      count,
      cachedAt: fetchedAt,
      status: failed ? 'browser_required' : 'read',
      message: failed
        ? 'Some results could not be read publicly. Open the portal search and import a selected listing.'
        : portal.mode === 'feed'
          ? 'Public careers feed; apply on the employer site.'
          : `Read up to ${portal.automaticSearchLimit} role/location searches and up to 6 full listing checks; further combinations are available in portal searches.`,
    });
  }
  return { jobs: [...new Map(jobs.map((j) => [j.id, j])).values()], sources };
}
export async function previewPortalListing(value, readPage = readPublicPage) {
  const url = publicWebsite(value),
    portal = portalForURL(url);
  if (portal?.id === 'google-jobs')
    throw new Error('Paste the employer’s original job link, not a Google results page.');
  const page = await readPage(url);
  const rows = parsePortalPage(page.html, page.url, portalForURL(page.url)?.id);
  const canonical = normalizeJob({ url }).id;
  const match = rows.find((j) => j.id === canonical) || (rows.length === 1 ? rows[0] : null);
  if (!match || match.summaryOnly)
    throw new Error(
      'This page does not expose full job details. Paste the title, company, location and description from the listing below.',
    );
  return match;
}
