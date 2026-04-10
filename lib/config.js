'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const BRAIN_DIR = path.join(os.homedir(), '.claude', 'brain');
const DEFAULT_CONFIG_PATH = path.join(BRAIN_DIR, 'config.json');

function getConfigPath() {
  return process.env.THEBRAIN_CONFIG || DEFAULT_CONFIG_PATH;
}

// Load brain config from disk
function loadConfig(configPath) {
  const resolved = configPath || getConfigPath();
  try {
    const raw = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
    return {
      workspaces: Array.isArray(raw.workspaces) ? raw.workspaces : [],
      conversationDirs: Array.isArray(raw.conversationDirs)
        ? raw.conversationDirs.map(d => d.replace(/^~/, os.homedir()))
        : [],
      regions: raw.regions || {},
    };
  } catch {
    return { workspaces: [], conversationDirs: [], regions: {} };
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

// Check if a brain region is enabled (absent = true, false = off, object = check .enabled)
function isRegionEnabled(regionName) {
  const config = loadConfig();
  const entry = config.regions[regionName];
  if (entry === undefined) return true;
  if (entry === false) return false;
  if (typeof entry === 'object') return entry.enabled !== false;
  return true;
}

// Check if a feature within a region is enabled (region off = feature off)
function isFeatureEnabled(regionName, featureName) {
  const config = loadConfig();
  const entry = config.regions[regionName];
  if (entry === undefined) return true;
  if (entry === false) return false;
  if (typeof entry === 'object') {
    if (entry.enabled === false) return false;
    const features = entry.features || {};
    return features[featureName] !== false;
  }
  return true;
}

// Get a named setting from a region config object (e.g., prefrontal threshold)
function getRegionSetting(regionName, settingName, defaultValue) {
  const config = loadConfig();
  const entry = config.regions[regionName];
  if (entry === undefined || entry === false) return defaultValue;
  if (typeof entry === 'object') return entry[settingName] ?? defaultValue;
  return defaultValue;
}

module.exports = {
  BRAIN_DIR, DEFAULT_CONFIG_PATH,
  loadConfig, deriveConversationDir, saveConfig, getConfigPath,
  isRegionEnabled, isFeatureEnabled, getRegionSetting,
};
