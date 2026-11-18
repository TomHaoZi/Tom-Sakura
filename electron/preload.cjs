const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  windowAction: (action) => { if (['minimize', 'maximize', 'close'].includes(action)) ipcRenderer.send('window:action', action); },
  copyPlaybackDiagnostics: (payload) => ipcRenderer.invoke('playback:copy-diagnostic', payload),
  getWindowState: () => ipcRenderer.invoke('window:state'),
  setPlaybackActive: (active) => { if (typeof active === 'boolean') ipcRenderer.send('playback:activity', active); },
  importSources: () => ipcRenderer.invoke('sources:import'),
  loadSources: () => ipcRenderer.invoke('sources:load'),
  catalogList: (query, category) => ipcRenderer.invoke('catalog:list', query, category),
  catalogBrowse: (options) => ipcRenderer.invoke('catalog:browse', options),
  catalogDetail: (id) => ipcRenderer.invoke('catalog:detail', id),
  catalogResolve: (id, episode, refresh = false) => ipcRenderer.invoke('catalog:resolve', id, episode, refresh),
  onMaximized: (callback) => {
    const handler = (_event, value) => callback(value);
    ipcRenderer.on('window:maximized', handler);
    return () => ipcRenderer.removeListener('window:maximized', handler);
  },
});
