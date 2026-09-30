import { dialog, ipcMain, shell } from 'electron';
import { open, writeFile, lstat } from 'node:fs/promises';
import { basename } from 'node:path';
import { assertTrustedSender, MAX_TEXT_BYTES, validateTextExport } from './policy.js';

export function registerNativeBridge({ window, dataDir, runtime, downloader, version }) {
  const handlers = {
    'desktop:info': () => ({
      version,
      platform: process.platform,
      fileDialogs: true,
      computerAutomation: false,
    }),
    'desktop:show-data': async () => {
      const error = await shell.openPath(dataDir);
      if (error) throw new Error('Could not open the Butler data folder.');
    },
    'desktop:choose-folder': async () => {
      const result = await dialog.showOpenDialog(window, {
        title: 'Choose a folder for Butler',
        properties: ['openDirectory'],
      });
      return result.canceled ? null : result.filePaths[0];
    },
    'desktop:open-text': async () => {
      const result = await dialog.showOpenDialog(window, {
        title: 'Open a text file',
        properties: ['openFile'],
        filters: [{ name: 'Text documents', extensions: ['txt', 'md', 'json', 'csv'] }],
      });
      if (result.canceled) return null;
      const file = await open(result.filePaths[0], 'r');
      try {
        const stat = await file.stat();
        if (!stat.isFile() || stat.size > MAX_TEXT_BYTES)
          throw new Error('Choose a text file smaller than 2 MB.');
        const buffer = Buffer.alloc(MAX_TEXT_BYTES + 1);
        const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
        if (bytesRead > MAX_TEXT_BYTES) throw new Error('Choose a text file smaller than 2 MB.');
        return {
          name: basename(result.filePaths[0]),
          text: buffer.subarray(0, bytesRead).toString('utf8'),
        };
      } finally {
        await file.close();
      }
    },
    'desktop:save-text': async (_event, input) => {
      const { text, name } = validateTextExport(input);
      const result = await dialog.showSaveDialog(window, {
        title: 'Save Butler text',
        defaultPath: name,
        filters: [{ name: 'Text documents', extensions: ['txt', 'md', 'json', 'csv'] }],
      });
      if (result.canceled || !result.filePath) return null;
      validateTextExport({ text, name: basename(result.filePath) });
      const existing = await lstat(result.filePath).catch((error) => {
        if (error.code !== 'ENOENT') throw error;
        return null;
      });
      if (existing && (!existing.isFile() || existing.isSymbolicLink()))
        throw new Error('Choose a regular file.');
      await writeFile(result.filePath, text, { mode: 0o600 });
      return { name: basename(result.filePath) };
    },
    'desktop:connect-account': async (_event, platform) => {
      await shell.openExternal(runtime.desktopOAuthURL(platform));
    },
    'desktop:download-model': async (_event, model) => {
      if (runtime.office.busy) throw new Error('Wait for the current assignment to finish.');
      await runtime.engineReady;
      return downloader.start(model);
    },
    'desktop:download-status': () => downloader.status(),
    'desktop:cancel-download': () => downloader.stop(),
  };
  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, (event, ...args) => {
      assertTrustedSender(event, window);
      return handler(event, ...args);
    });
  }
  return () => {
    for (const channel of Object.keys(handlers)) ipcMain.removeHandler(channel);
  };
}
