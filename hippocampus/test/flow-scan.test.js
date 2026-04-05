'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const TEST_DB = path.join(__dirname, '.test-flow-scan.db');
const TEST_PROJECT_DIR = path.join(__dirname, '.test-flow-scan-project');

describe('flow-scan', () => {
  let FlowDB, scanProject;

  before(() => {
    // Clean up leftovers
    try { fs.unlinkSync(TEST_DB); } catch {}
    try { fs.rmSync(TEST_PROJECT_DIR, { recursive: true }); } catch {}

    // Create test project
    fs.mkdirSync(path.join(TEST_PROJECT_DIR, 'lib'), { recursive: true });

    // server.js — requires lib/middleware, registers routes, has SQL
    fs.writeFileSync(path.join(TEST_PROJECT_DIR, 'server.js'), `
const { createMiddleware } = require('./lib/middleware');
const express = require('express');
const app = express();

app.use(createMiddleware());
app.get('/api/items', function getItems(req, res) {
  const items = db.prepare('SELECT id, name FROM items').all();
  res.json(items);
});
`);

    // lib/middleware.js — exports createMiddleware, assigns req.db
    fs.writeFileSync(path.join(TEST_PROJECT_DIR, 'lib', 'middleware.js'), `
function createMiddleware() {
  return function(req, res, next) {
    req.db = getDb();
    next();
  };
}
module.exports = { createMiddleware };
`);

    // Clear require cache
    for (const key of Object.keys(require.cache)) {
      if (key.includes('flow-')) delete require.cache[key];
      if (key.includes('flow-extractors')) delete require.cache[key];
    }

    ({ FlowDB } = require('../lib/flow-db'));
    ({ scanProject } = require('../scripts/flow-scan'));
  });

  after(() => {
    try { fs.unlinkSync(TEST_DB); } catch {}
    try { fs.rmSync(TEST_PROJECT_DIR, { recursive: true }); } catch {}
  });

  it('scans project and produces function/route/table nodes', () => {
    const db = new FlowDB(TEST_DB);
    try {
      const result = scanProject(db, TEST_PROJECT_DIR, 'test-scan');
      assert.ok(result.scanned >= 2, 'Should scan at least 2 files');

      // Check nodes were created
      const nodes = db.db.prepare('SELECT * FROM nodes WHERE project = ?').all('test-scan');
      assert.ok(nodes.length > 0, 'Should have nodes');

      // Should have function, route, and table nodes
      const types = new Set(nodes.map(n => n.type));
      assert.ok(types.has('function'), 'Should have function nodes');
      assert.ok(types.has('route'), 'Should have route nodes');
      assert.ok(types.has('table'), 'Should have table nodes');
    } finally {
      db.close();
    }
  });

  it('produces edges between nodes', () => {
    const db = new FlowDB(TEST_DB);
    try {
      // Scan fresh
      db.db.prepare('DELETE FROM nodes').run();
      db.db.prepare('DELETE FROM edges').run();
      db.db.prepare('DELETE FROM file_hashes').run();
      scanProject(db, TEST_PROJECT_DIR, 'test-edges');

      const edges = db.db.prepare('SELECT * FROM edges WHERE source_project = ?').all('test-edges');
      assert.ok(edges.length > 0, 'Should have edges');
    } finally {
      db.close();
    }
  });

  it('incremental: second scan skips unchanged files', () => {
    const db = new FlowDB(TEST_DB);
    try {
      db.db.prepare('DELETE FROM nodes').run();
      db.db.prepare('DELETE FROM edges').run();
      db.db.prepare('DELETE FROM file_hashes').run();

      const first = scanProject(db, TEST_PROJECT_DIR, 'test-incr');
      assert.ok(first.scanned >= 2);

      const second = scanProject(db, TEST_PROJECT_DIR, 'test-incr');
      assert.strictEqual(second.scanned, 0, 'Should skip all on second scan');
      assert.ok(second.skipped >= 2, 'Should report skipped files');
    } finally {
      db.close();
    }
  });

  it('re-scans changed files', () => {
    const db = new FlowDB(TEST_DB);
    try {
      db.db.prepare('DELETE FROM nodes').run();
      db.db.prepare('DELETE FROM edges').run();
      db.db.prepare('DELETE FROM file_hashes').run();

      scanProject(db, TEST_PROJECT_DIR, 'test-rescan');

      // Modify a file
      const serverPath = path.join(TEST_PROJECT_DIR, 'server.js');
      fs.appendFileSync(serverPath, '\n// modified\n');

      const result = scanProject(db, TEST_PROJECT_DIR, 'test-rescan');
      assert.strictEqual(result.scanned, 1, 'Should re-scan only the modified file');
    } finally {
      db.close();
    }
  });
});
