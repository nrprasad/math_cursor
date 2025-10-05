const path = require('path');
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const { StorageService } = require('./backend/storage');
const { draftProofResponse, chatResponse } = require('./backend/llm');
const { buildLatexBundle } = require('./backend/latex');

const isDev = !!process.env.VITE_DEV_SERVER_URL;
let mainWindow;
let storage;

function getStorageRoot() {
  const customRoot = process.env.PROJECT_STORAGE_DIR;
  if (customRoot && customRoot.trim()) {
    return path.resolve(customRoot.trim());
  }
  return path.join(app.getPath('userData'), 'cursor-math-projects');
}

async function ensureStorage() {
  if (!storage) {
    storage = new StorageService(getStorageRoot());
    await storage.init();
  }
  return storage;
}

function createWindow() {
  const baseOptions = {
    width: 1280,
    height: 900,
    backgroundColor: '#020617',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  if (process.platform === 'darwin') {
    baseOptions.titleBarStyle = 'hiddenInset';
    baseOptions.titleBarOverlay = {
      color: '#020617',
      symbolColor: '#e2e8f0',
      height: 36,
    };
  } else if (process.platform === 'win32') {
    baseOptions.titleBarStyle = 'hidden';
    baseOptions.titleBarOverlay = {
      color: '#020617',
      symbolColor: '#e2e8f0',
      height: 36,
    };
  }

  mainWindow = new BrowserWindow(baseOptions);
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setBackgroundColor('#020617');

  if (isDev) {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL;
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    mainWindow.loadFile(indexPath);
  }
}

function serializeError(message, code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

app.whenReady().then(async () => {
  await ensureStorage();
  createWindow();
  setupMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('project:create', async (_event, payload) => {
  const { id, title } = payload || {};
  if (!id || typeof id !== 'string') {
    throw serializeError('Project ID is required', 'BAD_REQUEST');
  }
  try {
    const storageService = await ensureStorage();
    const { project, etag } = await storageService.createProject(id, title || 'Untitled');
    return { project, etag };
  } catch (err) {
    if (err && err.code === 'EEXIST') {
      throw serializeError('Project already exists', 'CONFLICT');
    }
    throw serializeError(err.message || 'Failed to create project', 'INTERNAL_ERROR');
  }
});

ipcMain.handle('project:get', async (_event, payload) => {
  const { id } = payload || {};
  if (!id || typeof id !== 'string') {
    throw serializeError('Project ID is required', 'BAD_REQUEST');
  }
  try {
    const storageService = await ensureStorage();
    const { project, etag } = await storageService.readProject(id);
    return { project, etag };
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw serializeError('Project not found', 'NOT_FOUND');
    }
    throw serializeError(err.message || 'Failed to load project', 'INTERNAL_ERROR');
  }
});

ipcMain.handle('project:save', async (_event, payload) => {
  const { project, etag } = payload || {};
  if (!project || typeof project.id !== 'string') {
    throw serializeError('Valid project payload required', 'BAD_REQUEST');
  }
  if (!etag || typeof etag !== 'string') {
    throw serializeError('ETag required for save', 'BAD_REQUEST');
  }
  try {
    const storageService = await ensureStorage();
    const { project: existing, etag: currentEtag } = await storageService.readProject(project.id);
    if (etag !== currentEtag) {
      throw serializeError('ETag mismatch', 'PRECONDITION_FAILED');
    }
    const updated = {
      ...project,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    const newEtag = await storageService.writeProject(updated);
    return { etag: newEtag };
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw serializeError('Project not found', 'NOT_FOUND');
    }
    if (err && err.code === 'PRECONDITION_FAILED') {
      throw err;
    }
    throw serializeError(err.message || 'Failed to save project', 'INTERNAL_ERROR');
  }
});

ipcMain.handle('project:draftProof', async (_event, payload) => {
  const { projectId, lemmaId } = payload || {};
  if (!projectId) {
    throw serializeError('Project ID is required', 'BAD_REQUEST');
  }
  try {
    const storageService = await ensureStorage();
    await storageService.readProject(projectId);
    return draftProofResponse(projectId, lemmaId);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw serializeError('Project not found', 'NOT_FOUND');
    }
    throw serializeError(err.message || 'Failed to draft proof', 'INTERNAL_ERROR');
  }
});

ipcMain.handle('project:exportLatex', async (_event, payload) => {
  const { projectId } = payload || {};
  if (!projectId) {
    throw serializeError('Project ID is required', 'BAD_REQUEST');
  }
  try {
    const storageService = await ensureStorage();
    const { project } = await storageService.readProject(projectId);
    const { buffer, filename } = await buildLatexBundle(project);
    return { filename, data: buffer.toString('base64') };
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw serializeError('Project not found', 'NOT_FOUND');
    }
    throw serializeError(err.message || 'Failed to export LaTeX', 'INTERNAL_ERROR');
  }
});

ipcMain.handle('project:chatPrompt', async (_event, payload) => {
  const { prompt, provider, model, apiKey, history } = payload || {};
  if (typeof prompt !== 'string' || !prompt.trim()) {
    throw serializeError('Prompt is required', 'BAD_REQUEST');
  }
  try {
    const message = await chatResponse({
      prompt: prompt.trim(),
      provider: typeof provider === 'string' ? provider : undefined,
      model: typeof model === 'string' ? model : undefined,
      apiKey: typeof apiKey === 'string' ? apiKey : undefined,
      history: Array.isArray(history)
        ? history
            .filter((entry) => entry && (entry.role === 'user' || entry.role === 'assistant') && typeof entry.content === 'string')
            .map((entry) => ({ role: entry.role, content: entry.content }))
        : undefined,
    });
    return { message };
  } catch (err) {
    throw serializeError(err.message || 'Failed to query LLM', 'INTERNAL_ERROR');
  }
});

ipcMain.handle('project:list', async () => {
  try {
    const storageService = await ensureStorage();
    const projects = await storageService.listProjects();
    return { projects };
  } catch (err) {
    throw serializeError(err.message || 'Failed to list projects', 'INTERNAL_ERROR');
  }
});

function sendToFocused(channel) {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    win.webContents.send(channel);
  }
}

function setupMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Save Project',
          accelerator: 'CmdOrCtrl+S',
          click: () => sendToFocused('menu:saveProject'),
        },
        {
          label: 'Reload Project',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => sendToFocused('menu:reloadProject'),
        },
        {
          label: 'Export LaTeX',
          accelerator: 'CmdOrCtrl+E',
          click: () => sendToFocused('menu:exportLatex'),
        },
        {
          label: 'Draft Proof',
          accelerator: 'CmdOrCtrl+D',
          click: () => sendToFocused('menu:draftProof'),
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
