// Fully intercepted employer forms: this check never sends a real application.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createStore } from '../server/store.js';
import { createApp } from '../server/index.js';
import { applyLever } from '../server/jobs/apply.js';
import { preferenceSchema } from '../server/jobs/service.js';

const url = 'https://jobs.lever.co/fixture/12345678-1234-1234-1234-123456789abc/apply';
const resumeText =
  'Sample Applicant built React and Python services with SQL and five years of software engineering experience.';
const resume = { name: 'resume.txt', mime: 'text/plain', data: Buffer.from(resumeText) };
const profile = preferenceSchema.parse({
  fullName: 'Sample Applicant',
  email: 'applicant@example.com',
  currentLocation: 'Bengaluru',
  roles: ['Engineer'],
  locations: ['India'],
  skills: ['React', 'Python'],
});
let posts = 0,
  blocked = 0;
async function browserFixture(extra = '', uncertain = false) {
  return {
    launch: async () => {
      const browser = await chromium.launch({ headless: true });
      const newContext = browser.newContext.bind(browser);
      browser.newContext = async (options) => {
        const context = await newContext(options),
          route = context.route.bind(context);
        context.route = async (pattern, handler) =>
          route(pattern, (request) =>
            handler(
              new Proxy(request, {
                get(target, key) {
                  if (key === 'abort')
                    return (...args) => {
                      blocked++;
                      return target.abort(...args);
                    };
                  if (key === 'continue')
                    return async () => {
                      if (request.request().method() === 'POST') {
                        posts++;
                        const body = request.request().postDataBuffer().toString();
                        assert.ok(body.includes(profile.fullName));
                        assert.ok(body.includes(profile.email));
                        assert.ok(body.includes(resumeText));
                        return request.fulfill({
                          contentType: 'text/html',
                          body: uncertain
                            ? '<p>Please check your email.</p>'
                            : '<div class="application-confirmation">Thank you! Your application has been received.</div>',
                        });
                      }
                      return request.fulfill({
                        contentType: 'text/html',
                        body: `<form method="POST" enctype="multipart/form-data"><label>Name<input name="name" required></label><input name="email" required type="email"><input name="location" required><input type="file" name="resume" required>${extra}<button data-qa="btn-submit" type="button" onclick="this.form.requestSubmit()">Submit</button></form><script>fetch('http://127.0.0.1:4310/private').catch(()=>{});</script>`,
                      });
                    };
                  const value = target[key];
                  return typeof value === 'function' ? value.bind(target) : value;
                },
              }),
            ),
          );
        return context;
      };
      return browser;
    },
  };
}
if (!process.argv.includes('--ui-only')) {
  assert.equal(
    (
      await applyLever(
        { job: { applicationUrl: url }, profile, resume },
        { chromium: await browserFixture() },
      )
    ).status,
    'submitted',
  );
  assert.equal(posts, 1);
  assert.ok(blocked > 0);
  assert.equal(
    (
      await applyLever(
        { job: { applicationUrl: url }, profile, resume },
        { chromium: await browserFixture('<input name="authorization" required>') },
      )
    ).status,
    'needs_attention',
  );
  assert.equal(posts, 1);
  assert.equal(
    (
      await applyLever(
        { job: { applicationUrl: url }, profile, resume },
        { chromium: await browserFixture('<div class="h-captcha">Solve this challenge</div>') },
      )
    ).status,
    'needs_attention',
  );
  assert.equal(posts, 1);
  assert.equal(
    (
      await applyLever(
        { job: { applicationUrl: url }, profile, resume },
        { chromium: await browserFixture('', true) },
      )
    ).status,
    'uncertain',
  );
  assert.equal(posts, 2);
  console.log(
    'Browser adapter: confirmed receipt, missing answers, CAPTCHA, blocked destinations, and uncertain outcomes passed.',
  );
}
const dir = mkdtempSync(join(tmpdir(), 'butler-job-ui-')),
  store = createStore(dir);
