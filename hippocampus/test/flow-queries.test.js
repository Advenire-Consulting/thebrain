'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const TEST_DB = path.join(__dirname, '.test-flow-queries.db');

describe('FlowQueries', () => {
  let flowDb, queries;

  before(() => {
    try { fs.unlinkSync(TEST_DB); } catch {}

    const { FlowDB } = require('../lib/flow-db');
    const { FlowQueries } = require('../lib/flow-queries');

    flowDb = new FlowDB(TEST_DB);
    const db = flowDb.db;

    // Seed test data simulating a real project
    // Nodes
    const modServer = flowDb.insertNode('proj', 'server.js', 'server.js', 'module', null, { exports: ['app'] });
    const modCompany = flowDb.insertNode('proj', 'lib/company.js', 'lib/company.js', 'module', null, { exports: ['createCompanyMiddleware'] });
    const fnCreate = flowDb.insertNode('proj', 'lib/company.js', 'createCompanyMiddleware', 'function', 5, { params: ['config'] });
    const propReqCompany = flowDb.insertNode('proj', 'lib/company.js', 'req.company', 'property', 12, { shape: ['id', 'slug', 'name'] });
    const tableCompanies = flowDb.insertNode('proj', 'lib/company.js', 'companies', 'table', null, {});
    const fnMain = flowDb.insertNode('proj', 'server.js', 'main', 'function', 1, { params: [] });
    const routeTheme = flowDb.insertNode('proj', 'server.js', 'GET /api/theme', 'route', 20, { method: 'GET', path: '/api/theme' });
    const mwCompany = flowDb.insertNode('proj', 'server.js', 'companyMiddleware', 'middleware', 8, { sequence: 1 });

    // Edges
    flowDb.insertEdge(fnMain, fnCreate, 'calls', 'proj', 'server.js', null, null);
    flowDb.insertEdge(fnCreate, propReqCompany, 'attaches', 'proj', 'lib/company.js', null, null);
    flowDb.insertEdge(routeTheme, propReqCompany, 'reads', 'proj', 'server.js', { fullPath: 'req.company.slug' }, null);
    flowDb.insertEdge(fnCreate, tableCompanies, 'queries_table', 'proj', 'lib/company.js', { columns: ['id', 'slug', 'name'] }, null);

    queries = new FlowQueries(db);
  });

  after(() => {
    flowDb.close();
    try { fs.unlinkSync(TEST_DB); } catch {}
  });

  it('trace req.company — has setBy and readBy', () => {
    const result = queries.trace('req.company', 'proj');
    assert.ok(result, 'Should find req.company');
    assert.ok(result.setBy.length > 0, 'Should have setBy entries');
    assert.ok(result.readBy.length > 0, 'Should have readBy entries');
  });

  it('trace createCompanyMiddleware — has calledBy', () => {
    const result = queries.trace('createCompanyMiddleware', 'proj');
    assert.ok(result, 'Should find createCompanyMiddleware');
    assert.ok(result.calledBy.length > 0 || result.attaches.length > 0, 'Should have calledBy or attaches');
  });

  it('fileFlow lib/company.js — has nodes', () => {
    const result = queries.fileFlow('lib/company.js', 'proj');
    assert.ok(result, 'Should return file flow');
    assert.ok(result.nodes.length > 0, 'Should have nodes');
  });

  it('trace nonExistentThing returns null', () => {
    const result = queries.trace('nonExistentThing', 'proj');
    assert.strictEqual(result, null);
  });
});
