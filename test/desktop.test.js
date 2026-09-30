import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { createApp } from '../server/index.js';
import { startOfficeServer } from '../server/lifecycle.js';
import { createStore } from '../server/store.js';
import { createEnvCredentials } from '../server/env-credentials.js';
import {
  isOfficeURL,
  isExternalURL,
  assertTrustedSender,
  validateTextExport,
} from '../desktop/policy.js';
import { createModelDownloader } from '../desktop/model-download.js';

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'butler-desktop-test-'));
  const store = createStore(join(dir, 'data'));
  const vault = createEnvCredentials(join(dir, '.env'));
  t.after(() => {
    try {
      store.close();
    } catch {}
    rmSync(dir, { recursive: true, force: true });
  });
  return { store, vault, model: { async unload() {} } };
}

test('native bridge accepts only the owning main frame', () => {
  const frame = { url: 'http://127.0.0.1:4310/' };
  const contents = { mainFrame: frame };
  const window = { isDestroyed: () => false, webContents: contents };
  assert.doesNotThrow(() => assertTrustedSender({ sender: contents, senderFrame: frame }, window));
  assert.throws(() => assertTrustedSender({ sender: {}, senderFrame: frame }, window));
  assert.throws(() => assertTrustedSender({ sender: contents, senderFrame: { ...frame } }, window));
  frame.url = 'https://example.com/';
  assert.throws(() => assertTrustedSender({ sender: contents, senderFrame: frame }, window));
});

test('desktop navigation and exports reject privileged schemes and unsafe payloads', () => {
  assert.ok(isOfficeURL('http://127.0.0.1:4310/?connection=x-authorized'));
  for (const url of [
    'http://127.0.0.1:4310.evil.com',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'https://127.0.0.1:4310',
    'http://user@127.0.0.1:4310',
  ])
    assert.equal(isOfficeURL(url), false);
  assert.ok(isExternalURL('https://openai.com/'));
  for (const url of [
    'file:///tmp/file',
    'ms-settings:privacy',
    'http://localhost:1',
    'https://user:pass@example.com',
  ])
    assert.equal(isExternalURL(url), false);
  assert.deepEqual(validateTextExport({ text: 'hello', name: 'Notes.md' }), {
    text: 'hello',
    name: 'Notes.md',
  });
  for (const input of [
    { text: 'x', name: '../secret.txt' },
    { text: 'x', name: 'run.command' },
    { text: 'a'.repeat(3 * 1024 * 1024) },
    { text: {} },
  ])
    assert.throws(() => validateTextExport(input));
});

test('closing the desktop waits for engine startup and stops it exactly once', async (t) => {
  const options = fixture(t);
  let ready,
    stops = 0,
    unloads = 0;
  options.model.unload = async () => {
    unloads++;
  };
  const runtime = await startOfficeServer({
    createApp,
    ...options,
    port: 0,
    engineFactory: () =>
      new Promise((resolve) => {
        ready = resolve;
      }),
  });
  const closing = runtime.close();
  const closingAgain = runtime.close();
  ready({
    stop() {
      stops++;
    },
  });
  await Promise.all([closing, closingAgain]);
  assert.equal(stops, 1);
  assert.equal(unloads, 1);
  assert.equal(runtime.server.listening, false);
});

test('port conflicts cannot recover or mutate another office database', async (t) => {
  let runtime;
  t.after(() => runtime?.close());
  const options = fixture(t);
  runtime = await startOfficeServer({
    createApp,
    ...options,
    port: 0,
    engineFactory: async () => ({ stop() {} }),
  });
  let created = false;
  await assert.rejects(
    startOfficeServer({
      port: runtime.server.address().port,
      createApp() {
        created = true;
      },
    }),
    { code: 'EADDRINUSE' },
  );
  assert.equal(created, false);
});

test('desktop OAuth transfers a one-use ticket into a browser-bound cookie', async (t) => {
  const options = fixture(t);
  options.vault.save({ xClientId: 'test-client' });
  const context = createApp(options);
  const server = context.app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const ticketURL = new URL(context.desktopOAuthURL('x'));
  const address = `http://127.0.0.1:${server.address().port}${ticketURL.pathname}${ticketURL.search}`;
  const headers = { host: '127.0.0.1:4310', 'sec-fetch-site': 'cross-site' };
  const first = await localRequest(address, headers);
  assert.equal(first.status, 303);
  assert.match(first.headers.get('set-cookie'), /butler_x_oauth=.+; HttpOnly; SameSite=Lax/);
  assert.match(first.headers.get('location'), /^https:\/\/x.com\/i\/oauth2\/authorize/);
  assert.equal((await localRequest(address, headers)).status, 403);
  assert.throws(() => context.desktopOAuthURL('unknown'));
});

test('model downloads validate model names and require a success event', async () => {
  const downloader = createModelDownloader(async (_url, request) => {
    assert.equal(JSON.parse(request.body).model, 'qwen3:4b');
    return new Response('{"status":"pulling","total":100,"completed":50}\n{"status":"success"}');
  });
  assert.throws(() => downloader.start('arbitrary-model'));
  downloader.start('qwen3:4b');
  while (downloader.status().active) await delay(1);
  assert.equal(downloader.status().status, 'Model ready');
  assert.equal(downloader.status().progress, 100);
  const broken = createModelDownloader(async () => new Response('{"status":"pulling"}\n'));
  broken.start('qwen3:1.7b');
  while (broken.status().active) await delay(1);
  assert.match(broken.status().error, /interrupted/);
});

function localRequest(url, headers) {
  return new Promise((resolve, reject) => {
    const req = request(url, { headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () =>
        resolve(
          new Response(Buffer.concat(chunks), { status: res.statusCode, headers: res.headers }),
        ),
      );
    });
    req.on('error', reject);
    req.end();
  });
}
