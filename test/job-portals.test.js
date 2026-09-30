import test from 'node:test';
import assert from 'node:assert/strict';
import { JOB_PORTALS, portalSearch, portalPlans } from '../shared/job-portals.js';
import {
  parsePortalPage,
  discoverPortalJobs,
  previewPortalListing,
  portalForURL,
} from '../server/jobs/portals.js';
import { normalizeJob } from '../server/jobs/sources.js';
import { preferenceSchema, importedJobSchema } from '../server/jobs/service.js';
import { readPublicPage } from '../server/projects.js';

const preferences = preferenceSchema.parse({
  roles: ['Engineer', 'Designer'],
  locations: ['India', 'Berlin'],
  modes: ['remote'],
  portals: JOB_PORTALS.map((p) => p.id),
});
const listing = {
  '@context': 'https://schema.org',
  '@type': 'JobPosting',
  title: 'Software Engineer',
  description:
    'Build React and Python applications. You will work on product delivery with our engineering team.',
  hiringOrganization: { name: 'Example' },
  jobLocation: { address: { addressLocality: 'Bengaluru', addressCountry: 'India' } },
  employmentType: 'FULL_TIME',
  datePosted: new Date().toISOString(),
  jobLocationType: 'TELECOMMUTE',
};
const html = (data) => '<script type="application/ld+json">' + JSON.stringify(data) + '</script>';

test('all requested portals are selectable and unknown Protocoljobs has no invented URL', () => {
  assert.equal(JOB_PORTALS.length, 10);
  assert.equal(portalSearch('protocoljobs', 'Engineer', 'India'), null);
  assert.equal(portalPlans(preferences).length, 10);
  assert.equal(portalPlans(preferences)[0].searches.length, 4);
  assert.throws(() => preferenceSchema.parse({ portals: ['evil'] }));
  assert.ok(
    portalSearch('google-jobs', 'Engineer', 'India').url.startsWith(
      'https://www.google.com/search?',
    ),
  );
  assert.equal(portalSearch('wonderin', 'Engineer', 'India').filtersInLink, false);
});

test('portal links encode multiple saved role/location combinations and remote filters without private profile data', () => {
  const p = {
    ...preferences,
    email: 'secret@example.com',
    coverLetter: 'PRIVATE',
    fullName: 'PRIVATE',
    roles: ['C++ Engineer & QA'],
    locations: ['New York, NY'],
  };
  const u = new URL(portalSearch('linkedin', p.roles[0], p.locations[0], p.modes).url);
  assert.equal(u.searchParams.get('keywords'), p.roles[0]);
  assert.equal(u.searchParams.get('location'), p.locations[0]);
  assert.equal(u.searchParams.get('f_WT'), '2');
  assert.ok(!JSON.stringify(portalPlans(p)).includes('PRIVATE'));
  assert.ok(!JSON.stringify(portalPlans(p)).includes(p.email));
  assert.equal(
    new URL(portalSearch('indeed', 'Engineer', 'Berlin', ['remote']).url).searchParams.get('l'),
    'Berlin',
  );
  assert.ok(
    portalSearch('foundit', 'Engineer', 'India').url.includes('/search/engineer-jobs-in-india'),
  );
});

test('structured listing parser handles graph nodes, locations, expiry, and strips markup', () => {
  const jobs = parsePortalPage(html({ '@graph': [listing] }), 'https://example.com/jobs/1');
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].mode, 'remote');
  assert.equal(jobs[0].location, 'Bengaluru, India');
  assert.equal(jobs[0].company, 'Example');
  assert.equal(jobs[0].canAutoApply, false);
  assert.equal(
    parsePortalPage(html({ ...listing, validThrough: '2020-01-01' }), 'https://example.com/jobs/1')
      .length,
    0,
  );
  assert.equal(
    parsePortalPage(html({ ...listing, url: 'javascript:alert(1)' }), 'https://example.com/jobs/1')
      .length,
    0,
  );
});

test('LinkedIn cards have stable IDs across tracking URLs and are flagged as partial evidence', () => {
  const card =
    '<div class="base-card"><a class="base-card__full-link" href="https://in.linkedin.com/jobs/view/software-engineer-123456?trackingId=private">Job</a><h3 class="base-search-card__title">Software Engineer</h3><h4 class="base-search-card__subtitle">Example</h4><span class="job-search-card__location">India</span><time datetime="2026-09-30"></time></div>';
  const job = parsePortalPage(card, 'https://www.linkedin.com/jobs/search/', 'linkedin')[0];
  assert.equal(job.url, 'https://www.linkedin.com/jobs/view/123456');
  assert.equal(job.summaryOnly, true);
  assert.equal(job.mode, 'unknown');
  assert.equal(
    job.id,
    normalizeJob({ url: 'https://www.linkedin.com/jobs/view/123456?refId=other' }).id,
  );
  assert.equal(
    normalizeJob({ url: 'https://www.indeed.com/rc/clk?jk=abc&trackingId=1' }).id,
    normalizeJob({ url: 'https://www.indeed.com/viewjob?jk=abc' }).id,
  );
});

