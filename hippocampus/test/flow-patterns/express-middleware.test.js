'use strict';

const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');

describe('express-middleware pattern', () => {
  let extractor;

  before(() => {
    for (const key of Object.keys(require.cache)) {
      if (key.includes('flow-extractors/javascript')) delete require.cache[key];
    }
    extractor = require('../../flow-extractors/javascript/index');
  });

  const ctx = { project: 'test', projectRoot: '/tmp' };

  it('extracts app.use() calls with increasing sequence numbers', () => {
    const code = `
app.use(cors());
app.use(express.json());
app.use(helmet());
`;
    const result = extractor.extract('app.js', code, ctx);
    const mwNodes = result.nodes.filter(n => n.type === 'middleware');
    assert.ok(mwNodes.length >= 3, 'Should find 3 middleware nodes');

    // Verify sequence ordering
    const sequences = mwNodes.map(n => n.metadata.sequence);
    for (let i = 1; i < sequences.length; i++) {
      assert.ok(sequences[i] > sequences[i - 1], 'Sequences should increase');
    }
  });

  it('extracts sub-app mounting with path prefix', () => {
    const code = `outerApp.use('/runtime', app);`;
    const result = extractor.extract('mount.js', code, ctx);
    const mountEdge = result.edges.find(e => e.type === 'mounts');
    assert.ok(mountEdge, 'Should have mounts edge');
    assert.strictEqual(mountEdge.data.prefix, '/runtime');
  });

  it('extracts router mounting with path prefix', () => {
    const code = `app.use('/api', apiRouter);`;
    const result = extractor.extract('mount2.js', code, ctx);
    const mountEdge = result.edges.find(e => e.type === 'mounts');
    assert.ok(mountEdge, 'Should have mounts edge');
    assert.strictEqual(mountEdge.data.prefix, '/api');
  });

  it('extracts middleware without prefix', () => {
    const code = `app.use(cors());`;
    const result = extractor.extract('noprefix.js', code, ctx);
    const mwNode = result.nodes.find(n => n.type === 'middleware');
    assert.ok(mwNode, 'Should find middleware node');
    assert.strictEqual(mwNode.metadata.prefix, null);
  });
});
