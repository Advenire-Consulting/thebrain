'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '.test-classifier');
const WEBSITES_ROOT = '/home/user/websites';

const SAMPLE_DIR = {
  name: 'test-portal',
  root: 'test-project/',
  generated_at: '2026-03-07T17:00:00Z',
  aliases: {},
  files: {
    'server.js': {
      purpose: 'Express entry point',
      imports: ['./routes/api', './lib/db'],
      exports: ['app'],
    },
    'lib/db.js': {
      purpose: 'Database accessor',
      exports: ['getDb'],
      db: ['data/app.db'],
    },
    'routes/api.js': {
      purpose: 'API routes',
      imports: ['../lib/db'],
      exports: ['router'],
    },
  },
  schemas: {
    'app.db': {
      path: 'data/app.db',
      tables: { users: 'id, name, email', orders: 'id, user_id, total' },
    },
  },
};

before(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(TEST_DIR, 'test-portal.dir.json'),
    JSON.stringify(SAMPLE_DIR, null, 2)
  );
});

after(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('classifyPath', () => {
  it('returns RED for project root directory', () => {
    const { classifyPath } = require('../lib/classifier');
    const { loadAllDIR } = require('../../hippocampus/lib/dir-loader');
    const dirs = loadAllDIR(TEST_DIR);
    const result = classifyPath('/home/user/websites/test-project', dirs, WEBSITES_ROOT);
    assert.equal(result.level, 'RED');
    assert.ok(result.reason.includes('project root'));
  });

  it('returns RED for database file', () => {
    const { classifyPath } = require('../lib/classifier');
    const { loadAllDIR } = require('../../hippocampus/lib/dir-loader');
    const dirs = loadAllDIR(TEST_DIR);
    const result = classifyPath('/home/user/websites/test-project/data/app.db', dirs, WEBSITES_ROOT);
    assert.equal(result.level, 'RED');
    assert.ok(result.reason.includes('database'));
  });

  it('returns RED for .env file', () => {
    const { classifyPath } = require('../lib/classifier');
    const { loadAllDIR } = require('../../hippocampus/lib/dir-loader');
    const dirs = loadAllDIR(TEST_DIR);
    const result = classifyPath('/home/user/websites/test-project/.env', dirs, WEBSITES_ROOT);
    assert.equal(result.level, 'RED');
    assert.ok(result.reason.includes('sensitive'));
  });

  it('returns YELLOW for known file with dependents', () => {
    const { classifyPath } = require('../lib/classifier');
    const { loadAllDIR } = require('../../hippocampus/lib/dir-loader');
    const dirs = loadAllDIR(TEST_DIR);
    const result = classifyPath('/home/user/websites/test-project/lib/db.js', dirs, WEBSITES_ROOT);
    assert.equal(result.level, 'YELLOW');
  });

  it('returns UNKNOWN for path outside all project roots', () => {
    const { classifyPath } = require('../lib/classifier');
    const { loadAllDIR } = require('../../hippocampus/lib/dir-loader');
    const dirs = loadAllDIR(TEST_DIR);
    const result = classifyPath('/tmp/random/file.js', dirs, WEBSITES_ROOT);
    assert.equal(result.level, 'UNKNOWN');
  });

  it('respects sensitivity overrides from config', () => {
    const { classifyPath } = require('../lib/classifier');
    const { loadAllDIR } = require('../../hippocampus/lib/dir-loader');
    const dirs = loadAllDIR(TEST_DIR);
    const config = { sensitivity_overrides: { 'test-project/data/app.db': 'code' } };
    const result = classifyPath('/home/user/websites/test-project/data/app.db', dirs, WEBSITES_ROOT, config);
    assert.notEqual(result.level, 'RED');
  });

  it('respects whitelisted paths from config', () => {
    const { classifyPath } = require('../lib/classifier');
    const { loadAllDIR } = require('../../hippocampus/lib/dir-loader');
    const dirs = loadAllDIR(TEST_DIR);
    const config = { whitelisted_paths: ['/home/user/websites/test-project'] };
    const result = classifyPath('/home/user/websites/test-project', dirs, WEBSITES_ROOT, config);
    assert.equal(result.level, 'GREEN');
  });

  it('identifies schema tables in RED result for database files', () => {
    const { classifyPath } = require('../lib/classifier');
    const { loadAllDIR } = require('../../hippocampus/lib/dir-loader');
    const dirs = loadAllDIR(TEST_DIR);
    const result = classifyPath('/home/user/websites/test-project/data/app.db', dirs, WEBSITES_ROOT);
    assert.ok(result.tables);
    assert.ok(result.tables.includes('users'));
  });
});
