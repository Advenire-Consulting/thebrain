'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const BRAIN_DIR = path.join(os.homedir(), '.claude', 'brain');
const DEFAULT_CONFIG_PATH = path.join(BRAIN_DIR, 'config.json');

function getConfigPath() {
  return process.env.THEBRAIN_CONFIG || DEFAULT_CONFIG_PATH;
}

function loadConfig(configPath) {
  const resolved = configPath || getConfigPath();
  try {
    const raw = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
    return {
      workspaces: Array.isArray(raw.workspaces) ? raw.workspaces : [],
      conversationDirs: Array.isArray(raw.conversationDirs)
        ? raw.conversationDirs.map(d => d.replace(/^~/, os.homedir()))
        : [],
    };
  } catch {
    return { workspaces: [], conversationDirs: [] };
  }
}

function deriveConversationDir(workspacePath) {
  const resolved = path.resolve(workspacePath);
  const encoded = resolved.replace(/\//g, '-');
  return path.join(os.homedir(), '.claude', 'projects', encoded);
}

function saveConfig(config, configPath) {
  const resolved = configPath || getConfigPath();
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify(config, null, 2) + '\n');
}

module.exports = {
  BRAIN_DIR, DEFAULT_CONFIG_PATH,
  loadConfig, deriveConversationDir, saveConfig, getConfigPath,
};
