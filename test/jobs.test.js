import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../server/store.js';
import { Office } from '../server/workflow.js';
import { createApp } from '../server/index.js';
import { JobWorker, preferenceSchema } from '../server/jobs/service.js';
import {
  matchJob,
  discoverJobs,
  leverTarget,
  resumeSkills,
  fetchJSON,
} from '../server/jobs/sources.js';
import { parseResume } from '../server/jobs/resume.js';
import JSZip from 'jszip';

const text =
  'Private Applicant has five years of experience building React, TypeScript, Python and SQL applications. Led software delivery for customers.';
const upload = { name: 'resume.txt', base64: Buffer.from(text).toString('base64') };
const prefs = {
  roles: ['Engineer'],
  locations: ['India', 'Berlin'],
  modes: ['remote', 'hybrid'],
  fullName: 'Private Applicant',
  email: 'private@example.com',
  skills: ['React', 'Python'],
  sources: ['remotive'],
};
const sample = (id = 'a', patch = {}) => ({
  id,
  title: 'Software Engineer',
  company: 'Employer',
  location: 'India',
  mode: 'remote',
  employment: 'Full-time',
  description: 'Build React and Python applications.',
  source: 'Lever',
  url: `https://jobs.lever.co/example/${id}`,
  applicationUrl: `https://jobs.lever.co/example/${id}/apply`,
  postedAt: new Date().toISOString(),
  canAutoApply: true,
  ...patch,
});
function fixture(t, deps = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'butler-jobs-'));
  const store = createStore(dir);
  const model = { work: async (input) => ({ report: `Model review: ${input.assignment}` }) };
  const vault = { read: () => ({}), status: () => ({}) };
  const office = new Office(store, model, vault);
  store.saveWorker(
    office.catalog.workers.find((w) => w.id === 'job-hunter'),
    { deployment: 'deployed' },
  );
  const worker = new JobWorker(store, office, model, {
    discover: async () => ({
      jobs: [sample('a'), sample('b')],
      sources: [{ name: 'Fixture', count: 2 }],
    }),
    ...deps,
  });
  t.after(async () => {
    await worker.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  });
  return { store, office, model, vault, worker, dir };
}
async function ready(worker) {
  worker.savePreferences(prefs);
  await worker.upload(upload);
  worker.search();
  await worker.running;
}

test('résumé parsing validates type, text, size and reads DOCX without HTML', async () => {
  const r = await parseResume(upload);
  assert.equal(r.text, text);
  assert.equal(r.data.toString(), text);
  await assert.rejects(parseResume({ name: 'resume.exe', base64: upload.base64 }), /PDF, DOCX/);
  await assert.rejects(parseResume({ name: 'resume.pdf', base64: upload.base64 }), /not a PDF/);
  await assert.rejects(
    parseResume({ name: 'resume.txt', base64: Buffer.from('empty').toString('base64') }),
    /No readable/,
  );
  await assert.rejects(
    parseResume({
      name: 'resume.txt',
      base64: Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64'),
    }),
    /5 MB/,
  );
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    'word/document.xml',
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
  );
  const docx = await parseResume({
    name: 'resume.docx',
    base64: await zip.generateAsync({ type: 'base64' }),
  });
  assert.match(docx.text, /React/);
});

test('text PDF resumes preserve readable text and the original upload', async () => {
  const content = 'BT /F1 12 Tf 30 700 Td (' + text + ') Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => String(o).padStart(10, '0') + ' 00000 n \n')
    .join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  const parsed = await parseResume({
    name: 'resume.pdf',
    base64: Buffer.from(pdf).toString('base64'),
  });
  assert.match(parsed.text, /React/);
  assert.equal(parsed.data.toString(), pdf);
});

test('matching combines multiple locations, modes, exclusions, freshness and résumé skills', () => {
  const p = preferenceSchema.parse(prefs);
  assert.equal(matchJob(sample(), p, text).score, 100);
  assert.ok(matchJob(sample('b', { location: 'Berlin', mode: 'hybrid' }), p, text));
  assert.equal(matchJob(sample('b', { location: 'USA' }), p, text), null);
  assert.ok(matchJob(sample('b', { location: 'Worldwide' }), p, text));
  assert.equal(matchJob(sample('b', { mode: 'office' }), p, text), null);
  assert.equal(matchJob(sample('b', { postedAt: '2020-01-01' }), p, text), null);
  assert.equal(matchJob(sample(), { ...p, excludedCompanies: ['Employer'] }, text), null);
  assert.equal(matchJob(sample(), { ...p, excludedKeywords: ['Python'] }, text), null);
  assert.equal(
    matchJob(sample('b', { mode: 'unknown' }), { ...p, includeUnknown: false }, text),
    null,
  );
  assert.match(matchJob(sample('b', { postedAt: null }), p, text).gaps.join(' '), /date/);
  assert.ok(matchJob(sample(), { ...p, employmentTypes: ['Full time'] }, text));
  assert.deepEqual(resumeSkills('JavaScript and C++ development'), ['JavaScript', 'C++']);
  assert.ok(matchJob(sample(), { ...p, skills: [] }, text).score > 50);
});

