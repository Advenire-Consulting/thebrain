'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

describe('config-reads pattern', () => {
  let extractor;

  before(() => {
    for (const key of Object.keys(require.cache)) {
      if (key.includes('flow-extractors/javascript')) delete require.cache[key];
    }
    extractor = require('../../flow-extractors/javascript/index');
  });

  const ctx = { project: 'test', projectRoot: '/tmp' };

  it('extracts process.env.PORT as config node', () => {
    const code = `const port = process.env.PORT || 3060;`;
    const result = extractor.extract('config.js', code, ctx);
    const cfg = result.nodes.find(n => n.type === 'config' && n.name === 'process.env.PORT');
    assert.ok(cfg, 'Should find process.env.PORT config node');
  });

  it('extracts runtimeConfig.basePath as reads edge', () => {
    const code = `const basePath = runtimeConfig.basePath || '';`;
    const result = extractor.extract('setup.js', code, ctx);
    const edge = result.edges.find(e => e.type === 'reads');
    assert.ok(edge, 'Should have reads edge');
  });
});
