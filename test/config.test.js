'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST_DIR = path.join(os.tmpdir(), 'thebrain-config-test-' + Date.now());

describe('config', () => {
  before(() => fs.mkdirSync(TEST_DIR, { recursive: true }));
  after(() => {
    delete process.env.THEBRAIN_CONFIG;
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('returns defaults when no config file exists', () => {
    process.env.THEBRAIN_CONFIG = path.join(TEST_DIR, 'nonexistent.json');
    delete require.cache[require.resolve('../lib/config')];
    const { loadConfig } = require('../lib/config');
    const config = loadConfig();
    assert.deepStrictEqual(config.workspaces, []);
    assert.deepStrictEqual(config.conversationDirs, []);
  });

  it('loads workspaces and conversation dirs from config file', () => {
    const configPath = path.join(TEST_DIR, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({
      workspaces: [{ name: 'test', path: '/tmp/test-workspace' }],
      conversationDirs: ['/tmp/.claude/projects/-tmp-test-workspace'],
    }));
    process.env.THEBRAIN_CONFIG = configPath;
    delete require.cache[require.resolve('../lib/config')];
    const { loadConfig } = require('../lib/config');
    const config = loadConfig();
    assert.strictEqual(config.workspaces.length, 1);
    assert.strictEqual(config.workspaces[0].name, 'test');
    assert.strictEqual(config.conversationDirs.length, 1);
  });

  it('deriveConversationDir encodes path correctly', () => {
    delete require.cache[require.resolve('../lib/config')];
    const { deriveConversationDir } = require('../lib/config');
    const result = deriveConversationDir('/home/user/websites');
    assert.ok(result.endsWith('-home-user-websites'));
    assert.ok(result.includes('.claude/projects/'));
  });

  it('saveConfig writes valid JSON', () => {
    delete require.cache[require.resolve('../lib/config')];
    const { saveConfig, loadConfig } = require('../lib/config');
    const outPath = path.join(TEST_DIR, 'write-test.json');
    const data = { workspaces: [{ name: 'w', path: '/tmp/w' }], conversationDirs: ['/tmp/c'] };
    saveConfig(data, outPath);
    const loaded = loadConfig(outPath);
    assert.strictEqual(loaded.workspaces[0].name, 'w');
  });
});
