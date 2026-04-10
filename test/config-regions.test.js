'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Use a temporary config file for testing
const TEST_CONFIG = path.join(os.tmpdir(), 'thebrain-test-config-' + Date.now() + '.json');
process.env.THEBRAIN_CONFIG = TEST_CONFIG;

// Clear module cache so config.js picks up our env var
delete require.cache[require.resolve('../lib/config')];
const { loadConfig, isRegionEnabled, isFeatureEnabled, getRegionSetting } = require('../lib/config');

function writeConfig(obj) {
  fs.writeFileSync(TEST_CONFIG, JSON.stringify(obj));
  // Clear cached config
  delete require.cache[require.resolve('../lib/config')];
}

try {
  // Test: absent regions key = all enabled
  console.log('Test: absent regions...');
  writeConfig({ workspaces: [], conversationDirs: [] });
  if (!isRegionEnabled('hippocampus')) throw new Error('Expected enabled');
  if (!isFeatureEnabled('hippocampus', 'flow-graph')) throw new Error('Expected enabled');
  console.log('  PASS');

  // Test: region set to false = disabled
  console.log('Test: region false...');
  writeConfig({ workspaces: [], conversationDirs: [], regions: { dlpfc: false } });
  if (isRegionEnabled('dlpfc')) throw new Error('Expected disabled');
  if (isFeatureEnabled('dlpfc', 'read-tracking')) throw new Error('Expected disabled');
  // Other regions still enabled
  if (!isRegionEnabled('hippocampus')) throw new Error('hippocampus should still be enabled');
  console.log('  PASS');

  // Test: region object with enabled true + feature toggle
  console.log('Test: object with features...');
  writeConfig({
    workspaces: [], conversationDirs: [],
    regions: {
      hypothalamus: { enabled: true, features: { 'blast-radius': false, 'bash-analysis': true } }
    }
  });
  if (!isRegionEnabled('hypothalamus')) throw new Error('Region should be enabled');
  if (isFeatureEnabled('hypothalamus', 'blast-radius')) throw new Error('blast-radius should be disabled');
  if (!isFeatureEnabled('hypothalamus', 'bash-analysis')) throw new Error('bash-analysis should be enabled');
  if (!isFeatureEnabled('hypothalamus', 'sensitivity')) throw new Error('absent feature should be enabled');
  console.log('  PASS');

  // Test: region object with enabled false = all disabled
  console.log('Test: object with enabled false...');
  writeConfig({
    workspaces: [], conversationDirs: [],
    regions: { hippocampus: { enabled: false, features: { 'flow-graph': true } } }
  });
  if (isRegionEnabled('hippocampus')) throw new Error('Region should be disabled');
  if (isFeatureEnabled('hippocampus', 'flow-graph')) throw new Error('Feature should be disabled when region is disabled');
  console.log('  PASS');

  // Test: getRegionSetting
  console.log('Test: getRegionSetting...');
  writeConfig({
    workspaces: [], conversationDirs: [],
    regions: { prefrontal: { enabled: true, threshold: 75 } }
  });
  const t = getRegionSetting('prefrontal', 'threshold', 50);
  if (t !== 75) throw new Error('Expected 75, got ' + t);
  // Default when absent
  const d = getRegionSetting('hippocampus', 'threshold', 50);
  if (d !== 50) throw new Error('Expected default 50, got ' + d);
  // Default when region is false
  writeConfig({ workspaces: [], conversationDirs: [], regions: { dlpfc: false } });
  const f = getRegionSetting('dlpfc', 'threshold', 50);
  if (f !== 50) throw new Error('Expected default 50 for disabled region');
  console.log('  PASS');

  // Test: loadConfig preserves regions
  console.log('Test: loadConfig preserves regions...');
  writeConfig({
    workspaces: [], conversationDirs: [],
    regions: { dlpfc: false, prefrontal: { enabled: true, threshold: 80 } }
  });
  const cfg = loadConfig();
  if (!cfg.regions) throw new Error('regions key missing from loadConfig');
  if (cfg.regions.dlpfc !== false) throw new Error('regions.dlpfc should be false');
  if (cfg.regions.prefrontal.threshold !== 80) throw new Error('threshold should be 80');
  console.log('  PASS');

  console.log('\nAll config-regions tests passed.');
} finally {
  try { fs.unlinkSync(TEST_CONFIG); } catch {}
  delete process.env.THEBRAIN_CONFIG;
}
