const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '.test-config');

before(() => { fs.mkdirSync(TEST_DIR, { recursive: true }); });
after(() => { fs.rmSync(TEST_DIR, { recursive: true, force: true }); });

describe('loadConfig', () => {
  it('returns defaults when config file does not exist', () => {
    const { loadConfig } = require('../lib/config');
    const config = loadConfig(path.join(TEST_DIR, 'nonexistent.json'));
    assert.equal(config.disabled, false);
    assert.deepEqual(config.whitelisted_paths, []);
    assert.deepEqual(config.sensitivity_overrides, {});
    assert.equal(config.warn_on_unparseable, true);
  });

  it('loads valid config file', () => {
    const { loadConfig } = require('../lib/config');
    const configPath = path.join(TEST_DIR, 'valid.json');
    fs.writeFileSync(configPath, JSON.stringify({
      disabled: false,
      whitelisted_paths: ['/tmp/safe'],
      sensitivity_overrides: { 'test.db': 'code' },
      warn_on_unparseable: false,
    }));
    const config = loadConfig(configPath);
    assert.deepEqual(config.whitelisted_paths, ['/tmp/safe']);
    assert.equal(config.warn_on_unparseable, false);
  });

  it('returns defaults for malformed JSON', () => {
    const { loadConfig } = require('../lib/config');
    const configPath = path.join(TEST_DIR, 'bad.json');
    fs.writeFileSync(configPath, 'not valid json{{{');
    const config = loadConfig(configPath);
    assert.equal(config.disabled, false);
  });

  it('merges partial config with defaults', () => {
    const { loadConfig } = require('../lib/config');
    const configPath = path.join(TEST_DIR, 'partial.json');
    fs.writeFileSync(configPath, JSON.stringify({ disabled: true }));
    const config = loadConfig(configPath);
    assert.equal(config.disabled, true);
    assert.deepEqual(config.whitelisted_paths, []);
    assert.equal(config.warn_on_unparseable, true);
  });
});
