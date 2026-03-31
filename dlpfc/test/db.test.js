'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { WorkingMemoryDB } = require('../lib/db');

const TEST_DB = path.join(__dirname, '.test-working-memory.db');

function freshDb() {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(TEST_DB + suffix); } catch {}
  }
  return new WorkingMemoryDB(TEST_DB);
}

function cleanup() {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(TEST_DB + suffix); } catch {}
  }
}

describe('WorkingMemoryDB', () => {
  after(cleanup);

  it('creates tables on open', () => {
    const db = freshDb();
    db.bumpFileHeat('proj', 'file.js', 1.0, 'sess1');
    const row = db.getFileHeat('proj', 'file.js');
    assert.ok(row);
    assert.strictEqual(row.score, 1.0);
    assert.strictEqual(row.touch_count, 1);
    db.close();
  });

  it('bumpFileHeat increments existing entry', () => {
    const db = freshDb();
    db.bumpFileHeat('proj', 'file.js', 1.0, 'sess1');
    db.bumpFileHeat('proj', 'file.js', 1.0, 'sess2');
    const row = db.getFileHeat('proj', 'file.js');
    assert.strictEqual(row.score, 2.0);
    assert.strictEqual(row.touch_count, 2);
    assert.strictEqual(row.last_session, 'sess2');
    db.close();
  });

  it('bumpFileHeat handles different weights', () => {
    const db = freshDb();
    db.bumpFileHeat('proj', 'file.js', 0.3, 'sess1');
    const row = db.getFileHeat('proj', 'file.js');
    assert.ok(Math.abs(row.score - 0.3) < 0.01);
    db.close();
  });

  it('getHotFiles returns files above threshold sorted by score', () => {
    const db = freshDb();
    db.bumpFileHeat('proj', 'hot.js', 3.0, 's1');
    db.bumpFileHeat('proj', 'warm.js', 1.5, 's1');
    db.bumpFileHeat('proj', 'cold.js', 0.5, 's1');
    const hot = db.getHotFiles('proj', 1.0);
    assert.strictEqual(hot.length, 2);
    assert.strictEqual(hot[0].file_path, 'hot.js');
    assert.strictEqual(hot[1].file_path, 'warm.js');
    db.close();
  });

  it('getHotFiles respects limit', () => {
    const db = freshDb();
    for (let i = 0; i < 20; i++) {
      db.bumpFileHeat('proj', `file${i}.js`, 2.0 + i, 's1');
    }
    const hot = db.getHotFiles('proj', 1.0, 15);
    assert.strictEqual(hot.length, 15);
    db.close();
  });

  it('updateSummary and updateContextNote', () => {
    const db = freshDb();
    db.bumpFileHeat('proj', 'file.js', 1.0, 's1');
    db.updateSummary('proj', 'file.js', 'Express app entry point');
    db.updateContextNote('proj', 'file.js', 'Wiring CRM routes');
    const row = db.getFileHeat('proj', 'file.js');
    assert.strictEqual(row.summary, 'Express app entry point');
    assert.strictEqual(row.context_note, 'Wiring CRM routes');
    db.close();
  });

  it('decayAllScores multiplies by factor', () => {
    const db = freshDb();
    db.bumpFileHeat('proj', 'file.js', 5.0, 's1');
    db.decayAllScores(0.8);
    const row = db.getFileHeat('proj', 'file.js');
    assert.ok(Math.abs(row.score - 4.0) < 0.01);
    db.close();
  });

  it('getActiveProjects returns projects with hot files', () => {
    const db = freshDb();
    db.bumpFileHeat('proj-a', 'file.js', 2.0, 's1');
    db.bumpFileHeat('proj-b', 'file.js', 0.5, 's1');
    const active = db.getActiveProjects(1.0);
    assert.deepStrictEqual(active, ['proj-a']);
    db.close();
  });

  it('upsertCluster with sorted file_paths', () => {
    const db = freshDb();
    db.upsertCluster('proj', ['c.js', 'a.js', 'b.js']);
    db.upsertCluster('proj', ['c.js', 'a.js', 'b.js']);
    const clusters = db.getClusters('proj');
    assert.strictEqual(clusters.length, 1);
    assert.strictEqual(clusters[0].co_occurrence_count, 2);
    assert.deepStrictEqual(JSON.parse(clusters[0].file_paths), ['a.js', 'b.js', 'c.js']);
    db.close();
  });

  it('getClusters respects limit', () => {
    const db = freshDb();
    for (let i = 0; i < 5; i++) {
      db.upsertCluster('proj', [`a${i}.js`, `b${i}.js`]);
    }
    const clusters = db.getClusters('proj', 3);
    assert.strictEqual(clusters.length, 3);
    db.close();
  });

  it('getAllFilesForSession returns files bumped in session', () => {
    const db = freshDb();
    db.bumpFileHeat('proj', 'a.js', 1.0, 'sess-abc');
    db.bumpFileHeat('proj', 'b.js', 1.0, 'sess-abc');
    db.bumpFileHeat('proj', 'c.js', 1.0, 'sess-old');
    const files = db.getAllFilesForSession('sess-abc');
    assert.strictEqual(files.length, 2);
    db.close();
  });
});
