'use strict';

const path = require('path');
const fs = require('fs');
const { WorkingMemoryDB } = require('../lib/db');

const TEST_DB = path.join(__dirname, '.test-working-memory.db');

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

describe('WorkingMemoryDB', () => {
  test('creates tables on open', () => {
    const db = freshDb();
    db.bumpFileHeat('proj', 'file.js', 1.0, 'sess1');
    const row = db.getFileHeat('proj', 'file.js');
    expect(row).toBeTruthy();
    expect(row.score).toBe(1.0);
    expect(row.touch_count).toBe(1);
    db.close();
  });

  test('bumpFileHeat increments existing entry', () => {
    const db = freshDb();
    db.bumpFileHeat('proj', 'file.js', 1.0, 'sess1');
    db.bumpFileHeat('proj', 'file.js', 1.0, 'sess2');
    const row = db.getFileHeat('proj', 'file.js');
    expect(row.score).toBe(2.0);
    expect(row.touch_count).toBe(2);
    expect(row.last_session).toBe('sess2');
    db.close();
  });

  test('bumpFileHeat handles different weights', () => {
    const db = freshDb();
    db.bumpFileHeat('proj', 'file.js', 0.3, 'sess1');
    const row = db.getFileHeat('proj', 'file.js');
    expect(row.score).toBeCloseTo(0.3);
    db.close();
  });

  test('getHotFiles returns files above threshold sorted by score', () => {
    const db = freshDb();
    db.bumpFileHeat('proj', 'hot.js', 3.0, 's1');
    db.bumpFileHeat('proj', 'warm.js', 1.5, 's1');
    db.bumpFileHeat('proj', 'cold.js', 0.5, 's1');
    const hot = db.getHotFiles('proj', 1.0);
    expect(hot).toHaveLength(2);
    expect(hot[0].file_path).toBe('hot.js');
    expect(hot[1].file_path).toBe('warm.js');
    db.close();
  });

  test('getHotFiles respects limit', () => {
    const db = freshDb();
    for (let i = 0; i < 20; i++) {
      db.bumpFileHeat('proj', `file${i}.js`, 2.0 + i, 's1');
    }
    const hot = db.getHotFiles('proj', 1.0, 15);
    expect(hot).toHaveLength(15);
    db.close();
  });

  test('updateSummary and updateContextNote', () => {
    const db = freshDb();
    db.bumpFileHeat('proj', 'file.js', 1.0, 's1');
    db.updateSummary('proj', 'file.js', 'Express app entry point');
    db.updateContextNote('proj', 'file.js', 'Wiring CRM routes');
    const row = db.getFileHeat('proj', 'file.js');
    expect(row.summary).toBe('Express app entry point');
    expect(row.context_note).toBe('Wiring CRM routes');
    db.close();
  });

  test('decayAllScores multiplies by factor', () => {
    const db = freshDb();
    db.bumpFileHeat('proj', 'file.js', 5.0, 's1');
    db.decayAllScores(0.8);
    const row = db.getFileHeat('proj', 'file.js');
    expect(row.score).toBeCloseTo(4.0);
    db.close();
  });

  test('getActiveProjects returns projects with hot files', () => {
    const db = freshDb();
    db.bumpFileHeat('proj-a', 'file.js', 2.0, 's1');
    db.bumpFileHeat('proj-b', 'file.js', 0.5, 's1');
    const active = db.getActiveProjects(1.0);
    expect(active).toEqual(['proj-a']);
    db.close();
  });

  test('upsertCluster with sorted file_paths', () => {
    const db = freshDb();
    db.upsertCluster('proj', ['c.js', 'a.js', 'b.js']);
    db.upsertCluster('proj', ['c.js', 'a.js', 'b.js']);
    const clusters = db.getClusters('proj');
    expect(clusters).toHaveLength(1);
    expect(clusters[0].co_occurrence_count).toBe(2);
    expect(JSON.parse(clusters[0].file_paths)).toEqual(['a.js', 'b.js', 'c.js']);
    db.close();
  });

  test('getClusters respects limit', () => {
    const db = freshDb();
    for (let i = 0; i < 5; i++) {
      db.upsertCluster('proj', [`a${i}.js`, `b${i}.js`]);
    }
    const clusters = db.getClusters('proj', 3);
    expect(clusters).toHaveLength(3);
    db.close();
  });

  test('getAllFilesForSession returns files bumped in session', () => {
    const db = freshDb();
    db.bumpFileHeat('proj', 'a.js', 1.0, 'sess-abc');
    db.bumpFileHeat('proj', 'b.js', 1.0, 'sess-abc');
    db.bumpFileHeat('proj', 'c.js', 1.0, 'sess-old');
    const files = db.getAllFilesForSession('sess-abc');
    expect(files).toHaveLength(2);
    db.close();
  });
});
