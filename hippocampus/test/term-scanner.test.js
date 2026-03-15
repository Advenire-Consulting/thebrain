const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '.test-scan-project');
const TEST_DB = path.join(__dirname, '.test-scan-terms.db');

describe('termScanProject', () => {
  let db, termScanProject;

  before(() => {
    fs.mkdirSync(path.join(TEST_DIR, 'lib'), { recursive: true });

    fs.writeFileSync(path.join(TEST_DIR, 'utils.js'),
      'function myUtilFn(str) {\n  return str;\n}\nmodule.exports = { myUtilFn };\n');

    fs.writeFileSync(path.join(TEST_DIR, 'app.js'),
      "const { myUtilFn } = require('./utils');\nconst safe = myUtilFn(userInput);\n");

    fs.writeFileSync(path.join(TEST_DIR, 'leaf.js'),
      'const x = 42;\n');

    fs.writeFileSync(path.join(TEST_DIR, 'styles.css'),
      '.btn-primary {\n  color: red;\n}\n.modal-content {\n  display: flex;\n}\n');

    const { TermDB } = require('../lib/term-db');
    db = new TermDB(TEST_DB);
    ({ termScanProject } = require('../lib/term-scanner'));
  });

  after(() => {
    db.close();
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    try { fs.unlinkSync(TEST_DB); } catch {}
  });

  it('full scan captures all files', () => {
    const result = termScanProject(db, TEST_DIR, 'test-scan');
    assert.ok(result.scanned >= 3);
    assert.strictEqual(result.skipped, 0);
  });

  it('myUtilFn found in both utils.js and app.js', () => {
    const results = db.findTerm('myUtilFn');
    const files = [...new Set(results.map(r => r.path))].sort();
    assert.ok(files.includes('utils.js'));
    assert.ok(files.includes('app.js'));
  });

  it('definitions captured for utils.js', () => {
    const meta = db.getFileMeta('test-scan', 'utils.js');
    const defs = db.getDefinitions(meta.id);
    assert.ok(defs.find(d => d.name === 'myUtilFn' && d.type === 'function'));
  });

  it('CSS terms captured', () => {
    const results = db.findTerm('btn-primary');
    assert.ok(results.length > 0);
  });

  it('CSS definitions captured', () => {
    const meta = db.getFileMeta('test-scan', 'styles.css');
    const defs = db.getDefinitions(meta.id);
    assert.ok(defs.find(d => d.name === 'btn-primary' && d.type === 'css_class'));
  });

  it('incremental scan skips unchanged files', () => {
    const result = termScanProject(db, TEST_DIR, 'test-scan');
    assert.strictEqual(result.scanned, 0);
    assert.ok(result.skipped >= 3);
  });

  it('modification triggers rescan of only that file', () => {
    fs.appendFileSync(path.join(TEST_DIR, 'utils.js'), '\nfunction myNewFn() {}\n');
    const result = termScanProject(db, TEST_DIR, 'test-scan');
    assert.strictEqual(result.scanned, 1);
  });

  it('new function appears after rescan', () => {
    const results = db.findTerm('myNewFn');
    assert.ok(results.length > 0);
  });

  it('deleted file cleaned up on rescan', () => {
    fs.unlinkSync(path.join(TEST_DIR, 'leaf.js'));
    const result = termScanProject(db, TEST_DIR, 'test-scan');
    assert.strictEqual(result.removed, 1);
  });
});