test('browser-only portals never trigger server requests and read failures have browser handoffs', async () => {
  let calls = 0;
  const result = await discoverPortalJobs(
    {
      ...preferences,
      portals: ['handshake', 'wonderin', 'instahyre', 'google-jobs', 'protocoljobs', 'indeed'],
    },
    {
      readPage: async () => {
        calls++;
        throw new Error('403');
      },
    },
  );
  assert.equal(calls, 1);
  assert.equal(result.jobs.length, 0);
  assert.equal(result.sources.length, 6);
  assert.equal(result.sources.find((s) => s.portalId === 'indeed').status, 'browser_required');
  assert.equal(result.sources.find((s) => s.portalId === 'protocoljobs').status, 'setup_required');
  assert.ok(!JSON.stringify(result).includes('Invalid Date'));
});

test('Atlassian feed maps real schema, caches results, and never treats update date as publication', async () => {
  let calls = 0;
  const cache = new Map();
  const getJSON = async () => {
    calls++;
    return [
      {
        id: 123,
        title: 'Software Engineer',
        locations: ['Remote - India'],
        type: 'Full-Time',
        overview: '<p>React services</p>',
        qualifications: 'Python experience',
        portalJobPost: { updatedDate: '2026-09-30' },
      },
    ];
  };
  const p = { ...preferences, portals: ['atlassian'] };
  const result = await discoverPortalJobs(p, { cache, getJSON });
  await discoverPortalJobs(p, { cache, getJSON });
  assert.equal(calls, 1);
  assert.equal(result.jobs[0].url, 'https://www.atlassian.com/company/careers/details/123');
  assert.equal(result.jobs[0].postedAt, null);
  assert.equal(result.jobs[0].company, 'Atlassian');
  assert.equal(result.jobs[0].mode, 'remote');
  assert.match(result.jobs[0].description, /Python/);
});

test('portal lookup rejects spoofed hosts and preview requires a real posting rather than a search page', async () => {
  assert.equal(portalForURL('https://in.linkedin.com/jobs/view/1').id, 'linkedin');
  assert.equal(portalForURL('https://linkedin.com.evil.com/jobs/view/1'), undefined);
  await assert.rejects(previewPortalListing('https://www.google.com/search?q=jobs'), /original/);
  await assert.rejects(
    previewPortalListing('https://example.com/jobs', async () => ({
      url: 'https://example.com/jobs',
      html: '<h1>Sign in</h1>',
    })),
    /full job details/,
  );
  const result = await previewPortalListing('https://example.com/jobs/1', async () => ({
    url: 'https://example.com/jobs/1',
    html: html(listing),
  }));
  assert.equal(result.title, 'Software Engineer');
  assert.throws(() =>
    importedJobSchema.parse({
      url: 'http://localhost/resume',
      title: 'Engineer',
      company: 'Example',
      description: listing.description,
    }),
  );
});

test('public page reads block private DNS targets, and cancelled discovery never requests a portal', async () => {
  let requested = false;
  await assert.rejects(
    readPublicPage('https://example.com', 0, {
      lookup: async () => [{ address: '127.0.0.1', family: 4 }],
      get: () => {
        requested = true;
      },
    }),
    /Private network/,
  );
  assert.equal(requested, false);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    discoverPortalJobs(preferences, {
      signal: controller.signal,
      readPage: async () => {
        requested = true;
      },
    }),
  );
  assert.equal(requested, false);
});

test('Protocoljobs uses only the user-supplied public HTTPS address and stays browser-only', async () => {
  assert.throws(() => preferenceSchema.parse({ protocoljobsUrl: 'http://localhost/' }));
  const p = preferenceSchema.parse({
    ...preferences,
    portals: ['protocoljobs'],
    protocoljobsUrl: 'https://jobs.example.org/',
  });
  const plan = portalPlans(p)[0];
  assert.equal(plan.mode, 'browser');
  assert.equal(plan.searches[0].url, 'https://jobs.example.org/');
  let calls = 0;
  const result = await discoverPortalJobs(p, {
    readPage: async () => {
      calls++;
    },
  });
  assert.equal(calls, 0);
  assert.equal(result.sources[0].status, 'browser_required');
});
