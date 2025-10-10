const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const PROJECT_FILENAME = 'project.json';

function generateId(prefix) {
  try {
    return `${prefix}-${crypto.randomUUID()}`;
  } catch (err) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

function isoNow() {
  return new Date().toISOString();
}

function defaultProject(projectId, title) {
  const now = isoNow();
  return {
    id: projectId,
    title: title || 'Untitled',
    abstract: '',
    owner: 'local',
    createdAt: now,
    updatedAt: now,
    notation: [],
    definitions: [],
    facts: [],
    lemmas: [],
    conjectures: [],
    ideas: [],
    pitfalls: [],
    chatHistory: [],
    chatThreads: [],
    attempts: [],
    attachments: [],
  };
}

function ensureProjectShape(project) {
  const result = { ...project };
  const arrays = [
    'notation',
    'definitions',
    'facts',
    'lemmas',
    'conjectures',
    'ideas',
    'pitfalls',
    'chatHistory',
    'attempts',
    'attachments',
  ];
  for (const key of arrays) {
    if (!Array.isArray(result[key])) {
      result[key] = [];
    }
  }
  if (Array.isArray(result.lemmas)) {
    result.lemmas = result.lemmas.map((lemma) => ({
      ...lemma,
      proof: typeof lemma.proof === 'string' ? lemma.proof : '',
    }));
  }

  const chatHistory = Array.isArray(result.chatHistory) ? result.chatHistory : [];
  result.chatHistory = chatHistory
    .filter((message) => message && typeof message.content === 'string')
    .map((message, index) => ({
      id: typeof message.id === 'string' && message.id ? message.id : `chat-${index}`,
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
    }));
  if (typeof result.abstract !== 'string') {
    result.abstract = '';
  }
  if (typeof result.owner !== 'string' || !result.owner) {
    result.owner = 'local';
  }
  if (typeof result.title !== 'string') {
    result.title = 'Untitled';
  }
  if (typeof result.createdAt !== 'string') {
    result.createdAt = isoNow();
  }
  if (typeof result.updatedAt !== 'string') {
    result.updatedAt = isoNow();
  }

  normalizeChatThreads(result);
  stripSensitiveSettings(result);
  return result;
}

// Remove any persisted LLM credentials from a project snapshot before it is used or saved.
function stripSensitiveSettings(project) {
  if (!project || typeof project !== 'object') {
    return;
  }

  if (project.settings && typeof project.settings === 'object') {
    const settings = { ...project.settings };
    if (settings.llm && typeof settings.llm === 'object') {
      const { apiKey: _apiKey, ...rest } = settings.llm;
      if (Object.keys(rest).length > 0) {
        settings.llm = rest;
      } else {
        delete settings.llm;
      }
    }
    if (Object.keys(settings).length > 0) {
      project.settings = settings;
    } else {
      delete project.settings;
    }
  }

  if (project.llm && typeof project.llm === 'object') {
    const { apiKey: _apiKey, ...rest } = project.llm;
    if (Object.keys(rest).length > 0) {
      project.llm = rest;
    } else {
      delete project.llm;
    }
  }
}

function normalizeMessages(messages) {
  const source = Array.isArray(messages) ? messages : [];
  return source
    .filter((message) => message && typeof message.content === 'string')
    .map((message, index) => ({
      id: typeof message.id === 'string' && message.id ? message.id : generateId(`chat-${index}`),
      role: message.role === 'assistant' ? 'assistant' : 'user',
      content: message.content,
    }));
}

function normalizeChatThreads(project) {
  const now = isoNow();
  const threads = Array.isArray(project.chatThreads) ? project.chatThreads : [];
  const normalizedThreads = threads
    .map((thread, index) => {
      const createdAt = typeof thread?.createdAt === 'string' ? thread.createdAt : now;
      const updatedAt = typeof thread?.updatedAt === 'string' ? thread.updatedAt : createdAt;
      const title = typeof thread?.title === 'string' && thread.title.trim()
        ? thread.title.trim()
        : `Thread #${index + 1}`;
      return {
        id: typeof thread?.id === 'string' && thread.id ? thread.id : generateId('thread'),
        title,
        messages: normalizeMessages(thread?.messages),
        createdAt,
        updatedAt,
      };
    })
    .filter((thread) => thread && Array.isArray(thread.messages));

  if (!normalizedThreads.length) {
    const fallbackMessages = normalizeMessages(project.chatHistory);
    if (fallbackMessages.length) {
      const createdAt = now;
      normalizedThreads.push({
        id: generateId('thread'),
        title: 'Thread #1',
        messages: fallbackMessages,
        createdAt,
        updatedAt: createdAt,
      });
    }
  }

  project.chatThreads = normalizedThreads;
  delete project.chatHistory;
}

function computeEtag(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function atomicWrite(filePath, buffer) {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tempPath = path.join(dir, `${path.basename(filePath)}.${Date.now()}.tmp`);
  await fs.writeFile(tempPath, buffer);
  await fs.rename(tempPath, filePath);
}

class StorageService {
  constructor(primaryRoot, extraRoots = []) {
    this.primaryRoot = primaryRoot;
    this.extraRoots = extraRoots.filter(Boolean);
    this.roots = [this.primaryRoot, ...this.extraRoots];
  }

  async init() {
    await fs.mkdir(this.primaryRoot, { recursive: true });
  }

  projectDir(root, projectId) {
    return path.join(root, projectId);
  }

  projectPath(root, projectId) {
    return path.join(this.projectDir(root, projectId), PROJECT_FILENAME);
  }

  async resolveProject(projectId) {
    for (const root of this.roots) {
      try {
        await fs.access(this.projectPath(root, projectId));
        return { root, path: this.projectPath(root, projectId) };
      } catch (err) {
        // ignore and continue
      }
    }
    return null;
  }

  async projectExists(projectId) {
    return (await this.resolveProject(projectId)) !== null;
  }

  async createProject(projectId, title) {
    if (await this.projectExists(projectId)) {
      const error = new Error(`Project '${projectId}' already exists`);
      error.code = 'EEXIST';
      throw error;
    }
    const project = defaultProject(projectId, title);
    const etag = await this.writeProject(project);
    return { project, etag };
  }

  async readProject(projectId) {
    const resolved = await this.resolveProject(projectId);
    if (!resolved) {
      const error = new Error(`Project '${projectId}' not found`);
      error.code = 'ENOENT';
      throw error;
    }
    const buffer = await fs.readFile(resolved.path);
    const etag = computeEtag(buffer);
    const data = JSON.parse(buffer.toString('utf-8'));
    const project = ensureProjectShape(data);
    return { project, etag, root: resolved.root };
  }

  async writeProject(project) {
    const normalized = ensureProjectShape({ ...project });
    stripSensitiveSettings(normalized);
    const resolved = await this.resolveProject(project.id);
    const targetRoot = resolved ? resolved.root : this.primaryRoot;
    await fs.mkdir(this.projectDir(targetRoot, project.id), { recursive: true });
    const payload = Buffer.from(JSON.stringify(normalized, null, 2));
    await atomicWrite(this.projectPath(targetRoot, project.id), payload);
    return computeEtag(payload);
  }

  async listProjects() {
    const seen = new Set();
    const results = [];

    for (const root of this.roots) {
      const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const projectId = entry.name;
        if (seen.has(projectId)) continue;
        try {
          const { project } = await this.readProject(projectId);
          results.push({
            id: project.id,
            title: project.title || 'Untitled',
            updatedAt: project.updatedAt,
          });
          seen.add(projectId);
        } catch (err) {
          if (process.env.DEBUG_LIST_PROJECTS) {
            // eslint-disable-next-line no-console
            console.warn(`Failed to read project '${projectId}':`, err);
          }
        }
      }
    }

    results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return results;
  }
}

module.exports = {
  StorageService,
  computeEtag,
};
