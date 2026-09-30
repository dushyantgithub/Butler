import assert from 'node:assert/strict';
import { _electron as electron } from 'playwright';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConnection } from 'node:net';

const root = fileURLToPath(new URL('..', import.meta.url));
const occupied = await new Promise((done) => {
  const socket = createConnection({ host: '127.0.0.1', port: 4310 });
  socket.on('connect', () => {
    socket.destroy();
    done(true);
  });
  socket.on('error', () => done(false));
});
if (occupied) throw new Error('Close the running Butler instance before the desktop smoke check.');
const profile = await mkdtemp(join(tmpdir(), 'butler-desktop-smoke-'));
const input = join(profile, 'sample.txt');
const output = join(profile, 'export.txt');
await writeFile(input, 'A native file chosen by the user.');
const env = { ...process.env, BUTLER_DESKTOP_DATA_DIR: profile };
delete env.ELECTRON_RUN_AS_NODE;
let desktop;
let previousClipboard;
try {
  desktop = await electron.launch({
    ...(process.argv[2]
      ? { executablePath: resolve(process.argv[2]), args: [] }
      : { args: [root] }),
    env,
    timeout: 60000,
  });
  const page = await desktop.firstWindow();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.waitForSelector('canvas', { timeout: 30000 });
  const info = await page.evaluate(() => window.butlerDesktop.getInfo());
  assert.equal(info.fileDialogs, true);
  assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
  previousClipboard = await desktop.evaluate(({ clipboard }) => clipboard.readText());
  await page.evaluate(() => navigator.clipboard.writeText('Butler clipboard check'));
  assert.equal(
    await desktop.evaluate(({ clipboard }) => clipboard.readText()),
    'Butler clipboard check',
  );
  const engineDeadline = Date.now() + 65000;
  let engineOnline = false;
  while (Date.now() < engineDeadline) {
    const status = await fetch('http://127.0.0.1:4310/api/model').then((response) =>
      response.json(),
    );
    if (status.online) {
      engineOnline = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  assert.ok(engineOnline, 'The bundled local engine must start without an Ollama installation.');
  const preferences = await desktop.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences(),
  );
  assert.equal(preferences.nodeIntegration, false);
  assert.equal(preferences.contextIsolation, true);
  assert.equal(preferences.sandbox, true);
  await desktop.evaluate(
    ({ dialog, shell }, files) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [files.input] });
      dialog.showSaveDialog = async () => ({ canceled: false, filePath: files.output });
      globalThis.butlerOpenedURLs = [];
      shell.openExternal = async (url) => {
        globalThis.butlerOpenedURLs.push(url);
      };
    },
    { input, output },
  );
  assert.equal(
    (await page.evaluate(() => window.butlerDesktop.openTextFile())).text,
    'A native file chosen by the user.',
  );
  await page.evaluate(() =>
    window.butlerDesktop.saveTextFile({
      name: 'export.txt',
      text: 'Saved through the native bridge.',
    }),
  );
  assert.equal(await readFile(output, 'utf8'), 'Saved through the native bridge.');
  await page.evaluate(() => window.open('file:///tmp/should-not-open'));
  await page.evaluate(() => window.open('https://example.com/'));
  const urls = await desktop.evaluate(() => globalThis.butlerOpenedURLs);
  assert.deepEqual(urls, ['https://example.com/']);
  await mkdir(join(root, '.runtime'), { recursive: true });
  await page.screenshot({ path: join(root, '.runtime/desktop-smoke.png') });
  assert.deepEqual(errors, []);
  await desktop.evaluate(({ clipboard }, text) => clipboard.writeText(text), previousClipboard);
  previousClipboard = undefined;
  console.log('Desktop UI, bundled engine, and native bridge checks passed; checking shutdown…');
  await desktop.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0].close();
  });
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const running = await fetch('http://127.0.0.1:4310/api/state', {
      signal: AbortSignal.timeout(1000),
    }).then(
      () => true,
      () => false,
    );
    if (!running) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  // Playwright holds a main-process debugger connection; release it after shutdown.
  await desktop.close();
  const stillRunning = await fetch('http://127.0.0.1:4310/api/state', {
    signal: AbortSignal.timeout(1000),
  }).then(
    () => true,
    () => false,
  );
  assert.equal(stillRunning, false, 'Closing the app must stop the server.');
  console.log(
    'Desktop smoke check passed: window, SQLite, isolated renderer, native file dialogs, external links, and shutdown.',
  );
} finally {
  if (previousClipboard !== undefined)
    await desktop
      ?.evaluate(({ clipboard }, text) => clipboard.writeText(text), previousClipboard)
      .catch(() => {});
  await desktop?.close().catch(() => {});
  await rm(profile, { recursive: true, force: true });
}
