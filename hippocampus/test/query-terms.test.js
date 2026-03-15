const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { TermDB } = require('../lib/term-db');

const TEST_DB = path.join(__dirname, '.test-query-terms.db');
const QUERY_SCRIPT = path.join(__dirname, '..', 'scripts', 'query.js');

describe('query.js --find and --structure', () => {
  before(() => {
    const db = new TermDB(TEST_DB);
    const id1 = db.upsertFile('portal', 'routes/api.js', '/abs/routes/api.js', { size: 100, mtime: 1, hash: 'a' });
    const id2 = db.upsertFile('portal', 'lib/utils.js', '/abs/lib/utils.js', { size: 50, mtime: 1, hash: 'b' });
    const id3 = db.upsertFile('booking', 'admin.js', '/abs/admin.js', { size: 200, mtime: 1, hash: 'c' });

    db.replaceOccurrences(id1, [
      { term: 'mySearchTerm', line: 15 },
      { term: 'mySearchTerm', line: 42 },
    ]);
    db.replaceOccurrences(id2, [{ term: 'mySearchTerm', line: 3 }]);
    db.replaceOccurrences(id3, [
      { term: 'mySearchTerm', line: 113 },
      { term: 'mySearchTerm', line: 130 },
    ]);

    db.replaceDefinitions(id2, [
      { name: 'helperOne', type: 'function', line: 3 },
      { name: 'helperTwo', type: 'function', line: 20 },
      { name: 'HelperClass', type: 'class', line: 35 },
    ]);

    db.close();
  });

  after(() => {
    try { fs.unlinkSync(TEST_DB); } catch {}
  });

  it('--find returns occurrences across projects', () => {
    const output = execFileSync('node', [QUERY_SCRIPT, '--find', 'mySearchTerm', '--db', TEST_DB], { encoding: 'utf-8' });
    const result = JSON.parse(output);
    assert.ok(result.length >= 3);
    assert.ok(result.some(r => r.project === 'portal'));
    assert.ok(result.some(r => r.project === 'booking'));
  });

  it('--find with --project filters results', () => {
    const output = execFileSync('node', [QUERY_SCRIPT, '--find', 'mySearchTerm', '--project', 'portal', '--db', TEST_DB], { encoding: 'utf-8' });
    const result = JSON.parse(output);
    assert.ok(result.every(r => r.project === 'portal'));
  });

  it('--structure returns definitions for a file', () => {
    const output = execFileSync('node', [QUERY_SCRIPT, '--structure', 'utils.js', '--db', TEST_DB], { encoding: 'utf-8' });
    const result = JSON.parse(output);
    const defs = result.definitions || result;
    assert.ok(defs.find(d => d.name === 'helperOne'));
    assert.ok(defs.find(d => d.name === 'helperTwo'));
    assert.ok(defs.find(d => d.name === 'HelperClass'));
  });
});