test('only exact HTTPS Lever posting URLs enable automatic applications', () => {
  const path = '/employer/12345678-1234-1234-1234-123456789abc';
  assert.ok(leverTarget('https://jobs.lever.co' + path));
  assert.ok(leverTarget('https://jobs.eu.lever.co' + path + '/apply'));
  for (const u of [
    'http://jobs.lever.co' + path,
    'https://jobs.lever.co.evil.com' + path,
    'https://user:pass@jobs.lever.co' + path,
    'https://jobs.lever.co:444' + path,
    'https://127.0.0.1' + path,
  ])
    assert.equal(leverTarget(u), null);
  assert.throws(() => preferenceSchema.parse({ ...prefs, leverBoards: ['../internal'] }));
});

test('discovery caches feeds, paginates Lever, reports failures and strips HTML', async () => {
  let calls = 0;
  const cache = new Map();
  const get = async (url) => {
    calls++;
    if (url.includes('arbeitnow')) throw new Error('offline');
    if (url.includes('lever'))
      return [
        {
          text: 'Engineer',
          id: '12345678-1234-1234-1234-123456789abc',
          hostedUrl: 'https://jobs.lever.co/example/12345678-1234-1234-1234-123456789abc',
          descriptionPlain: 'React',
          categories: { location: 'India' },
          workplaceType: 'remote',
        },
      ];
    return {
      jobs: [
        {
          id: 1,
          title: 'Engineer',
          company_name: 'Example',
          url: 'https://remotive.com/remote-jobs/example',
          description: '<p>React</p>',
          candidate_required_location: 'Worldwide',
        },
      ],
    };
  };
  const p = preferenceSchema.parse({
    ...prefs,
    sources: ['remotive', 'arbeitnow'],
    leverBoards: ['example'],
  });
  const first = await discoverJobs(p, get, cache);
  assert.equal(first.jobs.length, 2);
  assert.equal(first.jobs[0].description, 'React');
  assert.equal(first.sources.filter((s) => s.error).length, 3);
  assert.equal(first.jobs[1].canAutoApply, true);
  const previous = calls;
  await discoverJobs(p, get, cache);
  assert.equal(calls - previous, 3);
  await assert.rejects(
    fetchJSON('https://example.com', async () => new Response('x', { status: 429 })),
    /429/,
  );
});

test('queue is sequential, persists receipts, prevents duplicates and hides résumé from logs', async (t) => {
  let active = 0,
    max = 0;
  const sent = [];
  const { worker, store } = fixture(t, {
    apply: async ({ job, resume }) => {
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 5));
      sent.push(job.id);
      assert.equal(resume.data.toString(), text);
      active--;
      return {
        status: 'submitted',
        detail: 'Application received',
        receiptUrl: job.applicationUrl,
      };
    },
  });
  await ready(worker);
  worker.queue(['a', 'b']);
  assert.throws(() => worker.search(), /Wait/);
  await worker.running;
  assert.equal(max, 1);
  assert.deepEqual(sent, ['a', 'b']);
  assert.equal(worker.get('a').status, 'submitted');
  assert.throws(() => worker.queue(['a']), /not been submitted/);
  worker.search();
  await worker.running;
  assert.equal(worker.get('a').status, 'submitted');
  assert.ok(!JSON.stringify(store.tasks()).includes('Private Applicant'));
  assert.ok(!JSON.stringify(store.events()).includes('private@example.com'));
  assert.ok(!('data' in worker.state().resume));
  assert.ok(worker.state().resume.detectedSkills.includes('React'));
});

test('uncertain submission stops queue and needs explicit reconciliation', async (t) => {
  const sent = [];
  const { worker } = fixture(t, {
    apply: async ({ job }) => {
      sent.push(job.id);
      return { status: 'uncertain', detail: 'No receipt' };
    },
  });
  await ready(worker);
  worker.queue(['a', 'b']);
  await worker.running;
  assert.deepEqual(sent, ['a']);
  assert.equal(worker.get('b').status, 'found');
  assert.throws(() => worker.queue(['a']), /not been submitted/);
  worker.resolve('a', 'not_submitted');
  assert.equal(worker.get('a').status, 'found');
  worker.resolve('a', 'submitted');
  assert.equal(worker.get('a').userConfirmed, true);
  assert.throws(() => worker.resolve('a', 'not_submitted'), /already/);
});

test('profile changes invalidate matches and unsupported applications are never sent', async (t) => {
  let sent = 0;
  const { worker } = fixture(t, {
    discover: async () => ({ jobs: [sample('a', { canAutoApply: false })], sources: [] }),
    apply: async () => {
      sent++;
    },
  });
  await ready(worker);
  worker.queue(['a']);
  await worker.running;
  assert.equal(sent, 0);
  assert.equal(worker.get('a').status, 'needs_attention');
  worker.savePreferences({ ...prefs, locations: ['Berlin'] });
  assert.equal(worker.get('a').currentMatch, false);
  assert.throws(() => worker.queue(['a']), /new search/);
});

