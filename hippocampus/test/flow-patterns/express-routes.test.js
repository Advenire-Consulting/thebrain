'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

describe('express-routes pattern', () => {
  let extractor;

  before(() => {
    for (const key of Object.keys(require.cache)) {
      if (key.includes('flow-extractors/javascript')) delete require.cache[key];
    }
    extractor = require('../../flow-extractors/javascript/index');
  });

  const ctx = { project: 'test', projectRoot: '/tmp' };

  it('extracts app.get route with method and path', () => {
    const code = `app.get('/api/items', handler);`;
    const result = extractor.extract('routes.js', code, ctx);
    const route = result.nodes.find(n => n.type === 'route' && n.name === 'GET /api/items');
    assert.ok(route, 'Should find GET /api/items route');
    assert.strictEqual(route.metadata.method, 'GET');
    assert.strictEqual(route.metadata.path, '/api/items');
  });

  it('extracts app.post route', () => {
    const code = `app.post('/api/items', createHandler);`;
    const result = extractor.extract('routes.js', code, ctx);
    const route = result.nodes.find(n => n.type === 'route' && n.name === 'POST /api/items');
    assert.ok(route, 'Should find POST route');
  });

  it('extracts router.delete route', () => {
    const code = `router.delete('/api/items/:id', deleteHandler);`;
    const result = extractor.extract('routes.js', code, ctx);
    const route = result.nodes.find(n => n.type === 'route' && n.name === 'DELETE /api/items/:id');
    assert.ok(route, 'Should find DELETE route');
  });

  it('produces mounts_route edges', () => {
    const code = `app.get('/api/items', handler);`;
    const result = extractor.extract('routes.js', code, ctx);
    const edge = result.edges.find(e => e.type === 'mounts_route');
    assert.ok(edge, 'Should have mounts_route edge');
  });
});
