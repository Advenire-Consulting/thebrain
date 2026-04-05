'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const TEST_DB = path.join(__dirname, '.test-flow.db');

describe('FlowDB', () => {
  let db;

  before(() => {
    // Clean up any leftover test DB
    try { fs.unlinkSync(TEST_DB); } catch {}
    const { FlowDB } = require('../lib/flow-db');
    db = new FlowDB(TEST_DB);
  });

  after(() => {
    db.close();
    try { fs.unlinkSync(TEST_DB); } catch {}
  });

  it('creates all tables on initialization', () => {
    const tables = db.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).all().map(t => t.name).sort();
    assert.deepStrictEqual(tables, ['annotations', 'edges', 'file_hashes', 'nodes']);
  });

  it('inserts and retrieves nodes with metadata round-trip', () => {
    const id = db.insertNode('test-proj', 'server.js', 'handleRequest', 'function', 10, { params: ['req', 'res'] });
    assert.ok(id > 0);

    const node = db.getNode(id);
    assert.strictEqual(node.project, 'test-proj');
    assert.strictEqual(node.file, 'server.js');
    assert.strictEqual(node.name, 'handleRequest');
    assert.strictEqual(node.type, 'function');
    assert.strictEqual(node.line, 10);
    const meta = JSON.parse(node.metadata_json);
    assert.deepStrictEqual(meta.params, ['req', 'res']);
  });

  it('inserts edges with denormalized source_project/source_file', () => {
    const srcId = db.insertNode('test-proj', 'app.js', 'main', 'function', 1, null);
    const tgtId = db.insertNode('test-proj', 'app.js', 'helper', 'function', 20, null);

    const edgeId = db.insertEdge(srcId, tgtId, 'calls', 'test-proj', 'app.js', null, null);
    assert.ok(edgeId > 0);

    // Verify denormalized columns
    const edge = db.db.prepare('SELECT * FROM edges WHERE id = ?').get(edgeId);
    assert.strictEqual(edge.source_project, 'test-proj');
    assert.strictEqual(edge.source_file, 'app.js');
    assert.strictEqual(edge.type, 'calls');
  });

  it('deletes nodes and edges for a file without affecting other files', () => {
    // Insert nodes in two different files
    const id1 = db.insertNode('del-proj', 'a.js', 'fnA', 'function', 1, null);
    const id2 = db.insertNode('del-proj', 'b.js', 'fnB', 'function', 1, null);

    // Edge from a.js to b.js
    db.insertEdge(id1, id2, 'calls', 'del-proj', 'a.js', null, null);

    // Delete a.js nodes and edges
    db.deleteEdgesForFile('del-proj', 'a.js');
    db.deleteNodesForFile('del-proj', 'a.js');

    // a.js node gone
    const aNode = db.getNode(id1);
    assert.strictEqual(aNode, undefined);

    // b.js node still exists
    const bNode = db.getNode(id2);
    assert.strictEqual(bNode.name, 'fnB');
  });

  it('deletes edges by source file using denormalized columns', () => {
    const s = db.insertNode('edge-proj', 'caller.js', 'caller', 'function', 1, null);
    const t = db.insertNode('edge-proj', 'callee.js', 'callee', 'function', 1, null);
    db.insertEdge(s, t, 'calls', 'edge-proj', 'caller.js', null, null);

    // Delete edges from caller.js
    db.deleteEdgesForFile('edge-proj', 'caller.js');

    // Edge should be gone
    const edges = db.db.prepare('SELECT * FROM edges WHERE source_project = ? AND source_file = ?').all('edge-proj', 'caller.js');
    assert.strictEqual(edges.length, 0);

    // But both nodes should still exist
    assert.ok(db.getNode(s));
    assert.ok(db.getNode(t));
  });

  it('upserts and retrieves file hashes', () => {
    db.upsertFileHash('hash-proj', 'index.js', 'abc123');
    const hash = db.getFileHash('hash-proj', 'index.js');
    assert.strictEqual(hash, 'abc123');

    // Update
    db.upsertFileHash('hash-proj', 'index.js', 'def456');
    const updated = db.getFileHash('hash-proj', 'index.js');
    assert.strictEqual(updated, 'def456');
  });

  it('deletes file hash entry', () => {
    db.upsertFileHash('hash-proj', 'temp.js', 'zzz');
    db.deleteFileHash('hash-proj', 'temp.js');
    const hash = db.getFileHash('hash-proj', 'temp.js');
    assert.strictEqual(hash, null);
  });

  it('resolves node by {name, file, type} tuple', () => {
    // Same name, different types in same file
    db.insertNode('resolve-proj', 'lib.js', 'Config', 'function', 5, null);
    db.insertNode('resolve-proj', 'lib.js', 'Config', 'module', null, null);

    const fnId = db.resolveNode('resolve-proj', 'lib.js', 'Config', 'function');
    assert.ok(fnId > 0);
    const fnNode = db.getNode(fnId);
    assert.strictEqual(fnNode.type, 'function');

    const modId = db.resolveNode('resolve-proj', 'lib.js', 'Config', 'module');
    assert.ok(modId > 0);
    assert.notStrictEqual(fnId, modId);
  });

  it('unique index prevents duplicate nodes', () => {
    db.insertNode('uniq-proj', 'dup.js', 'myFn', 'function', 42, null);
    assert.throws(() => {
      db.insertNode('uniq-proj', 'dup.js', 'myFn', 'function', 42, null);
    });
  });

  it('unique index handles NULL lines via COALESCE', () => {
    // Two table nodes with NULL line in same file should collide
    db.insertNode('null-proj', 'data.js', 'users', 'table', null, null);
    assert.throws(() => {
      db.insertNode('null-proj', 'data.js', 'users', 'table', null, null);
    });
  });

  it('CASCADE: deleting nodes cascades to edges', () => {
    const src = db.insertNode('casc-proj', 'x.js', 'srcFn', 'function', 1, null);
    const tgt = db.insertNode('casc-proj', 'x.js', 'tgtFn', 'function', 10, null);
    const edgeId = db.insertEdge(src, tgt, 'calls', 'casc-proj', 'x.js', null, null);

    // Delete source node directly
    db.db.prepare('DELETE FROM nodes WHERE id = ?').run(src);

    // Edge should be cascade-deleted
    const edge = db.db.prepare('SELECT * FROM edges WHERE id = ?').get(edgeId);
    assert.strictEqual(edge, undefined);
  });

  it('transaction wraps operations atomically', () => {
    const countBefore = db.db.prepare('SELECT COUNT(*) as c FROM nodes WHERE project = ?').get('tx-proj').c;

    assert.throws(() => {
      db.transaction(() => {
        db.insertNode('tx-proj', 'tx.js', 'willRollback', 'function', 1, null);
        throw new Error('deliberate rollback');
      });
    });

    const countAfter = db.db.prepare('SELECT COUNT(*) as c FROM nodes WHERE project = ?').get('tx-proj').c;
    assert.strictEqual(countAfter, countBefore);
  });
});
