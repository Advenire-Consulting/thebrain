const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const TEST_DB = path.join(__dirname, '.test-terms.db');

describe('TermDB', () => {
  let db;

  before(() => {
    const { TermDB } = require('../lib/term-db');
    db = new TermDB(TEST_DB);
  });

  after(() => {
    db.close();
    try { fs.unlinkSync(TEST_DB); } catch {}
  });

  it('creates all tables on init', () => {
    const tables = db.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all().map(t => t.name).sort();
    assert.deepStrictEqual(tables, ['definitions', 'files', 'occurrences', 'terms']);
  });

  it('upserts a file and returns id', () => {
    const id = db.upsertFile('test-project', 'server.js', '/abs/server.js', { size: 100, mtime: 1000.0, hash: 'abc123' });
    assert.ok(id > 0);
    const id2 = db.upsertFile('test-project', 'server.js', '/abs/server.js', { size: 200, mtime: 2000.0, hash: 'def456' });
    assert.strictEqual(id, id2);
  });

  it('retrieves file metadata', () => {
    db.upsertFile('test-project', 'app.js', '/abs/app.js', { size: 500, mtime: 3000.0, hash: 'xyz' });
    const meta = db.getFileMeta('test-project', 'app.js');
    assert.strictEqual(meta.size, 500);
    assert.strictEqual(meta.mtime, 3000.0);
    assert.strictEqual(meta.hash, 'xyz');
  });

  it('returns null for unknown file', () => {
    const meta = db.getFileMeta('test-project', 'nope.js');
    assert.strictEqual(meta, null);
  });

  it('replaces occurrences for a file', () => {
    const fileId = db.upsertFile('test-project', 'utils.js', '/abs/utils.js', { size: 50, mtime: 100, hash: 'h1' });
    db.replaceOccurrences(fileId, [
      { term: 'myEscapeFn', line: 5 },
      { term: 'myEscapeFn', line: 20 },
      { term: 'myFormatFn', line: 10 },
    ]);
    const results = db.findTerm('myEscapeFn');
    const utilsResults = results.filter(r => r.path === 'utils.js');
    assert.strictEqual(utilsResults.length, 2);
    assert.deepStrictEqual(utilsResults.map(r => r.line).sort((a, b) => a - b), [5, 20]);
  });

  it('replaces occurrences on rescan (old entries removed)', () => {
    const fileId = db.upsertFile('test-project', 'replace-test.js', '/abs/replace-test.js', { size: 50, mtime: 100, hash: 'h2' });
    db.replaceOccurrences(fileId, [{ term: 'oldFunction', line: 1 }]);
    assert.strictEqual(db.findTerm('oldFunction').length, 1);
    db.replaceOccurrences(fileId, [{ term: 'newFunction', line: 1 }]);
    assert.strictEqual(db.findTerm('oldFunction').length, 0);
    assert.strictEqual(db.findTerm('newFunction').length, 1);
  });

  it('replaces definitions for a file', () => {
    const fileId = db.upsertFile('test-project', 'defs.js', '/abs/defs.js', { size: 50, mtime: 100, hash: 'h3' });
    db.replaceDefinitions(fileId, [
      { name: 'getDb', type: 'function', line: 1 },
      { name: 'UserModel', type: 'class', line: 15 },
    ]);
    const defs = db.getDefinitions(fileId);
    assert.strictEqual(defs.length, 2);
    assert.strictEqual(defs[0].name, 'getDb');
    assert.strictEqual(defs[1].name, 'UserModel');
  });

  it('finds terms across projects', () => {
    const id1 = db.upsertFile('project-a', 'a.js', '/abs/a.js', { size: 10, mtime: 1, hash: 'a' });
    const id2 = db.upsertFile('project-b', 'b.js', '/abs/b.js', { size: 10, mtime: 1, hash: 'b' });
    db.replaceOccurrences(id1, [{ term: 'sharedHelper', line: 3 }]);
    db.replaceOccurrences(id2, [{ term: 'sharedHelper', line: 7 }]);
    const results = db.findTerm('sharedHelper');
    assert.strictEqual(results.length, 2);
    const projects = results.map(r => r.project).sort();
    assert.deepStrictEqual(projects, ['project-a', 'project-b']);
  });

  it('finds terms filtered by project', () => {
    const results = db.findTerm('sharedHelper', 'project-a');
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].project, 'project-a');
  });

  it('removes a file with cascade', () => {
    const fileId = db.upsertFile('test-project', 'doomed.js', '/abs/doomed.js', { size: 10, mtime: 1, hash: 'd' });
    db.replaceOccurrences(fileId, [{ term: 'doomedTerm', line: 1 }]);
    db.replaceDefinitions(fileId, [{ name: 'doomedFn', type: 'function', line: 1 }]);
    db.removeFile(fileId);
    assert.strictEqual(db.findTerm('doomedTerm').length, 0);
    assert.strictEqual(db.getDefinitions(fileId).length, 0);
    assert.strictEqual(db.getFileMeta('test-project', 'doomed.js'), null);
  });

  it('getStructure returns definitions for a file path', () => {
    const fileId = db.upsertFile('test-project', 'struct.js', '/abs/struct.js', { size: 50, mtime: 100, hash: 's1' });
    db.replaceDefinitions(fileId, [
      { name: 'handleRequest', type: 'function', line: 5 },
      { name: 'Router', type: 'class', line: 20 },
    ]);
    const structure = db.getStructure('test-project', 'struct.js');
    assert.strictEqual(structure.length, 2);
    assert.strictEqual(structure[0].name, 'handleRequest');
  });

  it('lists all files for a project', () => {
    const files = db.getProjectFiles('test-project');
    assert.ok(files.length > 0);
    assert.ok(files.every(f => f.project === 'test-project'));
  });
});
