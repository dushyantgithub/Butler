import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';

export async function ensureLocalEngine() {
  async function online() {
    try {
      return (await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(700) }))
        .ok;
    } catch {
      return false;
    }
  }
  // An existing Ollama instance belongs to the user; never terminate it.
  if (await online()) return { owned: false, stop() {} };
  const runtimeDir = process.env.BUTLER_RUNTIME_DIR || resolve('.runtime');
  const bundled = resolve(
    process.env.BUTLER_ENGINE_DIR || runtimeDir,
    process.platform === 'win32' ? 'ollama.exe' : 'ollama',
  );
  const local = existsSync(bundled);
  mkdirSync(runtimeDir, { recursive: true });
  const log = openSync(resolve(runtimeDir, 'ollama.log'), 'a', 0o600);
  const child = spawn(local ? bundled : 'ollama', ['serve'], {
    windowsHide: true,
    stdio: ['ignore', log, log],
    env: {
      ...process.env,
      OLLAMA_HOST: '127.0.0.1:11434',
      OLLAMA_NO_CLOUD: '1',
      OLLAMA_KEEP_ALIVE: '0',
      OLLAMA_NUM_PARALLEL: '1',
      OLLAMA_MAX_LOADED_MODELS: '1',
      ...(local ? { OLLAMA_MODELS: resolve(runtimeDir, 'models') } : {}),
    },
  });
  closeSync(log);
  let failed = false;
  child.on('error', () => {
    failed = true;
  });
  child.on('exit', () => {
    failed = true;
  });
  const deadline = Date.now() + 60000;
  while (!failed && Date.now() < deadline) {
    if (await online())
      return {
        owned: true,
        async stop() {
          if (child.exitCode !== null || child.signalCode !== null) return;
          await new Promise((done) => {
            const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
            child.once('exit', () => {
              clearTimeout(timer);
              done();
            });
            child.kill('SIGTERM');
          });
        },
      };
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill('SIGTERM');
  return { owned: false, stop() {} };
}
