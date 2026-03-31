'use strict';

const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { WorkingMemoryDB } = require('../lib/db');
const { generate, writeToFile } = require('../lib/generator');

const TEST_DB = path.join(__dirname, '.test-generator.db');
const TEST_OUTPUT = path.join(__dirname, '.test-dlpfc-live.md');

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
  try { fs.unlinkSync(TEST_OUTPUT); } catch {}
}

describe('generate', () => {
  after(cleanup);

  it('returns empty string when no hot files', () => {
    const db = freshDb();
    const result = generate(db);
    assert.strictEqual(result, '');
    db.close();
  });

  it('emits hot files with summary and context_note', () => {
    const db = freshDb();
    db.bumpFileHeat('myproj', 'server.js', 3.0, 's1');
    db.updateSummary('myproj', 'server.js', 'Express app entry');
    db.updateContextNote('myproj', 'server.js', 'Wiring CRM routes');
    const result = generate(db);
    assert.ok(result.includes('## Working Memory — myproj'));
    assert.ok(result.includes('server.js [3.0]'));
    assert.ok(result.includes('Express app entry'));
    assert.ok(result.includes('Wiring CRM routes'));
    db.close();
  });

  it('emits warm files with summary only (no context_note)', () => {
    const db = freshDb();
    db.bumpFileHeat('myproj', 'warm.js', 1.5, 's1');
    db.updateSummary('myproj', 'warm.js', 'Helper module');
    db.updateContextNote('myproj', 'warm.js', 'Should not appear');
    const result = generate(db);
    assert.ok(result.includes('warm.js [1.5]'));
    assert.ok(result.includes('Helper module'));
    assert.ok(!result.includes('Should not appear'));
    db.close();
  });

  it('omits cold files (below 1.0)', () => {
    const db = freshDb();
    db.bumpFileHeat('myproj', 'cold.js', 0.5, 's1');
    const result = generate(db);
    assert.ok(!result.includes('cold.js'));
    db.close();
  });

  it('includes clusters with 3+ co-occurrences', () => {
    const db = freshDb();
    db.bumpFileHeat('myproj', 'a.js', 2.0, 's1');
    db.bumpFileHeat('myproj', 'b.js', 2.0, 's1');
    db.upsertCluster('myproj', ['a.js', 'b.js']);
    db.upsertCluster('myproj', ['a.js', 'b.js']);
    db.upsertCluster('myproj', ['a.js', 'b.js']);
    const result = generate(db);
    assert.ok(result.includes('clusters:'));
    assert.ok(result.includes('a.js'));
    assert.ok(result.includes('b.js'));
    db.close();
  });

  it('caps files at 15 per project', () => {
    const db = freshDb();
    for (let i = 0; i < 20; i++) {
      db.bumpFileHeat('myproj', `file${String(i).padStart(2, '0')}.js`, 2.0 + i, 's1');
    }
    const result = generate(db);
    const fileLines = result.split('\n').filter(l => l.match(/^\S.*\[\d/));
    assert.ok(fileLines.length <= 15);
    db.close();
  });

  it('groups by project', () => {
    const db = freshDb();
    db.bumpFileHeat('proj-a', 'a.js', 2.0, 's1');
    db.bumpFileHeat('proj-b', 'b.js', 2.0, 's1');
    const result = generate(db);
    assert.ok(result.includes('## Working Memory — proj-a'));
    assert.ok(result.includes('## Working Memory — proj-b'));
    db.close();
  });
});

describe('writeToFile', () => {
  after(cleanup);

  it('writes result to disk', () => {
    const db = freshDb();
    db.bumpFileHeat('myproj', 'server.js', 2.5, 's1');
    db.updateSummary('myproj', 'server.js', 'Entry point');
    writeToFile(db, TEST_OUTPUT);
    assert.ok(fs.existsSync(TEST_OUTPUT));
    const content = fs.readFileSync(TEST_OUTPUT, 'utf-8');
    assert.ok(content.includes('server.js'));
    db.close();
  });

  it('deletes file when no hot entries', () => {
    const db = freshDb();
    fs.writeFileSync(TEST_OUTPUT, 'old content');
    writeToFile(db, TEST_OUTPUT);
    assert.ok(!fs.existsSync(TEST_OUTPUT));
    db.close();
  });
});
