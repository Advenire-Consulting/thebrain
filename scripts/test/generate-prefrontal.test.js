'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST_DIR = path.join(os.tmpdir(), 'thebrain-pfc-test-' + Date.now());
const TEST_DB = path.join(TEST_DIR, 'signals.db');
const TEST_OUTPUT = path.join(TEST_DIR, 'prefrontal-live.md');

describe('generate-prefrontal', () => {
  let lessons;

  before(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    process.env.THEBRAIN_SIGNALS_DB = TEST_DB;
    process.env.THEBRAIN_PFC_OUTPUT = TEST_OUTPUT;
    lessons = require('../lessons');
  });

  after(() => {
    delete process.env.THEBRAIN_SIGNALS_DB;
    delete process.env.THEBRAIN_PFC_OUTPUT;
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('generates stub when no signals.db exists', () => {
    const origDb = process.env.THEBRAIN_SIGNALS_DB;
    process.env.THEBRAIN_SIGNALS_DB = path.join(TEST_DIR, 'nonexistent', 'signals.db');
    delete require.cache[require.resolve('../generate-prefrontal')];
    const { generate } = require('../generate-prefrontal');
    generate();
    const content = fs.readFileSync(TEST_OUTPUT, 'utf-8');
    assert.ok(content.includes('No signals.db found'));
    process.env.THEBRAIN_SIGNALS_DB = origDb;
  });

  it('generates prefrontal with lessons and forces', () => {
    delete require.cache[require.resolve('../generate-prefrontal')];
    const db = lessons.openDb();
    lessons.ensureSchema(db);
    lessons.insertLesson(db, 'amygdala', 'safety', 'Ask First', 'Always ask before acting', 'critical', 80);
    lessons.insertLesson(db, 'nucleus-accumbens', 'workflow', 'Use TDD', 'Write tests first', 'moderate', 55);
    db.prepare(`
      INSERT INTO forces (force_type, title, description, score, first_observed, last_reinforced, status)
      VALUES ('force', 'Engage', 'Precision over warmth', 85, datetime('now'), datetime('now'), 'active')
    `).run();
    db.close();

    const { generate } = require('../generate-prefrontal');
    generate();

    const content = fs.readFileSync(TEST_OUTPUT, 'utf-8');
    assert.ok(content.includes('Behavioral Rules (75+)'));
    assert.ok(content.includes('Ask First'));
    assert.ok(content.includes('Inclinations (50-74)'));
    assert.ok(content.includes('Use TDD'));
    assert.ok(content.includes('Relational Forces'));
    assert.ok(content.includes('Engage'));
  });
});
