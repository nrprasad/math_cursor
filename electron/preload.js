const { contextBridge, ipcRenderer } = require('electron');

const MENU_CHANNELS = new Set([
  'menu:saveProject',
  'menu:reloadProject',
  'menu:exportLatex',
  'menu:draftProof',
]);
const CLOSE_CHANNEL = 'app:request-close';

contextBridge.exposeInMainWorld('desktopApi', {
  createProject: (id, title) => ipcRenderer.invoke('project:create', { id, title }),
  getProject: (id) => ipcRenderer.invoke('project:get', { id }),
  saveProject: (project, etag) => ipcRenderer.invoke('project:save', { project, etag }),
  draftProof: (projectId, lemmaId) => ipcRenderer.invoke('project:draftProof', { projectId, lemmaId }),
  exportLatex: (projectId) => ipcRenderer.invoke('project:exportLatex', { projectId }),
  listProjects: () => ipcRenderer.invoke('project:list'),
  chatPrompt: (payload) => ipcRenderer.invoke('project:chatPrompt', payload),
  getConfig: () => ipcRenderer.invoke('config:get'),
  updateConfig: (config) => ipcRenderer.invoke('config:update', config),
  setWindowTitle: (title) => ipcRenderer.invoke('window:setTitle', { title }),
  respondToClose: (shouldClose) => ipcRenderer.invoke('app:close-response', { shouldClose }),
  onAppCloseRequest: (callback) => {
    const listener = () => {
      callback();
    };
    ipcRenderer.on(CLOSE_CHANNEL, listener);
    return () => {
      ipcRenderer.removeListener(CLOSE_CHANNEL, listener);
    };
  },
  onMenu: (channel, callback) => {
    if (!MENU_CHANNELS.has(channel)) {
      return () => {};
    }
    const listener = (_event, payload) => {
      callback(payload);
    };
    ipcRenderer.on(channel, listener);
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
});
