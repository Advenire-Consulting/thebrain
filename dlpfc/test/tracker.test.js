'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { WorkingMemoryDB } = require('../lib/db');
const { bumpFile, decayAndCluster, getSessionFiles, WEIGHTS } = require('../lib/tracker');

const TEST_DB = path.join(__dirname, '.test-tracker.db');

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

describe('WEIGHTS', () => {
  it('edit weight is 1.0', () => assert.strictEqual(WEIGHTS.edit, 1.0));
  it('read weight is 0.3', () => assert.strictEqual(WEIGHTS.read, 0.3));
  it('reference weight is 0.5', () => assert.strictEqual(WEIGHTS.reference, 0.5));
});

describe('bumpFile', () => {
  after(cleanup);

  it('bumps with correct weight for edit', () => {
    const db = freshDb();
    bumpFile(db, 'proj', 'file.js', 'edit', 'sess1');
    const row = db.getFileHeat('proj', 'file.js');
    assert.strictEqual(row.score, 1.0);
    db.close();
  });

  it('bumps with correct weight for read', () => {
    const db = freshDb();
    bumpFile(db, 'proj', 'file.js', 'read', 'sess1');
    const row = db.getFileHeat('proj', 'file.js');
    assert.ok(Math.abs(row.score - 0.3) < 0.01);
    db.close();
  });

  it('bumps with correct weight for reference', () => {
    const db = freshDb();
    bumpFile(db, 'proj', 'file.js', 'reference', 'sess1');
    const row = db.getFileHeat('proj', 'file.js');
    assert.ok(Math.abs(row.score - 0.5) < 0.01);
    db.close();
  });

  it('seeds summary from DIR lookup when provided', () => {
    const db = freshDb();
    const dirData = { files: { 'file.js': { purpose: 'Express app entry' } } };
    bumpFile(db, 'proj', 'file.js', 'edit', 'sess1', dirData);
    const row = db.getFileHeat('proj', 'file.js');
    assert.strictEqual(row.summary, 'Express app entry');
    db.close();
  });

  it('does not overwrite existing summary on subsequent bumps', () => {
    const db = freshDb();
    const dirData = { files: { 'file.js': { purpose: 'Express app entry' } } };
    bumpFile(db, 'proj', 'file.js', 'edit', 'sess1', dirData);
    db.updateSummary('proj', 'file.js', 'Custom summary');
    bumpFile(db, 'proj', 'file.js', 'edit', 'sess2', dirData);
    const row = db.getFileHeat('proj', 'file.js');
    assert.strictEqual(row.summary, 'Custom summary');
    db.close();
  });
});

describe('decayAndCluster', () => {
  after(cleanup);

  it('decays all scores by 0.8', () => {
    const db = freshDb();
    db.bumpFileHeat('proj', 'a.js', 5.0, 's1');
    db.bumpFileHeat('proj', 'b.js', 2.0, 's1');
    decayAndCluster(db, 's1');
    assert.ok(Math.abs(db.getFileHeat('proj', 'a.js').score - 4.0) < 0.01);
    assert.ok(Math.abs(db.getFileHeat('proj', 'b.js').score - 1.6) < 0.01);
    db.close();
  });

  it('creates cluster when files co-occur in same session', () => {
    const db = freshDb();
    for (const sess of ['s1', 's2', 's3']) {
      db.bumpFileHeat('proj', 'a.js', 1.0, sess);
      db.bumpFileHeat('proj', 'b.js', 1.0, sess);
      decayAndCluster(db, sess);
    }
    const clusters = db.getClusters('proj');
    assert.ok(clusters.length >= 1);
    assert.strictEqual(clusters[0].co_occurrence_count, 3);
    db.close();
  });
});

describe('getSessionFiles', () => {
  after(cleanup);

  it('returns grouped files by project for a session', () => {
    const db = freshDb();
    db.bumpFileHeat('proj-a', 'x.js', 1.0, 'sess1');
    db.bumpFileHeat('proj-b', 'y.js', 1.0, 'sess1');
    const grouped = getSessionFiles(db, 'sess1');
    const keys = Object.keys(grouped).sort();
    assert.ok(keys.includes('proj-a'));
    assert.ok(keys.includes('proj-b'));
    assert.deepStrictEqual(grouped['proj-a'], ['x.js']);
    db.close();
  });
});
