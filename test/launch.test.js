import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const launcher = new URL('../scripts/launch.js', import.meta.url).href;
async function waitFor(predicate) {
  const deadline = Date.now() + 10000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for launcher');
    await delay(25);
  }
}

async function fixture(t, { slowBuild = false, failServer = false, occupied = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'butler launcher '));
  const portHolder = createServer();
  await new Promise((done) => portHolder.listen(0, '127.0.0.1', done));
  const port = portHolder.address().port;
  if (!occupied) await new Promise((done) => portHolder.close(done));
  mkdirSync(join(root, 'node_modules/vite/bin'), { recursive: true });
  mkdirSync(join(root, 'server'));
  writeFileSync(join(root, 'package.json'), '{"type":"module"}');
  writeFileSync(
    join(root, 'node_modules/vite/bin/vite.js'),
    `
    const { writeFileSync } = require('node:fs');
    writeFileSync('build-started', String(process.pid));
    ${slowBuild ? "setInterval(() => {}, 1000); process.on('SIGTERM', () => { writeFileSync('build-stopped', 'yes'); process.exit(0); });" : ''}
  `,
  );
  writeFileSync(
    join(root, 'server/index.js'),
    failServer
      ? 'process.exit(7);'
      : `
    import { createServer } from 'node:http';
    import { writeFileSync } from 'node:fs';
    const server = createServer((req, res) => { res.end('{}'); });
    process.on('disconnect', () => {
      writeFileSync('server-stopped', 'yes');
      server.close(() => process.exit(0));
    });
    server.listen(${port}, '127.0.0.1', () => writeFileSync('server-started', String(process.pid)));
  `,
  );
  writeFileSync(
    join(root, 'runner.mjs'),
    `
    import { launch } from ${JSON.stringify(launcher)};
    import { writeFileSync } from 'node:fs';
    launch({ root: ${JSON.stringify(root)}, url: 'http://127.0.0.1:${port}',
      openBrowser(url) { writeFileSync(${JSON.stringify(join(root, 'browser-opened'))}, url); }
    }).catch(error => { console.error(error.message); process.exitCode = 1; });
  `,
  );
  const child = spawn(process.execPath, [join(root, 'runner.mjs')], {
    cwd: tmpdir(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (data) => {
    output += data;
  });
  child.stderr.on('data', (data) => {
    output += data;
  });
  const done = new Promise((resolve) => child.once('exit', (code) => resolve(code)));
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await done;
    for (const file of ['server-started', 'build-started']) {
      if (existsSync(join(root, file))) {
        try {
          process.kill(Number(readFileSync(join(root, file), 'utf8')), 'SIGKILL');
        } catch {}
      }
    }
    if (portHolder.listening) await new Promise((done) => portHolder.close(done));
    rmSync(root, { recursive: true, force: true });
  });
  return { child, done, output: () => output, has: (name) => existsSync(join(root, name)) };
}

for (const signal of ['SIGHUP', 'SIGINT', 'SIGTERM', 'SIGKILL']) {
  test(
    `launcher opens the browser and stops its server on ${signal}`,
    { skip: process.platform === 'win32', timeout: 15000 },
    async (t) => {
      const f = await fixture(t);
      await waitFor(() => f.has('browser-opened'));
      assert.ok(f.has('server-started'));
      f.child.kill(signal);
      await f.done;
      await waitFor(() => f.has('server-stopped'));
    },
  );
}

test(
  'closing the terminal during a build stops the build without starting the server',
  { skip: process.platform === 'win32', timeout: 15000 },
  async (t) => {
    const f = await fixture(t, { slowBuild: true });
    await waitFor(() => f.has('build-started'));
    f.child.kill('SIGHUP');
    assert.equal(await f.done, 0);
    assert.ok(f.has('build-stopped'));
    assert.equal(f.has('server-started'), false);
    assert.equal(f.has('browser-opened'), false);
  },
);

test(
  'a server startup failure exits without opening the browser',
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t, { failServer: true });
    assert.equal(await f.done, 1);
    assert.match(f.output(), /stopped during startup/);
    assert.equal(f.has('browser-opened'), false);
  },
);

test(
  'an occupied port is left alone and reported before building',
  { timeout: 15000 },
  async (t) => {
    const f = await fixture(t, { occupied: true });
    assert.equal(await f.done, 1);
    assert.match(f.output(), /already in use/);
    assert.equal(f.has('build-started'), false);
    assert.equal(f.has('browser-opened'), false);
  },
);
