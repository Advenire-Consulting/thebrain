const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { TermDB } = require('../lib/term-db');

const TEST_DIR = path.join(__dirname, '.test-post-edit');
const TEST_DB = path.join(__dirname, '.test-post-edit-terms.db');
const TEST_HIPP_DIR = path.join(__dirname, '.test-post-edit-hippocampus');

describe('PostToolUse hook functions', () => {
  let db, updateSingleFile, updateDIREntry;

  before(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
    fs.mkdirSync(TEST_HIPP_DIR, { recursive: true });

    fs.writeFileSync(path.join(TEST_DIR, 'server.js'),
      "const utils = require('./_shared/server-utils');\nfunction handleRequest(req) {\n  return req.body.name;\n}\n");

    fs.writeFileSync(path.join(TEST_HIPP_DIR, 'test-project.dir.json'), JSON.stringify({
      name: 'test-project',
      root: 'test-project/',
      aliases: {},
      files: {},
      schemas: {},
      references: { outbound: [], inbound: [] },
    }, null, 2));

    db = new TermDB(TEST_DB);
    ({ updateSingleFile, updateDIREntry } = require('../../hooks/post-edit-hook'));
  });

  after(() => {
    db.close();
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    fs.rmSync(TEST_HIPP_DIR, { recursive: true, force: true });
    try { fs.unlinkSync(TEST_DB); } catch {}
  });

  it('indexes a new file into term DB', () => {
    updateSingleFile(db, path.join(TEST_DIR, 'server.js'), 'test-project', TEST_DIR);
    const results = db.findTerm('handleRequest');
    assert.ok(results.length > 0);
    assert.ok(results.some(r => r.path === 'server.js'));
  });

  it('captures definitions', () => {
    const meta = db.getFileMeta('test-project', 'server.js');
    const defs = db.getDefinitions(meta.id);
    assert.ok(defs.find(d => d.name === 'handleRequest'));
  });

  it('updates after file modification', () => {
    fs.writeFileSync(path.join(TEST_DIR, 'server.js'),
      "function newHandler(req) {\n  return req.body;\n}\n");
    updateSingleFile(db, path.join(TEST_DIR, 'server.js'), 'test-project', TEST_DIR);

    const old = db.findTerm('handleRequest').filter(r => r.path === 'server.js');
    assert.strictEqual(old.length, 0);

    const results = db.findTerm('newHandler');
    assert.ok(results.length > 0);
  });

  it('updates DIR file entry with imports/exports', () => {
    fs.writeFileSync(path.join(TEST_DIR, 'connected.js'),
      "const db = require('./db');\nconst utils = require('./_shared/server-utils');\nfunction getUser() {}\nmodule.exports = { getUser };\n");

    updateDIREntry(
      path.join(TEST_DIR, 'connected.js'),
      TEST_DIR,
      'test-project',
      TEST_HIPP_DIR
    );

    const dir = JSON.parse(fs.readFileSync(path.join(TEST_HIPP_DIR, 'test-project.dir.json'), 'utf-8'));
    const entry = dir.files['connected.js'];
    assert.ok(entry, 'connected.js should be in DIR files');
    assert.ok(entry.imports.includes('./db'));
    assert.ok(entry.exports.includes('getUser'));
  });
});
