'use strict';

const path = require('path');
const fs = require('fs');
const { WorkingMemoryDB } = require('../lib/db');
const { generate, writeToFile } = require('../lib/generator');

const TEST_DB = path.join(__dirname, '.test-generator.db');
const TEST_OUTPUT = path.join(__dirname, '.test-dlpfc-live.md');

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
  try { fs.unlinkSync(TEST_OUTPUT); } catch {}
});

describe('generate', () => {
  test('returns empty string when no hot files', () => {
    const db = freshDb();
    const result = generate(db);
    expect(result).toBe('');
    db.close();
  });

  test('emits hot files with summary and context_note', () => {
    const db = freshDb();
    db.bumpFileHeat('myproj', 'server.js', 3.0, 's1');
    db.updateSummary('myproj', 'server.js', 'Express app entry');
    db.updateContextNote('myproj', 'server.js', 'Wiring CRM routes');
    const result = generate(db);
    expect(result).toContain('## Working Memory — myproj');
    expect(result).toContain('server.js [3.0]');
    expect(result).toContain('Express app entry');
    expect(result).toContain('Wiring CRM routes');
    db.close();
  });

  test('emits warm files with summary only (no context_note)', () => {
    const db = freshDb();
    db.bumpFileHeat('myproj', 'warm.js', 1.5, 's1');
    db.updateSummary('myproj', 'warm.js', 'Helper module');
    db.updateContextNote('myproj', 'warm.js', 'Should not appear');
    const result = generate(db);
    expect(result).toContain('warm.js [1.5]');
    expect(result).toContain('Helper module');
    expect(result).not.toContain('Should not appear');
    db.close();
  });

  test('omits cold files (below 1.0)', () => {
    const db = freshDb();
    db.bumpFileHeat('myproj', 'cold.js', 0.5, 's1');
    const result = generate(db);
    expect(result).not.toContain('cold.js');
    db.close();
  });

  test('includes clusters with 3+ co-occurrences', () => {
    const db = freshDb();
    db.bumpFileHeat('myproj', 'a.js', 2.0, 's1');
    db.bumpFileHeat('myproj', 'b.js', 2.0, 's1');
    db.upsertCluster('myproj', ['a.js', 'b.js']);
    db.upsertCluster('myproj', ['a.js', 'b.js']);
    db.upsertCluster('myproj', ['a.js', 'b.js']);
    const result = generate(db);
    expect(result).toContain('clusters:');
    expect(result).toContain('a.js');
    expect(result).toContain('b.js');
    db.close();
  });

  test('caps files at 15 per project', () => {
    const db = freshDb();
    for (let i = 0; i < 20; i++) {
      db.bumpFileHeat('myproj', `file${String(i).padStart(2, '0')}.js`, 2.0 + i, 's1');
    }
    const result = generate(db);
    const fileLines = result.split('\n').filter(l => l.match(/^\S.*\[\d/));
    expect(fileLines.length).toBeLessThanOrEqual(15);
    db.close();
  });

  test('groups by project', () => {
    const db = freshDb();
    db.bumpFileHeat('proj-a', 'a.js', 2.0, 's1');
    db.bumpFileHeat('proj-b', 'b.js', 2.0, 's1');
    const result = generate(db);
    expect(result).toContain('## Working Memory — proj-a');
    expect(result).toContain('## Working Memory — proj-b');
    db.close();
  });
});

describe('writeToFile', () => {
  test('writes result to disk', () => {
    const db = freshDb();
    db.bumpFileHeat('myproj', 'server.js', 2.5, 's1');
    db.updateSummary('myproj', 'server.js', 'Entry point');
    writeToFile(db, TEST_OUTPUT);
    expect(fs.existsSync(TEST_OUTPUT)).toBe(true);
    const content = fs.readFileSync(TEST_OUTPUT, 'utf-8');
    expect(content).toContain('server.js');
    db.close();
  });

  test('deletes file when no hot entries', () => {
    const db = freshDb();
    fs.writeFileSync(TEST_OUTPUT, 'old content');
    writeToFile(db, TEST_OUTPUT);
    expect(fs.existsSync(TEST_OUTPUT)).toBe(false);
    db.close();
  });
});
