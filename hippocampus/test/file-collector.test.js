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

    fs.mkdirSync(path.join(TEST_DIR, 'bin/Debug'), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, 'obj'), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, 'target/release'), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, 'build'), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, 'dist'), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, 'out'), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, 'vendor'), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, '.vs'), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, '.idea'), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, '.gradle'), { recursive: true });

    fs.writeFileSync(path.join(TEST_DIR, 'bin/Debug/app.dll'), 'binary');
    fs.writeFileSync(path.join(TEST_DIR, 'obj/project.assets.json'), '{}');
    fs.writeFileSync(path.join(TEST_DIR, 'target/release/main'), 'binary');
    fs.writeFileSync(path.join(TEST_DIR, 'build/output.js'), 'built');
    fs.writeFileSync(path.join(TEST_DIR, 'dist/bundle.js'), 'bundled');
    fs.writeFileSync(path.join(TEST_DIR, 'out/compiled.js'), 'compiled');
    fs.writeFileSync(path.join(TEST_DIR, 'vendor/lib.go'), 'package lib');
    fs.writeFileSync(path.join(TEST_DIR, '.vs/settings.json'), '{}');
    fs.writeFileSync(path.join(TEST_DIR, '.idea/workspace.xml'), '<xml/>');
    fs.writeFileSync(path.join(TEST_DIR, '.gradle/caches.bin'), 'cache');

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

  it('skips build artifact and IDE directories', () => {
    const exts = new Set(['.js', '.json', '.go', '.xml', '.dll']);
    const files = collectCodeFiles(TEST_DIR, exts);
    const names = files.map(f => f.relative);
    for (const dir of ['bin', 'obj', 'target', 'build', 'dist', 'out', 'vendor', '.vs', '.idea', '.gradle']) {
      assert.ok(!names.some(n => n.startsWith(dir + path.sep) || n.startsWith(dir + '/')),
        `should skip ${dir}/ but found file inside it`);
    }
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
