const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '.test-hippocampus');

const SAMPLE_DIR_FILE = {
  name: 'test-project',
  root: 'test-project/',
  generated_at: '2026-03-07T17:00:00Z',
  aliases: {
    'the test tool': 'test-project/tools/test-tool.js',
    'the config': 'test-project/config.js',
  },
  files: {
    'server.js': {
      purpose: 'Express entry point',
      imports: ['_shared/server-utils.js', '_shared/security.js'],
      exports: ['app'],
      db: ['test.db'],
    },
    'routes/api.js': {
      purpose: 'API routes',
      imports: ['../server.js', '_shared/auth.js'],
      exports: ['router'],
    },
  },
  schemas: {
    'test.db': {
      path: 'test-project/test.db',
      tables: {
        users: 'id, name, email, created_at',
        sessions: 'id, user_id, token_hash, expires_at',
      },
    },
  },
  references: {
    outbound: ['_shared/server-utils.js', '_shared/security.js', '_shared/auth.js'],
    inbound: ['Caddyfile (handle /test/*)'],
  },
};

before(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(TEST_DIR, 'test-project.dir.json'),
    JSON.stringify(SAMPLE_DIR_FILE, null, 2)
  );
});

after(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('loadAllDIR', () => {
  it('loads all .dir.json files from a directory', () => {
    const { loadAllDIR } = require('../lib/dir-loader');
    const dirs = loadAllDIR(TEST_DIR);
    assert.equal(dirs.length, 1);
    assert.equal(dirs[0].name, 'test-project');
  });

  it('returns empty array for missing directory', () => {
    const { loadAllDIR } = require('../lib/dir-loader');
    const dirs = loadAllDIR('/tmp/nonexistent-hippocampus-dir');
    assert.deepEqual(dirs, []);
  });

  it('skips malformed JSON files gracefully', () => {
    const { loadAllDIR } = require('../lib/dir-loader');
    fs.writeFileSync(path.join(TEST_DIR, 'bad.dir.json'), 'not json{{{');
    const dirs = loadAllDIR(TEST_DIR);
    assert.equal(dirs.length, 1);
    fs.unlinkSync(path.join(TEST_DIR, 'bad.dir.json'));
  });
});

describe('resolveAlias', () => {
  it('resolves a known alias to a file path', () => {
    const { loadAllDIR, resolveAlias } = require('../lib/dir-loader');
    const dirs = loadAllDIR(TEST_DIR);
    const result = resolveAlias(dirs, 'the test tool');
    assert.equal(result.path, 'test-project/tools/test-tool.js');
    assert.equal(result.project, 'test-project');
  });

  it('returns null for unknown alias', () => {
    const { loadAllDIR, resolveAlias } = require('../lib/dir-loader');
    const dirs = loadAllDIR(TEST_DIR);
    const result = resolveAlias(dirs, 'nonexistent thing');
    assert.equal(result, null);
  });

  it('matches case-insensitively', () => {
    const { loadAllDIR, resolveAlias } = require('../lib/dir-loader');
    const dirs = loadAllDIR(TEST_DIR);
    const result = resolveAlias(dirs, 'The Test Tool');
    assert.equal(result.path, 'test-project/tools/test-tool.js');
  });

  it('matches partial alias (substring)', () => {
    const { loadAllDIR, resolveAlias } = require('../lib/dir-loader');
    const dirs = loadAllDIR(TEST_DIR);
    const result = resolveAlias(dirs, 'test tool');
    assert.equal(result.path, 'test-project/tools/test-tool.js');
  });
});

describe('buildScopeRegistry', () => {
  it('builds KNOWN_SCOPES-compatible array from DIR files', () => {
    const { loadAllDIR, buildScopeRegistry } = require('../lib/dir-loader');
    const dirs = loadAllDIR(TEST_DIR);
    const scopes = buildScopeRegistry(dirs);
    assert.ok(Array.isArray(scopes));
    assert.ok(scopes.length >= 1);
    const scope = scopes.find(s => s.name === 'test-project');
    assert.ok(scope);
    assert.ok(scope.aliases.includes('the test tool'));
    assert.ok(scope.pathDomains.includes('test-project/'));
  });
});

describe('getBlastRadius', () => {
  it('returns inbound and outbound references for a file', () => {
    const { loadAllDIR, getBlastRadius } = require('../lib/dir-loader');
    const dirs = loadAllDIR(TEST_DIR);
    const result = getBlastRadius(dirs, 'server.js', 'test-project');
    assert.ok(result.imports.length > 0);
    assert.ok(result.importedBy.length > 0);
  });

  it('returns empty arrays for unknown file', () => {
    const { loadAllDIR, getBlastRadius } = require('../lib/dir-loader');
    const dirs = loadAllDIR(TEST_DIR);
    const result = getBlastRadius(dirs, 'nonexistent.js', 'test-project');
    assert.deepEqual(result.imports, []);
    assert.deepEqual(result.importedBy, []);
  });
});

describe('getFileFreshness', () => {
  it('returns 1.0 for file that exists and has not been modified', () => {
    const { getFileFreshness } = require('../lib/dir-loader');
    const tmpFile = path.join(TEST_DIR, 'fresh.js');
    fs.writeFileSync(tmpFile, 'module.exports = {}');
    const score = getFileFreshness(tmpFile, Date.now() + 100000);
    assert.equal(score, 1.0);
    fs.unlinkSync(tmpFile);
  });

  it('returns 0.7 for file that exists but was modified after chunk time', () => {
    const { getFileFreshness } = require('../lib/dir-loader');
    const tmpFile = path.join(TEST_DIR, 'modified.js');
    fs.writeFileSync(tmpFile, 'module.exports = {}');
    const score = getFileFreshness(tmpFile, Date.now() - 100000);
    assert.equal(score, 0.7);
    fs.unlinkSync(tmpFile);
  });

  it('returns 0.2 for file that does not exist', () => {
    const { getFileFreshness } = require('../lib/dir-loader');
    const score = getFileFreshness('/tmp/definitely-not-a-real-file.js', Date.now());
    assert.equal(score, 0.2);
  });
});

describe('computeTemporalProximity', () => {
  it('returns 1.0 for same-day chunk', () => {
    const { computeTemporalProximity } = require('../lib/dir-loader');
    const now = Date.now();
    const score = computeTemporalProximity(now, now);
    assert.equal(score, 1.0);
  });

  it('decays with distance from anchor', () => {
    const { computeTemporalProximity } = require('../lib/dir-loader');
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    const score = computeTemporalProximity(thirtyDaysAgo, now);
    assert.ok(score > 0.3);
    assert.ok(score < 0.5);
  });

  it('decays symmetrically in both directions', () => {
    const { computeTemporalProximity } = require('../lib/dir-loader');
    const anchor = Date.now();
    const before = anchor - 7 * 24 * 60 * 60 * 1000;
    const after = anchor + 7 * 24 * 60 * 60 * 1000;
    const scoreBefore = computeTemporalProximity(before, anchor);
    const scoreAfter = computeTemporalProximity(after, anchor);
    assert.equal(scoreBefore, scoreAfter);
  });

  it('defaults anchor to now when not provided', () => {
    const { computeTemporalProximity } = require('../lib/dir-loader');
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const score = computeTemporalProximity(sevenDaysAgo);
    assert.ok(score > 0.5);
    assert.ok(score < 0.9);
  });
});
