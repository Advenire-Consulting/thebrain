'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const TEST_DIR = path.join(__dirname, '.test-flow-extractors');

describe('Flow Extractor Registry', () => {
  before(() => {
    // Create temp directory structure with mock extractors
    fs.mkdirSync(path.join(TEST_DIR, 'mock-lang'), { recursive: true });
    fs.mkdirSync(path.join(TEST_DIR, 'bad-lang'), { recursive: true });

    // Valid extractor — has extensions + extract
    fs.writeFileSync(path.join(TEST_DIR, 'mock-lang', 'index.js'), `
      module.exports = {
        extensions: ['.mock', '.mk'],
        extract(filePath, content, ctx) { return { nodes: [], edges: [] }; }
      };
    `);

    // Invalid extractor — missing extract method
    fs.writeFileSync(path.join(TEST_DIR, 'bad-lang', 'index.js'), `
      module.exports = {
        extensions: ['.bad'],
        notExtract() {}
      };
    `);

    // Stray file in root (not a directory)
    fs.writeFileSync(path.join(TEST_DIR, 'stray-file.js'), 'module.exports = {};');
  });

  after(() => {
    // Clean up temp dir and require cache
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
    for (const key of Object.keys(require.cache)) {
      if (key.includes('.test-flow-extractors')) delete require.cache[key];
    }
  });

  it('discovers valid extractor directories and maps extensions', () => {
    const { loadFlowExtractors } = require('../lib/flow-extractor-registry');
    const map = loadFlowExtractors(TEST_DIR);
    assert.ok(map.has('.mock'));
    assert.ok(map.has('.mk'));
    assert.strictEqual(typeof map.get('.mock').extract, 'function');
  });

  it('skips directories without valid extract method', () => {
    const { loadFlowExtractors } = require('../lib/flow-extractor-registry');
    const map = loadFlowExtractors(TEST_DIR);
    assert.ok(!map.has('.bad'));
  });

  it('skips non-directory entries', () => {
    const { loadFlowExtractors } = require('../lib/flow-extractor-registry');
    const map = loadFlowExtractors(TEST_DIR);
    // stray-file.js should not create any entries
    assert.strictEqual(map.size, 2); // only .mock and .mk
  });

  it('returns empty map for non-existent directory', () => {
    const { loadFlowExtractors } = require('../lib/flow-extractor-registry');
    const map = loadFlowExtractors('/tmp/does-not-exist-flow-extractors');
    assert.strictEqual(map.size, 0);
  });
});
