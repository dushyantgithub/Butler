import { ensureLocalEngine } from '../server/runtime.js';
const model = process.argv[2] || 'qwen3:4b';
if (!['qwen3:1.7b', 'qwen3:4b'].includes(model)) throw new Error('Choose qwen3:1.7b or qwen3:4b.');
const engine = await ensureLocalEngine();
try {
  console.log(
    `Downloading ${model} from Ollama (about ${model === 'qwen3:4b' ? '2.5' : '1.4'} GB, once). No model is loaded into memory by this download.`,
  );
  const response = await fetch('http://127.0.0.1:11434/api/pull', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: true }),
    signal: AbortSignal.timeout(30 * 60 * 1000),
  });
  if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}.`);
  const decoder = new TextDecoder();
  let buffer = '',
    lastProgress = -1,
    done = false;
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines.filter(Boolean)) {
      const event = JSON.parse(line);
      if (event.error) throw new Error(event.error);
      if (event.total) {
        const p = Math.floor(((event.completed || 0) / event.total) * 10) * 10;
        if (p > lastProgress) {
          console.log(`Downloading: ${p}%`);
          lastProgress = p;
        }
      } else {
        console.log(event.status);
        if (event.status === 'success') done = true;
      }
    }
  }
  if (!done)
    throw new Error('Download ended without a success response. Run setup again to resume.');
  console.log('Local model is ready. Start Butler with npm start.');
} catch (e) {
  console.error(
    `Model setup failed: ${e.message}\nInstall Ollama from https://ollama.com/download and run npm run setup:model again.`,
  );
  process.exitCode = 1;
} finally {
  await engine.stop();
}
