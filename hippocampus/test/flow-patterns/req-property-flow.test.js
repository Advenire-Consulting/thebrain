'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

describe('req-property-flow pattern', () => {
  let extractor;

  before(() => {
    for (const key of Object.keys(require.cache)) {
      if (key.includes('flow-extractors/javascript')) delete require.cache[key];
    }
    extractor = require('../../flow-extractors/javascript/index');
  });

  const ctx = { project: 'test', projectRoot: '/tmp' };

  it('extracts req.company assignment as property node', () => {
    const code = `req.company = { id: company.id, slug: company.slug, name: company.name };`;
    const result = extractor.extract('mw.js', code, ctx);
    const prop = result.nodes.find(n => n.type === 'property' && n.name === 'req.company');
    assert.ok(prop, 'Should find req.company property node');
  });

  it('records object shape in metadata', () => {
    const code = `req.company = { id: company.id, slug: company.slug };`;
    const result = extractor.extract('shape.js', code, ctx);
    const prop = result.nodes.find(n => n.name === 'req.company');
    assert.ok(prop);
    assert.ok(prop.metadata.shape.includes('id'));
    assert.ok(prop.metadata.shape.includes('slug'));
  });

  it('extracts req.db assignment with attaches edge', () => {
    const code = `req.db = entry.db;`;
    const result = extractor.extract('db.js', code, ctx);
    const edge = result.edges.find(e => e.type === 'attaches');
    assert.ok(edge, 'Should have attaches edge');
  });

  it('extracts req.company.slug reads as reads edges', () => {
    const code = `
const slug = req.company.slug;
const db = req.company.db;
`;
    const result = extractor.extract('read.js', code, ctx);
    const reads = result.edges.filter(e => e.type === 'reads');
    assert.ok(reads.length >= 1, 'Should have reads edges');
  });

  it('extracts res.locals.user assignment', () => {
    const code = `res.locals.user = authenticatedUser;`;
    const result = extractor.extract('auth.js', code, ctx);
    const prop = result.nodes.find(n => n.type === 'property' && n.name === 'res.locals.user');
    assert.ok(prop, 'Should find res.locals.user property node');
  });
});
