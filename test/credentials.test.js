import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, statSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createEnvCredentials } from '../server/env-credentials.js';
import { createStore } from '../server/store.js';
import { createApp } from '../server/index.js';
import { request } from 'node:http';

// Native fetch normalizes Host; use HTTP directly to test the production callback host.
function localRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = request(
      url,
      { method: options.method || 'GET', headers: options.headers },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () =>
          resolve(
            new Response(Buffer.concat(chunks), { status: res.statusCode, headers: res.headers }),
          ),
        );
      },
    );
    req.on('error', reject);
    req.end(options.body);
  });
}

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'butler-credentials-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { dir, file: join(dir, '.env') };
}
test('.env credentials persist privately without entering process.env or public status', (t) => {
  const { file } = fixture(t);
  const before = process.env.BUTLER_X_ACCESS_TOKEN;
  const credentials = createEnvCredentials(file);
  const token = 'test-only-$token#not-a-real-key';
  credentials.save({
    xToken: token,
    linkedinToken: 'test-only-linkedin',
    linkedinAuthor: 'urn:li:person:123',
  });
  assert.equal(createEnvCredentials(file).read().xToken, token);
  assert.equal(process.env.BUTLER_X_ACCESS_TOKEN, before);
  assert.equal(credentials.status().x, true);
  assert.equal(credentials.status().linkedin, true);
  assert.ok(!JSON.stringify(credentials.status()).includes(token));
  assert.ok(!JSON.stringify(credentials.status()).includes('test-only-linkedin'));
  if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600);
});
test('migration preserves existing values and never resurrects disconnected accounts', (t) => {
  const { file } = fixture(t);
  writeFileSync(
    file,
    "# Keep this setting\nOTHER='untouched'\n  export BUTLER_X_ACCESS_TOKEN = 'current'\n",
  );
  const legacy = {
    read: () => ({ xToken: 'old', linkedinToken: 'migrated', linkedinAuthor: 'urn:li:person:12' }),
  };
  const credentials = createEnvCredentials(file, legacy);
  assert.equal(credentials.read().xToken, 'current');
  assert.equal(credentials.read().linkedinToken, 'migrated');
  credentials.save({ xToken: '', linkedinToken: '', linkedinAuthor: '' });
  const reopened = createEnvCredentials(file, legacy);
  assert.equal(reopened.status().x, false);
  assert.equal(reopened.status().linkedin, false);
  assert.match(readFileSync(file, 'utf8'), /# Keep this setting\nOTHER='untouched'/);
});
test('credentials reject newline injection, unknown fields and symlink destinations', (t) => {
  const { file, dir } = fixture(t);
  const credentials = createEnvCredentials(file);
  assert.throws(() => credentials.save({ xToken: 'secret\nVITE_LEAK=secret' }), /single-line/);
  assert.throws(() => credentials.save({ password: 'secret' }), /Unknown/);
  assert.ok(!readFileSync(file, 'utf8').includes('secret'));
  if (process.platform !== 'win32') {
    const link = join(dir, '.env.link');
    symlinkSync(file, link);
    assert.throws(() => createEnvCredentials(link), /not a link/);
  }
});
test('API never returns tokens, raw invalid JSON, or credentials files', async (t) => {
  const { file, dir } = fixture(t);
  const vault = createEnvCredentials(file),
    store = createStore(join(dir, 'data'));
  const sentinel = 'TEST_ONLY_SECRET_DO_NOT_ECHO_12345';
  vault.save({ xToken: sentinel });
  const { app } = createApp({ store, vault, model: { status: async () => ({ online: false }) } });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.ok(!(await (await fetch(base + '/api/state')).text()).includes(sentinel));
  for (const path of [
    '/.env',
    '/%2eenv',
    '/.env.backup',
    '/data/credentials.enc',
    '/.git/config',
  ]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 404);
    assert.ok(!(await response.text()).includes(sentinel));
  }
  const response = await fetch(base + '/api/connections', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'X-Butler-Client': 'office' },
    body: `{"xToken":"${sentinel}`,
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Invalid JSON request body.' });
  assert.ok(!JSON.stringify(store.events()).includes(sentinel));
});
test('OAuth routes accept only browser-bound callbacks and disconnect clears refresh access', async (t) => {
  const { file, dir } = fixture(t);
  const vault = createEnvCredentials(file),
    store = createStore(join(dir, 'data'));
  vault.save({ xClientId: 'public-client' });
  let exchanges = 0;
  const { app } = createApp({
    store,
    vault,
    model: {},
    oauthFetch: async () => {
      exchanges++;
      return {
        ok: true,
        json: async () => ({
          access_token: 'SECRET_TEST_ACCESS',
          refresh_token: 'SECRET_TEST_REFRESH',
          token_type: 'bearer',
          expires_in: 7200,
          scope: 'tweet.read tweet.write users.read offline.access',
        }),
      };
    },
  });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = {
    Host: '127.0.0.1:4310',
    'Content-Type': 'application/json',
    'X-Butler-Client': 'office',
  };
  const start = await localRequest(base + '/api/oauth/x/start', {
    method: 'POST',
    headers,
    body: '{}',
  });
  assert.equal(start.status, 200, await start.clone().text());
  const cookie = start.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly; SameSite=Lax/);
  const { url } = await start.json();
  const state = new URL(url).searchParams.get('state');
  const callback = `${base}/api/oauth/x/callback?state=${state}&code=test-code`;
  const unbound = await localRequest(callback, {
    headers: { Host: '127.0.0.1:4310', 'Sec-Fetch-Site': 'cross-site' },
    redirect: 'manual',
  });
  assert.equal(unbound.headers.get('location'), '/?connection=x-failed');
  assert.equal(exchanges, 0);
  const bound = await localRequest(callback, {
    headers: {
      Host: '127.0.0.1:4310',
      Cookie: cookie.split(';')[0],
      'Sec-Fetch-Site': 'cross-site',
    },
    redirect: 'manual',
  });
  assert.equal(bound.status, 303);
  assert.equal(bound.headers.get('location'), '/?connection=x-authorized');
  assert.equal(bound.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(exchanges, 1);
  assert.equal(vault.status().xAuthorized, true);
  assert.ok(!JSON.stringify(store.events()).includes('SECRET_TEST'));
  const stateBody = await (await fetch(base + '/api/state')).text();
  assert.ok(!stateBody.includes('SECRET_TEST'));
  const disconnect = await fetch(base + '/api/connections', {
    method: 'PUT',
    headers,
    body: JSON.stringify({ xToken: '' }),
  });
  assert.equal(disconnect.status, 200);
  assert.equal(vault.read().xRefreshToken, '');
  assert.equal(vault.status().xAuthorized, false);
  const navigationHeaders = { Host: '127.0.0.1:4310', 'Sec-Fetch-Site': 'cross-site', 'Sec-Fetch-Mode': 'navigate', 'Sec-Fetch-Dest': 'document' };
  const landing = await localRequest(base + '/?connection=x-authorized', { headers: navigationHeaders });
  assert.equal(landing.status, 200);
  assert.ok(!(await landing.text()).includes('SECRET_TEST'));
  const apiNavigation = await localRequest(base + '/api/state', { headers: navigationHeaders });
  assert.equal(apiNavigation.status, 403);
});
