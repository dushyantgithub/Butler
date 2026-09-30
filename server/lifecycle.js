import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { ensureLocalEngine } from './runtime.js';

// Shared by the terminal launcher and Electron. Binding comes before database recovery.
export async function startOfficeServer({
  createApp,
  port = 4310,
  engineFactory = ensureLocalEngine,
  ...options
} = {}) {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  let context;
  try {
    context = createApp(options);
  } catch (error) {
    server.close();
    throw error;
  }
  server.on('request', context.app);
  const { office, store, model } = context;
  const engineReady = engineFactory().catch(() => ({ stop() {} }));
  const timer = setInterval(() => office.tick(), 30000);
  let closing;
  const close = () =>
    (closing ||= (async () => {
      clearInterval(timer);
      server.close();
      server.closeIdleConnections();
      if (office.busy) office.stop();
      await context.jobWorker?.close();
      const deadline = Date.now() + 220000;
      while (office.busy && Date.now() < deadline) await delay(300);
      try {
        await model.unload(store.settings().model);
      } catch {}
      const engine = await engineReady;
      await engine.stop();
      store.close();
      server.closeAllConnections();
    })());
  return { ...context, server, close, engineReady };
}