test('restart preserves submitted jobs and makes interrupted jobs uncertain without sending', async (t) => {
  const { worker, store, office, model } = fixture(t);
  await ready(worker);
  worker.saveJob({ ...worker.get('a'), status: 'applying' });
  worker.saveJob({ ...worker.get('b'), status: 'queued' });
  const recovered = new JobWorker(store, office, model);
  assert.equal(recovered.get('a').status, 'uncertain');
  assert.equal(recovered.get('b').status, 'found');
  assert.equal(recovered.running, null);
});

test('stop aborts the current browser and never starts the next application', async (t) => {
  const sent = [];
  const { worker } = fixture(t, {
    apply: async ({ job, signal }) => {
      sent.push(job.id);
      await new Promise((resolve) => signal.addEventListener('abort', resolve, { once: true }));
      return { status: 'uncertain', detail: 'Interrupted' };
    },
  });
  await ready(worker);
  worker.queue(['a', 'b']);
  await new Promise((r) => setImmediate(r));
  worker.stop();
  await worker.running;
  assert.deepEqual(sent, ['a']);
  assert.equal(worker.get('b').status, 'found');
});

test('deployment and résumé upload are required; Qwen is optional and local to reviews', async (t) => {
  const { worker, store, office } = fixture(t);
  await ready(worker);
  store.saveWorker(
    office.catalog.workers.find((w) => w.id === 'job-hunter'),
    { deployment: 'bench' },
  );
  assert.throws(() => worker.search(), /Deploy/);
  store.saveWorker(
    office.catalog.workers.find((w) => w.id === 'job-hunter'),
    { deployment: 'deployed' },
  );
  store.saveSettings({ useModel: false });
  worker.search();
  await worker.running;
  assert.throws(() => worker.review('a'), /Enable/);
  store.saveSettings({ useModel: true });
  worker.review('a');
  await worker.running;
  assert.match(worker.get('a').review, /Model review/);
  worker.clear();
  assert.equal(worker.resume(), null);
  assert.equal(worker.jobs().length, 0);
  assert.throws(() => worker.search(), /Upload/);
});

test('job API protects uploads, keeps profile out of general state, and rejects generic assignment', async (t) => {
  const { store, office, model, vault } = fixture(t);
  const appContext = createApp({ store, office, model, vault });
  const server = appContext.app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const req = (path, method = 'GET', body, headers = {}) =>
    fetch(base + path, {
      method,
      headers: {
        ...(method === 'GET'
          ? {}
          : { 'Content-Type': 'application/json', 'X-Butler-Client': 'office' }),
        ...headers,
      },
      body: method === 'GET' ? undefined : JSON.stringify(body || {}),
    });
  assert.equal(
    (await req('/jobs/resume', 'POST', upload, { Origin: 'https://evil.com' })).status,
    403,
  );
  assert.equal((await req('/jobs/resume', 'POST', upload)).status, 200);
  assert.ok(!(await (await req('/state')).text()).includes('Private Applicant'));
  assert.equal(await (await req('/jobs/resume/download')).text(), text);
  assert.equal(
    (
      await req('/assignments', 'POST', {
        workerId: 'job-hunter',
        brief: 'Find matching jobs',
        kind: 'report',
      })
    ).status,
    400,
  );
  assert.equal((await req('/jobs', 'DELETE')).status, 200);
  assert.equal((await req('/jobs/resume/download')).status, 404);
});

test('imported portal jobs retain manual status, match the resume, deduplicate, and survive searches', async (t) => {
  const { worker } = fixture(t);
  await ready(worker);
  const input = {
    url: 'https://www.linkedin.com/jobs/view/software-engineer-123456?trackingId=one',
    title: 'Software Engineer',
    company: 'Example',
    location: 'India',
    mode: 'remote',
    description:
      'Build React and Python services with our engineering team. Experience delivering software is required.',
  };
  const first = worker.importListing(input);
  assert.equal(first.source, 'LinkedIn');
  assert.equal(first.currentMatch, true);
  assert.equal(first.canAutoApply, false);
  worker.resolve(first.id, 'submitted');
  const again = worker.importListing({
    ...input,
    url: 'https://www.linkedin.com/jobs/view/123456?refId=two',
  });
  assert.equal(again.id, first.id);
  assert.equal(again.status, 'submitted');
  worker.search();
  await worker.running;
  assert.equal(worker.get(first.id).currentMatch, true);
  assert.equal(worker.get(first.id).status, 'submitted');
  const outside = worker.importListing({
    ...input,
    url: 'https://www.linkedin.com/jobs/view/123457',
    location: 'USA',
  });
  assert.equal(outside.currentMatch, false);
  assert.throws(() => worker.queue([outside.id]), /current matches/);
});
