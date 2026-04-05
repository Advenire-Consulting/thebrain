'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

describe('function-calls pattern', () => {
  let extractor;

  before(() => {
    // Clear cache to pick up new patterns
    for (const key of Object.keys(require.cache)) {
      if (key.includes('flow-extractors/javascript')) delete require.cache[key];
    }
    extractor = require('../../flow-extractors/javascript/index');
  });

  const ctx = { project: 'test', projectRoot: '/tmp' };

  it('extracts named function declarations with line and params', () => {
    const code = `function handleRequest(req, res) {\n  return res.send('ok');\n}`;
    const result = extractor.extract('server.js', code, ctx);
    const fn = result.nodes.find(n => n.name === 'handleRequest' && n.type === 'function');
    assert.ok(fn, 'Should find handleRequest');
    assert.deepStrictEqual(fn.metadata.params, ['req', 'res']);
    assert.ok(fn.line >= 1);
  });

  it('extracts assigned function expressions', () => {
    const code = `const handler = function(req, res) { res.end(); };`;
    const result = extractor.extract('app.js', code, ctx);
    const fn = result.nodes.find(n => n.name === 'handler' && n.type === 'function');
    assert.ok(fn, 'Should find handler function expression');
  });

  it('extracts arrow functions with params', () => {
    const code = `const mw = (req, res, next) => { next(); };`;
    const result = extractor.extract('mw.js', code, ctx);
    const fn = result.nodes.find(n => n.name === 'mw' && n.type === 'function');
    assert.ok(fn, 'Should find mw arrow function');
    assert.deepStrictEqual(fn.metadata.params, ['req', 'res', 'next']);
  });

  it('extracts call sites as edges', () => {
    const code = `
function main() {
  helper();
}
function helper() {}
`;
    const result = extractor.extract('calls.js', code, ctx);
    const callEdge = result.edges.find(e => e.type === 'calls' && e.target.name === 'helper');
    assert.ok(callEdge, 'Should have calls edge to helper');
    assert.strictEqual(callEdge.source.name, 'main');
  });

  it('extracts identifier arguments as passes_arg edges', () => {
    const code = `
function process(data) {}
function main() {
  const input = getData();
  process(input);
}
`;
    const result = extractor.extract('args.js', code, ctx);
    const argEdge = result.edges.find(e => e.type === 'passes_arg');
    assert.ok(argEdge, 'Should have passes_arg edge');
  });
});
