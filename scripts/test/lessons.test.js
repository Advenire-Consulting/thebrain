'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Use a temp directory for test DB
const TEST_DIR = path.join(os.tmpdir(), 'thebrain-test-' + Date.now());
const TEST_DB = path.join(TEST_DIR, 'signals.db');

describe('lessons', () => {
  let lessons;

  before(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    // Override DB_PATH before requiring
    process.env.THEBRAIN_SIGNALS_DB = TEST_DB;
    lessons = require('../lessons');
  });

  after(() => {
    delete process.env.THEBRAIN_SIGNALS_DB;
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe('tierLabel', () => {
    it('returns Rule for weight >= 75', () => {
      assert.strictEqual(lessons.tierLabel(75), 'Rule');
      assert.strictEqual(lessons.tierLabel(100), 'Rule');
    });

    it('returns Inclination for weight 50-74', () => {
      assert.strictEqual(lessons.tierLabel(50), 'Inclination');
      assert.strictEqual(lessons.tierLabel(74), 'Inclination');
    });

    it('returns Awareness for weight 25-49', () => {
      assert.strictEqual(lessons.tierLabel(25), 'Awareness');
      assert.strictEqual(lessons.tierLabel(49), 'Awareness');
    });

    it('returns Data for weight < 25', () => {
      assert.strictEqual(lessons.tierLabel(0), 'Data');
      assert.strictEqual(lessons.tierLabel(24), 'Data');
    });
  });

  describe('openDb + ensureSchema', () => {
    it('creates signals.db with correct tables', () => {
      const db = lessons.openDb();
      lessons.ensureSchema(db);
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
      assert.ok(tables.includes('lessons'));
      assert.ok(tables.includes('forces'));
      assert.ok(tables.includes('signals'));
      assert.ok(tables.includes('correction_categories'));
      assert.ok(tables.includes('lesson_categories'));
      db.close();
    });
  });

  describe('insertLesson', () => {
    it('creates a new lesson with weight 50', () => {
      const db = lessons.openDb();
      lessons.ensureSchema(db);
      const result = lessons.insertLesson(db, 'amygdala', 'testing', 'Test Title', 'Test entry text', 'moderate');
      assert.strictEqual(result.action, 'created');
      assert.strictEqual(result.confirmation_count, 50);
      assert.strictEqual(result.tier, 'Inclination');
      assert.strictEqual(result.brain_file, 'amygdala');
      db.close();
    });

    it('reinforces existing lesson with +50 capped at 100', () => {
      const db = lessons.openDb();
      lessons.ensureSchema(db);
      // First insert
      lessons.insertLesson(db, 'nucleus-accumbens', 'reinforce-test', 'Reinforce Me', 'entry', 'moderate');
      // Second insert — same key
      const result = lessons.insertLesson(db, 'nucleus-accumbens', 'reinforce-test', 'Reinforce Me', 'entry', 'moderate');
      assert.strictEqual(result.action, 'reinforced');
      assert.strictEqual(result.confirmation_count, 100);
      assert.strictEqual(result.tier, 'Rule');
      db.close();
    });

    it('respects weight override', () => {
      const db = lessons.openDb();
      lessons.ensureSchema(db);
      const result = lessons.insertLesson(db, 'prefrontal', 'override-test', 'Override', 'entry', 'moderate', 30);
      assert.strictEqual(result.confirmation_count, 30);
      assert.strictEqual(result.tier, 'Awareness');
      db.close();
    });
  });
});
