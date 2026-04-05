'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

describe('cross-project-urls pattern', () => {
  let extractor;

  before(() => {
    for (const key of Object.keys(require.cache)) {
      if (key.includes('flow-extractors/javascript')) delete require.cache[key];
    }
    extractor = require('../../flow-extractors/javascript/index');
  });

  const ctx = { project: 'test', projectRoot: '/tmp' };

  it('extracts API URL string as url_reference node', () => {
    const code = `fetch('/runtime/advenire-consulting/api/public/booking');`;
    const result = extractor.extract('client.js', code, ctx);
    const ref = result.nodes.find(n => n.type === 'url_reference');
    assert.ok(ref, 'Should find url_reference node');
    assert.ok(ref.metadata.url.includes('/api/'));
  });

  it('extracts fetch API URL', () => {
    const code = `fetch('/api/runtime/tools');`;
    const result = extractor.extract('fetch.js', code, ctx);
    const ref = result.nodes.find(n => n.type === 'url_reference');
    assert.ok(ref, 'Should find url_reference node');
  });

  it('does not extract non-API URLs', () => {
    const code = `
const img = '/assets/css/base.css';
const ext = 'https://example.com/page';
`;
    const result = extractor.extract('static.js', code, ctx);
    const refs = result.nodes.filter(n => n.type === 'url_reference');
    assert.strictEqual(refs.length, 0, 'Should not extract non-API URLs');
  });
});
