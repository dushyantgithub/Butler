const { contextBridge, ipcRenderer } = require('electron');
// Expose named operations, never Node, a shell, arbitrary paths, or raw IPC.
contextBridge.exposeInMainWorld(
  'butlerDesktop',
  Object.freeze({
    getInfo: () => ipcRenderer.invoke('desktop:info'),
    openTextFile: () => ipcRenderer.invoke('desktop:open-text'),
    saveTextFile: (input) => ipcRenderer.invoke('desktop:save-text', input),
    chooseFolder: () => ipcRenderer.invoke('desktop:choose-folder'),
    showDataFolder: () => ipcRenderer.invoke('desktop:show-data'),
    connectAccount: (platform) => ipcRenderer.invoke('desktop:connect-account', platform),
    downloadModel: (model) => ipcRenderer.invoke('desktop:download-model', model),
    getDownload: () => ipcRenderer.invoke('desktop:download-status'),
    cancelDownload: () => ipcRenderer.invoke('desktop:cancel-download'),
  }),
);
