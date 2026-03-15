'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const HELPER = path.join(__dirname, '..', 'oxytocin-helper.js');
const TEST_DIR = path.join(os.tmpdir(), 'thebrain-oxy-test-' + Date.now());
const TEST_DB = path.join(TEST_DIR, 'signals.db');

function run(...args) {
  return execFileSync('node', [HELPER, ...args], {
    env: { ...process.env, THEBRAIN_SIGNALS_DB: TEST_DB },
    encoding: 'utf-8',
  });
}

describe('oxytocin-helper CLI', () => {
  before(() => fs.mkdirSync(TEST_DIR, { recursive: true }));
  after(() => fs.rmSync(TEST_DIR, { recursive: true, force: true }));

  it('--insert creates a force', () => {
    const out = run('--insert', '--title', 'Test Force', '--description', 'A test force');
    assert.ok(out.includes('Action: created'));
    assert.ok(out.includes('Score: 50'));
    assert.ok(out.includes('Tier: Planning-mode'));
  });

  it('--insert reinforces existing force with +10', () => {
    const out = run('--insert', '--title', 'Test Force', '--description', 'Updated');
    assert.ok(out.includes('Action: reinforced'));
    assert.ok(out.includes('Score: 60'));
  });

  it('--insert with --score sets explicit score', () => {
    const out = run('--insert', '--title', 'Scored', '--description', 'desc', '--score', '85');
    assert.ok(out.includes('Score: 85'));
    assert.ok(out.includes('Tier: Always-on'));
  });

  it('--insert with --type creates typed force', () => {
    const out = run('--insert', '--title', 'Outcome', '--description', 'desc', '--type', 'behavioral_outcome');
    assert.ok(out.includes('Type: behavioral_outcome'));
  });

  it('--forces lists tracked forces', () => {
    const out = run('--forces');
    assert.ok(out.includes('Test Force'));
  });

  it('--surface shows tiered output', () => {
    const out = run('--surface');
    assert.ok(out.includes('Limbic Forces'));
  });

  it('--insert without required args exits with error', () => {
    assert.throws(() => run('--insert', '--title', 'No Desc'), { status: 1 });
  });
});
