const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

const PROJECT_FILENAME = 'project.json';

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
    attempts: [],
    attachments: [],
    settings: {
      latex: {
        documentClass: 'article',
        packages: ['amsmath', 'amsthm', 'amssymb'],
        preamble: '',
      },
      llm: {
        defaultProvider: 'openai',
        defaultModel: 'gpt-5',
        apiKey: '',
      },
    },
  };
}

function ensureSettings(project) {
  if (!project.settings || typeof project.settings !== 'object') {
    project.settings = {};
  }
  if (!project.settings.latex) {
    project.settings.latex = {
      documentClass: 'article',
      packages: ['amsmath', 'amsthm', 'amssymb'],
      preamble: '',
    };
  }
  if (!Array.isArray(project.settings.latex.packages)) {
    project.settings.latex.packages = ['amsmath', 'amsthm', 'amssymb'];
  }
  if (!project.settings.llm) {
    project.settings.llm = {
      defaultProvider: 'openai',
      defaultModel: 'gpt-5',
      apiKey: '',
    };
  }
  if (typeof project.settings.llm.apiKey !== 'string') {
    project.settings.llm.apiKey = '';
  }
  return project;
}

function ensureProjectShape(project) {
  const result = ensureSettings(project);
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

  if (Array.isArray(result.chatHistory)) {
    result.chatHistory = result.chatHistory
      .filter((message) => message && typeof message.content === 'string')
      .map((message, index) => ({
        id: message.id || `chat-${index}`,
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: message.content,
      }));
  } else {
    result.chatHistory = [];
  }
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
  return result;
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
  constructor(rootDir) {
    this.rootDir = rootDir;
  }

  async init() {
    await fs.mkdir(this.rootDir, { recursive: true });
  }

  projectDir(projectId) {
    return path.join(this.rootDir, projectId);
  }

  projectPath(projectId) {
    return path.join(this.projectDir(projectId), PROJECT_FILENAME);
  }

  async projectExists(projectId) {
    try {
      await fs.access(this.projectPath(projectId));
      return true;
    } catch (err) {
      return false;
    }
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
    const filePath = this.projectPath(projectId);
    const buffer = await fs.readFile(filePath);
    const etag = computeEtag(buffer);
    const data = JSON.parse(buffer.toString('utf-8'));
    const project = ensureProjectShape(data);
    return { project, etag };
  }

  async writeProject(project) {
    const normalized = ensureProjectShape({ ...project });
    const payload = Buffer.from(JSON.stringify(normalized, null, 2));
    await atomicWrite(this.projectPath(project.id), payload);
    return computeEtag(payload);
  }

  async listProjects() {
    const entries = await fs.readdir(this.rootDir, { withFileTypes: true }).catch(() => []);
    const results = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const projectId = entry.name;
      try {
        const { project } = await this.readProject(projectId);
        results.push({
          id: project.id,
          title: project.title || 'Untitled',
          updatedAt: project.updatedAt,
        });
      } catch (err) {
        // skip unreadable projects but continue listing others
        if (process.env.DEBUG_LIST_PROJECTS) {
          // eslint-disable-next-line no-console
          console.warn(`Failed to read project '${projectId}':`, err);
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
