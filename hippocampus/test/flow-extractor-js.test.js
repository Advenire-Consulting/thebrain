'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

describe('JavaScript Flow Extractor', () => {
  let extractor;

  before(() => {
    // Clear require cache to pick up any new pattern modules
    for (const key of Object.keys(require.cache)) {
      if (key.includes('flow-extractors/javascript')) delete require.cache[key];
    }
    extractor = require('../flow-extractors/javascript/index');
  });

  it('exports extensions (.js, .mjs, .cjs) and extract function', () => {
    assert.ok(Array.isArray(extractor.extensions));
    assert.ok(extractor.extensions.includes('.js'));
    assert.ok(extractor.extensions.includes('.mjs'));
    assert.ok(extractor.extensions.includes('.cjs'));
    assert.strictEqual(typeof extractor.extract, 'function');
  });

  it('returns empty results for empty file', () => {
    const result = extractor.extract('empty.js', '', { project: 'test', projectRoot: '/tmp' });
    assert.deepStrictEqual(result.nodes, []);
    assert.deepStrictEqual(result.edges, []);
  });

  it('returns empty results on parse error instead of throwing', () => {
    const result = extractor.extract('bad.js', '}{{{not valid javascript!!!', { project: 'test', projectRoot: '/tmp' });
    assert.deepStrictEqual(result.nodes, []);
    assert.deepStrictEqual(result.edges, []);
  });

  it('extracts function declarations via function-calls pattern', () => {
    const code = `
function handleRequest(req, res) {
  return res.send('ok');
}
`;
    const result = extractor.extract('server.js', code, { project: 'test', projectRoot: '/tmp' });
    const fnNodes = result.nodes.filter(n => n.type === 'function');
    assert.ok(fnNodes.length > 0, 'Should find at least one function node');
    const handler = fnNodes.find(n => n.name === 'handleRequest');
    assert.ok(handler, 'Should find handleRequest');
    assert.deepStrictEqual(handler.metadata.params, ['req', 'res']);
  });
});
