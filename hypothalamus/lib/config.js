'use strict';

const fs = require('fs');
const path = require('path');

const os = require('os');
const DEFAULT_CONFIG_PATH = path.join(os.homedir(), '.claude', 'brain', 'hypothalamus-config.json');

const DEFAULTS = {
  disabled: false,
  whitelisted_paths: [],
  sensitivity_overrides: {},
  warn_on_unparseable: true,
};

function loadConfig(configPath) {
  const resolved = configPath || DEFAULT_CONFIG_PATH;
  try {
    const raw = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
    return {
      disabled: typeof raw.disabled === 'boolean' ? raw.disabled : DEFAULTS.disabled,
      whitelisted_paths: Array.isArray(raw.whitelisted_paths) ? raw.whitelisted_paths : DEFAULTS.whitelisted_paths,
      sensitivity_overrides: (raw.sensitivity_overrides && typeof raw.sensitivity_overrides === 'object')
        ? raw.sensitivity_overrides : DEFAULTS.sensitivity_overrides,
      warn_on_unparseable: typeof raw.warn_on_unparseable === 'boolean' ? raw.warn_on_unparseable : DEFAULTS.warn_on_unparseable,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

module.exports = { loadConfig, DEFAULT_CONFIG_PATH, DEFAULTS };
