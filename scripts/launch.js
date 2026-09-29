import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

function command(args) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) process.exit(result.status || 1);
}
if (Number(process.versions.node.split('.')[0]) < 24) {
  console.error('Install Node.js 24 or newer from https://nodejs.org');
  process.exit(1);
}
if (!existsSync('node_modules')) command(['ci']);
command(['run', 'build']);
const url = 'http://127.0.0.1:4310';
let existing = false;
try {
  existing = (await fetch(url + '/api/state', { signal: AbortSignal.timeout(1000) })).ok;
} catch {}
let child;
if (!existing) child = spawn(process.execPath, ['server/index.js'], { stdio: 'inherit' });
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(url + '/api/state', { signal: AbortSignal.timeout(700) })).ok) {
      const opener =
        process.platform === 'darwin'
          ? ['open', [url]]
          : process.platform === 'win32'
            ? ['cmd', ['/c', 'start', '', url]]
            : ['xdg-open', [url]];
      const browser = spawn(opener[0], opener[1], { stdio: 'ignore' });
      browser.on('error', () => console.log(`Open ${url} in your browser.`));
      break;
    }
  } catch {}
  await new Promise((r) => setTimeout(r, 500));
}
if (child) {
  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));
  child.on('exit', (code) => {
    process.exitCode = code || 0;
  });
} else console.log('Your existing Butler office is already open.');
