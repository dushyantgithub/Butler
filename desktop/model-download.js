const MODELS = ['qwen3:1.7b', 'qwen3:4b'];
export function createModelDownloader(fetcher = fetch) {
  let controller, task;
  let state = { active: false, status: '', progress: null, error: '' };
  return {
    status: () => ({ ...state }),
    async stop() {
      controller?.abort();
      await task;
    },
    start(model) {
      if (!MODELS.includes(model)) throw new Error('Choose a supported Butler model.');
      if (state.active) throw new Error('A model is already downloading.');
      controller = new AbortController();
      const current = controller;
      state = { active: true, model, status: 'Starting download…', progress: null, error: '' };
      task = (async () => {
        try {
          const response = await fetcher('http://127.0.0.1:11434/api/pull', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, stream: true }),
            signal: AbortSignal.any([current.signal, AbortSignal.timeout(30 * 60 * 1000)]),
          });
          if (!response.ok)
            throw new Error('The local engine is not ready. Check again in a moment.');
          let buffer = '',
            complete = false;
          const decoder = new TextDecoder();
          const accept = (line) => {
            if (!line.trim()) return;
            const event = JSON.parse(line);
            if (event.error) throw new Error('The model download failed. Please try again.');
            state.status = String(event.status || 'Downloading…').slice(0, 200);
            state.progress = event.total
              ? Math.min(100, Math.floor(((event.completed || 0) / event.total) * 100))
              : null;
            if (event.status === 'success') complete = true;
          };
          for await (const chunk of response.body) {
            buffer += decoder.decode(chunk, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();
            if (buffer.length > 65536) throw new Error('Unexpected engine response.');
            for (const line of lines) accept(line);
          }
          accept(buffer + decoder.decode());
          if (!complete) throw new Error('Download interrupted. Retry to resume.');
          state.status = 'Model ready';
          state.progress = 100;
        } catch (error) {
          state.error = current.signal.aborted ? '' : error.message;
          state.status = current.signal.aborted
            ? 'Download paused. Retry to resume.'
            : 'Download failed';
        } finally {
          state.active = false;
        }
      })();
      return { ...state };
    },
  };
}
