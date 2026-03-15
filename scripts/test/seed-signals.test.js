'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

const TEST_DIR = path.join(os.tmpdir(), 'thebrain-seed-test-' + Date.now());
const TEST_DB = path.join(TEST_DIR, 'signals.db');

describe('seed-signals', () => {
  before(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    process.env.THEBRAIN_SIGNALS_DB = TEST_DB;
  });

  after(() => {
    delete process.env.THEBRAIN_SIGNALS_DB;
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('seeds lessons and forces into empty DB', () => {
    delete require.cache[require.resolve('../seed-signals')];
    const { seed } = require('../seed-signals');
    seed();

    const db = new Database(TEST_DB, { readonly: true });
    const lessonCount = db.prepare('SELECT COUNT(*) as c FROM lessons').get().c;
    const forceCount = db.prepare('SELECT COUNT(*) as c FROM forces').get().c;
    assert.strictEqual(lessonCount, 10);
    assert.strictEqual(forceCount, 4);
    const version = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
    assert.strictEqual(version.value, '1');
    db.close();
  });

  it('does not duplicate when run again', () => {
    delete require.cache[require.resolve('../seed-signals')];
    const { seed } = require('../seed-signals');
    seed();

    const db = new Database(TEST_DB, { readonly: true });
    const lessonCount = db.prepare('SELECT COUNT(*) as c FROM lessons').get().c;
    assert.strictEqual(lessonCount, 10); // Still 10, not doubled
    db.close();
  });

  it('adds missing seeds when some already exist', () => {
    // Start fresh
    fs.unlinkSync(TEST_DB);
    const db = new Database(TEST_DB);
    db.pragma('journal_mode = WAL');
    // Manually insert one lesson that matches a seed title
    const lessons = require('../lessons');
    lessons.ensureSchema(db);
    db.prepare(`
      INSERT INTO lessons (brain_file, domain, title, entry_text, polarity, confirmation_count, first_confirmed, last_confirmed)
      VALUES ('amygdala', 'custom', 'Position over menu', 'custom entry', 'negative', 80, datetime('now'), datetime('now'))
    `).run();
    db.close();

    delete require.cache[require.resolve('../seed-signals')];
    const { seed } = require('../seed-signals');
    seed();

    const db2 = new Database(TEST_DB, { readonly: true });
    const lessonCount = db2.prepare('SELECT COUNT(*) as c FROM lessons').get().c;
    // 1 pre-existing + 9 new seeds (Position over menu skipped)
    assert.strictEqual(lessonCount, 10);
    const forceCount = db2.prepare('SELECT COUNT(*) as c FROM forces').get().c;
    assert.strictEqual(forceCount, 4);
    db2.close();
  });
});