const model = {
  status: async () => ({ online: false }),
  work: async () => ({
    report: 'Your React and Python experience matches the role. Confirm work authorization.',
  }),
};
const context = createApp({
  store,
  model,
  vault: { read: () => ({}), status: () => ({}) },
  jobDependencies: {
    discoverPortals: async () => ({ jobs: [], sources: [] }),
    discover: async () => ({
      jobs: [
        {
          id: 'fixture',
          title: 'Senior Software Engineer',
          company: 'Example Studio',
          location: 'Bengaluru, India',
          mode: 'remote',
          employment: 'Full-time',
          description:
            'Build useful tools with React and Python. Five years of engineering experience preferred.',
          url,
          applicationUrl: url,
          canAutoApply: true,
          source: 'Lever',
          postedAt: new Date().toISOString(),
          salary: 'INR 25–35 LPA',
        },
      ],
      sources: [{ name: 'Fixture · offline test', count: 1, cachedAt: new Date().toISOString() }],
    }),
  },
});
store.saveWorker(
  context.office.catalog.workers.find((w) => w.id === 'job-hunter'),
  { deployment: 'deployed' },
);
const server = context.app.listen(4310, '127.0.0.1');
await new Promise((resolve, reject) => {
  server.once('listening', resolve);
  server.once('error', reject);
});
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } }),
    errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.setDefaultTimeout(15000);
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('button', { name: 'Job search & applications', exact: true }).click();
  await page
    .getByLabel('Upload résumé', { exact: true })
    .setInputFiles({ name: 'resume.txt', mimeType: 'text/plain', buffer: resume.data });
  await page.getByRole('link', { name: 'Download saved résumé' }).waitFor();
  await page.getByLabel('Role titles', { exact: true }).fill('Engineer');
  await page
    .getByLabel('Locations · cities, countries, or regions', { exact: true })
    .fill('India, Berlin');
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await page.getByRole('button', { name: 'Find matching jobs', exact: true }).click();
  await page.getByRole('heading', { name: 'Senior Software Engineer' }).waitFor();
  await page.getByRole('button', { name: 'Review with Qwen', exact: true }).click();
  await page
    .getByText('Your React and Python experience matches the role. Confirm work authorization.')
    .waitFor();
  await page.getByLabel('Select for application queue').check();
  await page.getByRole('button', { name: 'Apply to selected jobs', exact: true }).waitFor();
  assert.equal(
    await page.getByRole('button', { name: 'Apply to selected jobs', exact: true }).isEnabled(),
    true,
  );
  // Portal preferences and a manual listing import share the real local workflow.
  await page.getByLabel('LinkedIn', { exact: true }).check();
  await page.getByLabel('Google Jobs', { exact: true }).check();
  await page.getByLabel('Atlassian', { exact: true }).check();
  await page.getByRole('button', { name: 'Save preferences', exact: true }).click();
  await page.getByRole('link', { name: 'Open LinkedIn', exact: true }).waitFor();
  assert.equal(
    new URL(
      await page.getByRole('link', { name: 'Open LinkedIn', exact: true }).getAttribute('href'),
    ).searchParams.get('location'),
    'India',
  );
  await page.getByText('Import a chosen job into Butler', { exact: true }).click();
  await page
    .getByLabel('Job listing URL', { exact: true })
    .fill('https://www.linkedin.com/jobs/view/123456');
  await page.getByLabel('Job title', { exact: true }).fill('Platform Engineer');
  await page.getByLabel('Company', { exact: true }).fill('Portal Fixture');
  await page.getByLabel('Job location', { exact: true }).fill('India');
  await page.getByLabel('Listing work arrangement', { exact: true }).selectOption('remote');
  await page
    .getByLabel('Job description', { exact: true })
    .fill(
      'Build reliable React and Python services for the engineering team. This is a remote role based in India.',
    );
  await page.getByRole('button', { name: 'Save job to Butler', exact: true }).click();
  await page.getByRole('heading', { name: 'Platform Engineer', exact: true }).waitFor();
  assert.equal(
    context.jobWorker.jobs().find((j) => j.title === 'Platform Engineer').canAutoApply,
    false,
  );
  await page.locator('.job-portals').screenshot({ path: '/tmp/butler-job-portals.png' });
  await page.locator('.game-overlay-content').evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({ path: resolve('/tmp/butler-jobs-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 700, height: 1000 });
  await page.screenshot({ path: resolve('/tmp/butler-jobs-mobile.png'), fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  console.log(
    'Job workspace: upload, saved preferences, discovery, Qwen review, queue selection, portal preferences, listing import, and narrow layout passed. Screenshots: /tmp/butler-jobs-desktop.png and /tmp/butler-jobs-mobile.png',
  );
} finally {
  await browser.close();
  await context.jobWorker.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
  store.close();
  rmSync(dir, { recursive: true, force: true });
}
