'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

describe('module-exports pattern', () => {
  let extractor;

  before(() => {
    for (const key of Object.keys(require.cache)) {
      if (key.includes('flow-extractors/javascript')) delete require.cache[key];
    }
    extractor = require('../../flow-extractors/javascript/index');
  });

  const ctx = { project: 'test', projectRoot: '/tmp' };

  it('extracts module.exports object with export list', () => {
    const code = `
function createApp() {}
function validateSlug() {}
module.exports = { createApp, validateSlug };
`;
    const result = extractor.extract('lib.js', code, ctx);
    const mod = result.nodes.find(n => n.type === 'module');
    assert.ok(mod, 'Should find module node');
    assert.ok(mod.metadata.exports.includes('createApp'));
    assert.ok(mod.metadata.exports.includes('validateSlug'));
  });

  it('extracts require() calls as edges with resolved path', () => {
    const code = `const company = require('./company');`;
    const result = extractor.extract('server.js', code, ctx);
    const callEdge = result.edges.find(e => e.type === 'requires');
    assert.ok(callEdge, 'Should have requires edge');
    assert.ok(callEdge.target.name.includes('company'), 'Target should reference company module');
  });

  it('extracts exports.name assignment', () => {
    const code = `exports.createApp = function() {};`;
    const result = extractor.extract('app.js', code, ctx);
    const mod = result.nodes.find(n => n.type === 'module');
    assert.ok(mod, 'Should find module node');
    assert.ok(mod.metadata.exports.includes('createApp'));
  });

  it('extracts single-value module.exports', () => {
    const code = `
function createApp() {}
module.exports = createApp;
`;
    const result = extractor.extract('single.js', code, ctx);
    const mod = result.nodes.find(n => n.type === 'module');
    assert.ok(mod, 'Should find module node');
    assert.ok(mod.metadata.exports.includes('createApp'));
  });
});
