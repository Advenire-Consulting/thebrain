'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '.test-file-collector');

describe('file-collector', () => {
  let collectCodeFiles;

  before(() => {
    fs.mkdirSync(path.join(TEST_DIR, 'lib'), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, 'node_modules/pkg'), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, 'Archived'), { recursive: true });

    fs.writeFileSync(path.join(TEST_DIR, 'app.js'), 'const x = 1;');
    fs.writeFileSync(path.join(TEST_DIR, 'lib/utils.js'), 'module.exports = {};');
    fs.writeFileSync(path.join(TEST_DIR, 'style.css'), '.btn {}');
    fs.writeFileSync(path.join(TEST_DIR, 'script.sh'), '#!/bin/bash');
    fs.writeFileSync(path.join(TEST_DIR, 'main.py'), 'def main(): pass');
    fs.writeFileSync(path.join(TEST_DIR, 'README.md'), '# readme');
    fs.writeFileSync(path.join(TEST_DIR, 'node_modules/pkg/index.js'), 'nope');
    fs.writeFileSync(path.join(TEST_DIR, 'Archived/old.js'), 'nope');

    ({ collectCodeFiles } = require('../lib/file-collector'));
  });

  after(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('collects files matching the extension set', () => {
    const exts = new Set(['.js', '.css']);
    const files = collectCodeFiles(TEST_DIR, exts);
    const names = files.map(f => f.relative).sort();

    assert.ok(names.includes('app.js'));
    assert.ok(names.includes('lib/utils.js'));
    assert.ok(names.includes('style.css'));
    assert.ok(!names.includes('script.sh'));
    assert.ok(!names.includes('main.py'));
    assert.ok(!names.includes('README.md'));
  });

  it('collects all code types when given a broad set', () => {
    const exts = new Set(['.js', '.css', '.sh', '.py']);
    const files = collectCodeFiles(TEST_DIR, exts);
    const names = files.map(f => f.relative).sort();

    assert.ok(names.includes('app.js'));
    assert.ok(names.includes('script.sh'));
    assert.ok(names.includes('main.py'));
  });

  it('skips node_modules', () => {
    const exts = new Set(['.js']);
    const files = collectCodeFiles(TEST_DIR, exts);
    const names = files.map(f => f.relative);
    assert.ok(!names.some(n => n.includes('node_modules')));
  });

  it('skips Archived directories', () => {
    const exts = new Set(['.js']);
    const files = collectCodeFiles(TEST_DIR, exts);
    const names = files.map(f => f.relative);
    assert.ok(!names.some(n => n.includes('Archived')));
  });

  it('returns absolute and relative paths', () => {
    const exts = new Set(['.js']);
    const files = collectCodeFiles(TEST_DIR, exts);
    const appFile = files.find(f => f.relative === 'app.js');
    assert.ok(appFile);
    assert.strictEqual(appFile.absolute, path.join(TEST_DIR, 'app.js'));
  });

  it('prevents path traversal', () => {
    const exts = new Set(['.js']);
    const files = collectCodeFiles(TEST_DIR, exts);
    for (const f of files) {
      assert.ok(path.resolve(f.absolute).startsWith(path.resolve(TEST_DIR)));
    }
  });
});
