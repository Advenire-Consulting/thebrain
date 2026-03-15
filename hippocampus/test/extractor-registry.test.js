'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '.test-extractor-registry');

describe('extractor-registry', () => {
  let loadExtractors;

  before(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });

    // Valid extractor
    fs.writeFileSync(path.join(TEST_DIR, 'test-lang.js'), `
      'use strict';
      module.exports = {
        extensions: ['.tl', '.tlx'],
        extractImports(filePath, content) { return []; },
        extractExports(filePath, content) { return []; },
        extractRoutes(filePath, content) { return []; },
        extractIdentifiers(line, lineNumber) { return []; },
        extractDefinitions(content) { return []; },
      };
    `);

    // Invalid extractor (missing methods)
    fs.writeFileSync(path.join(TEST_DIR, 'bad-lang.js'), `
      'use strict';
      module.exports = { extensions: ['.bad'] };
    `);

    // Not an extractor (no extensions)
    fs.writeFileSync(path.join(TEST_DIR, 'not-extractor.js'), `
      'use strict';
      module.exports = { hello: true };
    `);

    ({ loadExtractors } = require('../lib/extractor-registry'));
  });

  after(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('loads valid extractors', () => {
    const registry = loadExtractors(TEST_DIR);
    assert.ok(registry.byExtension.has('.tl'));
    assert.ok(registry.byExtension.has('.tlx'));
    assert.strictEqual(registry.extractors.length, 1);
  });

  it('builds complete extension set', () => {
    const registry = loadExtractors(TEST_DIR);
    assert.ok(registry.allExtensions.has('.tl'));
    assert.ok(registry.allExtensions.has('.tlx'));
  });

  it('skips invalid extractors without crashing', () => {
    const registry = loadExtractors(TEST_DIR);
    assert.ok(!registry.byExtension.has('.bad'));
  });

  it('returns empty registry for nonexistent directory', () => {
    const registry = loadExtractors('/nonexistent/path');
    assert.strictEqual(registry.extractors.length, 0);
    assert.strictEqual(registry.allExtensions.size, 0);
  });

  it('extractor methods are callable', () => {
    const registry = loadExtractors(TEST_DIR);
    const ext = registry.byExtension.get('.tl');
    assert.deepStrictEqual(ext.extractImports('test.tl', 'content'), []);
    assert.deepStrictEqual(ext.extractIdentifiers('const x = 1', 1), []);
  });
});
