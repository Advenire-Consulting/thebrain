'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const HELPER = path.join(__dirname, '..', 'dopamine-helper.js');
const TEST_DIR = path.join(os.tmpdir(), 'thebrain-dopa-test-' + Date.now());
const TEST_DB = path.join(TEST_DIR, 'signals.db');

function run(...args) {
  return execFileSync('node', [HELPER, ...args], {
    env: { ...process.env, THEBRAIN_SIGNALS_DB: TEST_DB },
    encoding: 'utf-8',
  });
}

describe('dopamine-helper CLI', () => {
  before(() => fs.mkdirSync(TEST_DIR, { recursive: true }));
  after(() => fs.rmSync(TEST_DIR, { recursive: true, force: true }));

  it('--insert creates a lesson and prints confirmation', () => {
    const out = run('--insert', '--brain', 'amygdala', '--domain', 'testing',
                     '--title', 'CLI Test', '--entry', 'Test entry text', '--severity', 'moderate');
    assert.ok(out.includes('Action: created'));
    assert.ok(out.includes('Weight: 50'));
    assert.ok(out.includes('Tier: Inclination'));
  });

  it('--lessons lists tracked lessons', () => {
    const out = run('--lessons');
    assert.ok(out.includes('CLI Test'));
  });

  it('--surface shows tiered output', () => {
    const out = run('--surface');
    assert.ok(out.includes('Surfaced Lessons'));
  });

  it('--insert with --weight overrides default', () => {
    const out = run('--insert', '--brain', 'nucleus-accumbens', '--domain', 'testing',
                     '--title', 'Weight Override', '--entry', 'entry', '--weight', '80');
    assert.ok(out.includes('Weight: 80'));
    assert.ok(out.includes('Tier: Rule'));
  });

  it('--insert without required args exits with error', () => {
    assert.throws(() => run('--insert', '--brain', 'amygdala'), { status: 1 });
  });
});
