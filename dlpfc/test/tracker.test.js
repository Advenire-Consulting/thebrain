'use strict';

const path = require('path');
const fs = require('fs');
const { WorkingMemoryDB } = require('../lib/db');
const { bumpFile, decayAndCluster, getSessionFiles, WEIGHTS } = require('../lib/tracker');

const TEST_DB = path.join(__dirname, '.test-tracker.db');

function freshDb() {
  try { fs.unlinkSync(TEST_DB); } catch {}
  try { fs.unlinkSync(TEST_DB + '-wal'); } catch {}
  try { fs.unlinkSync(TEST_DB + '-shm'); } catch {}
  return new WorkingMemoryDB(TEST_DB);
}

afterAll(() => {
  try { fs.unlinkSync(TEST_DB); } catch {}
  try { fs.unlinkSync(TEST_DB + '-wal'); } catch {}
  try { fs.unlinkSync(TEST_DB + '-shm'); } catch {}
});

describe('WEIGHTS', () => {
  test('edit weight is 1.0', () => expect(WEIGHTS.edit).toBe(1.0));
  test('read weight is 0.3', () => expect(WEIGHTS.read).toBe(0.3));
  test('reference weight is 0.5', () => expect(WEIGHTS.reference).toBe(0.5));
});

describe('bumpFile', () => {
  test('bumps with correct weight for edit', () => {
    const db = freshDb();
    bumpFile(db, 'proj', 'file.js', 'edit', 'sess1');
    const row = db.getFileHeat('proj', 'file.js');
    expect(row.score).toBe(1.0);
    db.close();
  });

  test('bumps with correct weight for read', () => {
    const db = freshDb();
    bumpFile(db, 'proj', 'file.js', 'read', 'sess1');
    const row = db.getFileHeat('proj', 'file.js');
    expect(row.score).toBeCloseTo(0.3);
    db.close();
  });

  test('bumps with correct weight for reference', () => {
    const db = freshDb();
    bumpFile(db, 'proj', 'file.js', 'reference', 'sess1');
    const row = db.getFileHeat('proj', 'file.js');
    expect(row.score).toBeCloseTo(0.5);
    db.close();
  });

  test('seeds summary from DIR lookup when provided', () => {
    const db = freshDb();
    const dirData = { files: { 'file.js': { purpose: 'Express app entry' } } };
    bumpFile(db, 'proj', 'file.js', 'edit', 'sess1', dirData);
    const row = db.getFileHeat('proj', 'file.js');
    expect(row.summary).toBe('Express app entry');
    db.close();
  });

  test('does not overwrite existing summary on subsequent bumps', () => {
    const db = freshDb();
    const dirData = { files: { 'file.js': { purpose: 'Express app entry' } } };
    bumpFile(db, 'proj', 'file.js', 'edit', 'sess1', dirData);
    db.updateSummary('proj', 'file.js', 'Custom summary');
    bumpFile(db, 'proj', 'file.js', 'edit', 'sess2', dirData);
    const row = db.getFileHeat('proj', 'file.js');
    expect(row.summary).toBe('Custom summary');
    db.close();
  });
});

describe('decayAndCluster', () => {
  test('decays all scores by 0.8', () => {
    const db = freshDb();
    db.bumpFileHeat('proj', 'a.js', 5.0, 's1');
    db.bumpFileHeat('proj', 'b.js', 2.0, 's1');
    decayAndCluster(db, 's1');
    expect(db.getFileHeat('proj', 'a.js').score).toBeCloseTo(4.0);
    expect(db.getFileHeat('proj', 'b.js').score).toBeCloseTo(1.6);
    db.close();
  });

  test('creates cluster when files co-occur in same session', () => {
    const db = freshDb();
    for (const sess of ['s1', 's2', 's3']) {
      db.bumpFileHeat('proj', 'a.js', 1.0, sess);
      db.bumpFileHeat('proj', 'b.js', 1.0, sess);
      decayAndCluster(db, sess);
    }
    const clusters = db.getClusters('proj');
    expect(clusters.length).toBeGreaterThanOrEqual(1);
    expect(clusters[0].co_occurrence_count).toBe(3);
    db.close();
  });
});

describe('getSessionFiles', () => {
  test('returns grouped files by project for a session', () => {
    const db = freshDb();
    db.bumpFileHeat('proj-a', 'x.js', 1.0, 'sess1');
    db.bumpFileHeat('proj-b', 'y.js', 1.0, 'sess1');
    const grouped = getSessionFiles(db, 'sess1');
    expect(Object.keys(grouped)).toEqual(expect.arrayContaining(['proj-a', 'proj-b']));
    expect(grouped['proj-a']).toEqual(['x.js']);
    db.close();
  });
});
