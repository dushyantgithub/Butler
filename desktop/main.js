import { app, BrowserWindow, dialog, Menu, session, shell } from 'electron';
import { existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/index.js';
import { startOfficeServer } from '../server/lifecycle.js';
import { registerNativeBridge } from './native.js';
import { OFFICE_URL, isOfficeURL, isExternalURL } from './policy.js';
import { createModelDownloader } from './model-download.js';

const desktopDir = fileURLToPath(new URL('.', import.meta.url));
app.setName('Butler');
// Separate disposable profiles are also used by the desktop smoke checks.
if (process.env.BUTLER_DESKTOP_DATA_DIR)
  app.setPath('userData', resolve(process.env.BUTLER_DESKTOP_DATA_DIR));
if (!app.requestSingleInstanceLock()) app.quit();
else {
  let window,
    runtime,
    bootTask,
    quitting = false,
    mayQuit = false;
  const downloader = createModelDownloader();
  app.on('second-instance', () => {
    if (!window || window.isDestroyed()) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', (event) => {
    if (mayQuit) return;
    event.preventDefault();
    if (quitting) return;
    quitting = true;
    void (async () => {
      await bootTask?.catch(() => {});
      if (window && !window.isDestroyed()) {
        window.setTitle('Butler — closing the office…');
        await window.loadFile(join(desktopDir, 'closing.html')).catch(() => {});
      }
      await downloader.stop();
      await runtime?.close();
    })()
      .catch((error) => console.error('Butler shutdown:', error.message))
      .finally(() => {
        mayQuit = true;
        app.quit();
      });
  });
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => app.quit());
  app.whenReady().then(() => {
    bootTask = boot();
    bootTask.catch((error) => {
      dialog.showErrorBox(
        'Butler could not open',
        error.code === 'EADDRINUSE'
          ? 'Another Butler instance (or another app) is using port 4310. Close it, then open Butler again.'
          : error.message,
      );
      app.quit();
    });
  });

  async function boot() {
    const dataDir = app.getPath('userData');
    mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    process.chdir(dataDir);
    process.env.BUTLER_DATA_DIR = join(dataDir, 'data');
    process.env.BUTLER_RUNTIME_DIR = join(dataDir, 'runtime');
    const bundledEngine = app.isPackaged
      ? join(process.resourcesPath, 'ollama')
      : join(app.getAppPath(), 'build-resources', 'runtime', process.platform);
    if (existsSync(join(bundledEngine, process.platform === 'win32' ? 'ollama.exe' : 'ollama'))) {
      process.env.BUTLER_ENGINE_DIR = bundledEngine;
    }
    session.defaultSession.setPermissionRequestHandler(
      (contents, permission, callback, details) => {
        callback(
          contents === window?.webContents &&
            permission === 'clipboard-sanitized-write' &&
            details.isMainFrame &&
            isOfficeURL(details.requestingUrl),
        );
      },
    );
    session.defaultSession.setPermissionCheckHandler(
      (contents, permission, origin) =>
        contents === window?.webContents &&
        permission === 'clipboard-sanitized-write' &&
        isOfficeURL(origin),
    );
    runtime = await startOfficeServer({ createApp });
    if (quitting) return;
    window = new BrowserWindow({
      title: 'Butler',
      width: 1440,
      height: 960,
      minWidth: 960,
      minHeight: 680,
      backgroundColor: '#f5f1e9',
      show: false,
      webPreferences: {
        preload: join(desktopDir, 'preload.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        webviewTag: false,
      },
    });
    window.on('close', (event) => {
      if (!mayQuit) {
        event.preventDefault();
        app.quit();
      }
    });
    const external = (url) => {
      if (isExternalURL(url)) void shell.openExternal(url).catch(() => {});
    };
    window.webContents.setWindowOpenHandler(({ url }) => {
      external(url);
      return { action: 'deny' };
    });
    window.webContents.on('will-navigate', (event, url) => {
      if (!isOfficeURL(url)) {
        event.preventDefault();
        external(url);
      }
    });
    window.webContents.on('will-redirect', (event, url) => {
      if (!isOfficeURL(url)) event.preventDefault();
    });
    window.webContents.on('will-attach-webview', (event) => event.preventDefault());
    registerNativeBridge({ window, dataDir, runtime, downloader, version: app.getVersion() });
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        ...(process.platform === 'darwin' ? [{ role: 'appMenu' }] : []),
        {
          label: 'File',
          submenu: [
            {
              label: 'Open Butler data folder',
              click: () => {
                void shell.openPath(dataDir);
              },
            },
            { type: 'separator' },
            { role: 'quit' },
          ],
        },
        { role: 'editMenu' },
        {
          label: 'View',
          submenu: [
            { role: 'reload' },
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { role: 'togglefullscreen' },
            ...(!app.isPackaged ? [{ role: 'toggleDevTools' }] : []),
          ],
        },
        { role: 'windowMenu' },
      ]),
    );
    await window.loadURL(OFFICE_URL);
    window.show();
  }
}
