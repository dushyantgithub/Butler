import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function portInUse(url) {
  const { hostname, port } = new URL(url);
  return new Promise((done) => {
    const socket = createConnection({ host: hostname, port: Number(port) });
    socket.setTimeout(1000);
    const finish = (busy) => {
      socket.destroy();
      done(busy);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(true));
  });
}

export async function launch({
  root = projectRoot,
  url = 'http://127.0.0.1:4310',
  openBrowser = (address) => {
    const [command, args] =
      process.platform === 'darwin'
        ? ['open', [address]]
        : process.platform === 'win32'
          ? ['cmd', ['/c', 'start', '', address]]
          : ['xdg-open', [address]];
    const browser = spawn(command, args, { stdio: 'ignore' });
    browser.on('error', () => console.log(`Open ${address} in your browser.`));
    browser.on('exit', (code) => {
      if (code) console.log(`Open ${address} in your browser.`);
    });
  },
} = {}) {
  if (Number(process.versions.node.split('.')[0]) < 24) {
    throw new Error('Install Node.js 24 or newer from https://nodejs.org');
  }

  let active;
  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    console.log('\nStopping Butler…');
    if (!active) return;
    if (active.server) {
      // IPC also lets the server detect an abruptly closed launcher on Windows.
      if (active.child.connected) active.child.disconnect();
    } else if (process.platform !== 'win32') {
      try {
        process.kill(-active.child.pid, 'SIGTERM');
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    } else {
      spawn('taskkill', ['/pid', String(active.child.pid), '/t', '/f'], { stdio: 'ignore' }).on(
        'error',
        () => active?.child.kill(),
      );
    }
  };
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP'];
  for (const signal of signals) process.on(signal, stop);

  function start(command, args, server = false) {
    const child = spawn(command, args, {
      cwd: root,
      // Keep terminal-close signals away from the server while it saves/unloads.
      detached: process.platform !== 'win32',
      stdio: server ? ['inherit', 'inherit', 'inherit', 'ipc'] : 'inherit',
      shell: process.platform === 'win32' && command === 'npm.cmd',
    });
    const task = { child, server, ended: false };
    task.done = new Promise((done) => {
      child.once('error', (error) => done({ error }));
      child.once('exit', (code, signal) => done({ code, signal }));
    }).then((result) => {
      task.ended = true;
      task.result = result;
      return result;
    });
    active = task;
    return task;
  }

  async function run(command, args) {
    const { code, error } = await start(command, args).done;
    if (!stopping && (error || code !== 0)) {
      throw error || new Error(`${command} failed (exit ${code}).`);
    }
  }

  try {
    if (await portInUse(url)) {
      throw new Error(
        `Port ${new URL(url).port} is already in use. Close the existing Butler instance before using this launcher.`,
      );
    }
    if (stopping) return;
    if (!existsSync(resolve(root, 'node_modules'))) {
      await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ci']);
    }
    if (stopping) return;
    await run(process.execPath, ['node_modules/vite/bin/vite.js', 'build']);
    if (stopping) return;
    const server = start(process.execPath, ['server/index.js'], true);
    const deadline = Date.now() + 60000;
    let ready = false;
    while (!stopping && !server.ended && Date.now() < deadline) {
      try {
        ready = (await fetch(`${url}/api/state`, { signal: AbortSignal.timeout(700) })).ok;
      } catch {}
      if (ready) break;
      await delay(250);
    }
    if (stopping) return;
    if (server.ended)
      throw server.result.error || new Error('Butler stopped during startup. See the error above.');
    if (!ready) throw new Error('Butler did not become ready within 60 seconds.');
    console.log(
      `\nButler is ready at ${url}\nKeep this window open. Close it or press Ctrl+C to stop Butler.\nClosing only the browser tab leaves Butler running.\n`,
    );
    await openBrowser(url);
    const { code, error } = await server.done;
    if (!stopping && (error || code !== 0))
      throw error || new Error(`Butler stopped (exit ${code}).`);
  } finally {
    if (active && !active.ended) {
      stop();
      await active.done;
    }
    for (const signal of signals) process.off(signal, stop);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  launch().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
