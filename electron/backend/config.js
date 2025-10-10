const fs = require('fs/promises');
const path = require('path');

const CONFIG_FILENAME = 'user-config.json';

const DEFAULT_CONFIG = {
  llm: {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    apiKey: '',
  },
};

async function ensureConfig(configPath) {
  try {
    await fs.access(configPath);
  } catch (error) {
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
  }
}

async function readConfig(configPath) {
  await ensureConfig(configPath);
  const buffer = await fs.readFile(configPath);
  const data = JSON.parse(buffer.toString('utf-8'));
  return {
    llm: {
      provider: data?.llm?.provider || DEFAULT_CONFIG.llm.provider,
      model: data?.llm?.model || DEFAULT_CONFIG.llm.model,
      apiKey: data?.llm?.apiKey || '',
    },
  };
}

async function writeConfig(configPath, config) {
  const current = await readConfig(configPath);
  const updated = {
    ...current,
    ...config,
    llm: {
      ...current.llm,
      ...(config.llm || {}),
      apiKey: config?.llm?.apiKey ?? current.llm.apiKey,
    },
  };
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(updated, null, 2));
  return updated;
}

module.exports = {
  CONFIG_FILENAME,
  DEFAULT_CONFIG,
  ensureConfig,
  readConfig,
  writeConfig,
};
