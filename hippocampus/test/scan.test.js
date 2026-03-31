const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const TEST_DIR = path.join(__dirname, '.test-scan');
const TEST_OUTPUT = path.join(__dirname, '.test-scan-output');

before(() => {
  fs.mkdirSync(path.join(TEST_DIR, 'fake-project', 'routes'), { recursive: true });
  fs.mkdirSync(TEST_OUTPUT, { recursive: true });

  // server.js with requires
  fs.writeFileSync(path.join(TEST_DIR, 'fake-project', 'server.js'),
    `const express = require('express');\n` +
    `const { escapeHtml } = require('../../_shared/server-utils.js');\n` +
    `const routes = require('./routes/api.js');\n` +
    `const app = express();\n` +
    `module.exports = { app };\n`
  );

  // routes/api.js with requires
  fs.writeFileSync(path.join(TEST_DIR, 'fake-project', 'routes', 'api.js'),
    `const express = require('express');\n` +
    `const router = express.Router();\n` +
    `router.get('/api/items', (req, res) => res.json([]));\n` +
    `router.post('/api/items', (req, res) => res.json({ success: true }));\n` +
    `module.exports = router;\n`
  );

  // standalone leaf file (0 local connections — should be excluded)
  fs.writeFileSync(path.join(TEST_DIR, 'fake-project', 'util.js'),
    `const path = require('path');\n` +
    `module.exports = { helper: () => 'hi' };\n`
  );
});

after(() => {
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
  fs.rmSync(TEST_OUTPUT, { recursive: true, force: true });
});

describe('extractors via registry', () => {
  it('extracts require() calls from JS content', () => {
    const jsExtractor = require('../extractors/javascript');
    const content = fs.readFileSync(path.join(TEST_DIR, 'fake-project', 'server.js'), 'utf-8');
    const imports = jsExtractor.extractImports('server.js', content);
    assert.ok(imports.includes('../../_shared/server-utils.js'));
    assert.ok(imports.includes('./routes/api.js'));
  });

  it('excludes node built-in and npm modules', () => {
    const jsExtractor = require('../extractors/javascript');
    const content = fs.readFileSync(path.join(TEST_DIR, 'fake-project', 'server.js'), 'utf-8');
    const imports = jsExtractor.extractImports('server.js', content);
    assert.ok(!imports.includes('express'));
  });

  it('extracts module.exports keys', () => {
    const jsExtractor = require('../extractors/javascript');
    const content = fs.readFileSync(path.join(TEST_DIR, 'fake-project', 'server.js'), 'utf-8');
    const exports_ = jsExtractor.extractExports('server.js', content);
    assert.ok(exports_.includes('app'));
  });

  it('detects default export (module.exports = identifier)', () => {
    const jsExtractor = require('../extractors/javascript');
    const content = fs.readFileSync(path.join(TEST_DIR, 'fake-project', 'routes', 'api.js'), 'utf-8');
    const exports_ = jsExtractor.extractExports('routes/api.js', content);
    assert.ok(exports_.includes('router'));
  });

  it('extracts Express route patterns', () => {
    const jsExtractor = require('../extractors/javascript');
    const content = fs.readFileSync(path.join(TEST_DIR, 'fake-project', 'routes', 'api.js'), 'utf-8');
    const routes = jsExtractor.extractRoutes('routes/api.js', content);
    assert.ok(routes.some(r => r.includes('GET /api/items')));
    assert.ok(routes.some(r => r.includes('POST /api/items')));
  });
});

describe('scanProject', () => {
  it('produces a valid DIR structure', () => {
    const { scanProject } = require('../scripts/scan');
    const dir = scanProject(path.join(TEST_DIR, 'fake-project'), 'fake-project', 'fake-project/');
    assert.equal(dir.name, 'fake-project');
    assert.equal(dir.root, 'fake-project/');
    assert.ok(dir.generated_at);
    assert.ok(dir.files['server.js']);
    assert.ok(dir.files['server.js'].imports.length > 0);
  });

  it('excludes leaf files with fewer than 2 connections', () => {
    const { scanProject } = require('../scripts/scan');
    const dir = scanProject(path.join(TEST_DIR, 'fake-project'), 'fake-project', 'fake-project/');
    assert.ok(!dir.files['util.js']);
  });

  it('preserves existing aliases on re-scan', () => {
    const { scanProject } = require('../scripts/scan');
    const existing = {
      name: 'fake-project', root: 'fake-project/',
      aliases: { 'the fake tool': 'fake-project/server.js' },
      files: {}, schemas: {}, references: {},
    };
    fs.writeFileSync(path.join(TEST_OUTPUT, 'fake-project.dir.json'), JSON.stringify(existing));

    const dir = scanProject(path.join(TEST_DIR, 'fake-project'), 'fake-project', 'fake-project/', TEST_OUTPUT);
    assert.equal(dir.aliases['the fake tool'], 'fake-project/server.js');
    assert.ok(Object.keys(dir.files).length > 0);
  });
});

describe('sensitivity annotation', () => {
  const SENS_DIR = path.join(__dirname, '.test-sensitivity');

  before(() => {
    fs.mkdirSync(path.join(SENS_DIR, 'sens-project'), { recursive: true });

    // db-handler.js references a .db file
    fs.writeFileSync(path.join(SENS_DIR, 'sens-project', 'db-handler.js'),
      `const Database = require('better-sqlite3');\n` +
      `const db = new Database('data/app.db');\n` +
      `module.exports = { db };\n`
    );

    // server.js imports db-handler
    fs.writeFileSync(path.join(SENS_DIR, 'sens-project', 'server.js'),
      `const { db } = require('./db-handler.js');\n` +
      `const routes = require('./routes.js');\n` +
      `module.exports = { start: () => {} };\n`
    );

    // routes.js also imports db-handler (gives db-handler 2 inbound connections)
    fs.writeFileSync(path.join(SENS_DIR, 'sens-project', 'routes.js'),
      `const { db } = require('./db-handler.js');\n` +
      `module.exports = { list: () => db.prepare('SELECT 1').all() };\n`
    );
  });

  after(() => {
    fs.rmSync(SENS_DIR, { recursive: true, force: true });
  });

  it('adds sensitivity: data to files with db references', () => {
    const { scanProject } = require('../scripts/scan');
    const dir = scanProject(path.join(SENS_DIR, 'sens-project'), 'sens-project', 'sens-project/');
    const dbEntry = dir.files['db-handler.js'];
    assert.ok(dbEntry, 'db-handler.js should be in files map');
    assert.equal(dbEntry.sensitivity, 'data');
  });

  it('does not add sensitivity to files without db references', () => {
    const { scanProject } = require('../scripts/scan');
    const dir = scanProject(path.join(SENS_DIR, 'sens-project'), 'sens-project', 'sens-project/');
    const serverEntry = dir.files['server.js'];
    assert.ok(serverEntry, 'server.js should be in files map');
    assert.equal(serverEntry.sensitivity, undefined);
  });
});

describe('npmImports in DIR entries', () => {
  const NPM_DIR = path.join(__dirname, '.test-npm-imports');

  before(() => {
    fs.mkdirSync(NPM_DIR, { recursive: true });

    // pkg-user.js requires an npm package and a local file
    fs.writeFileSync(path.join(NPM_DIR, 'pkg-user.js'),
      `const express = require('express');\nconst db = require('./db');\nmodule.exports = { app: express() };\n`
    );
    // db.js imports pkg-user (gives both files 2+ connections)
    fs.writeFileSync(path.join(NPM_DIR, 'db.js'),
      `const helper = require('./pkg-user');\nmodule.exports = { db: true };\n`
    );
  });

  after(() => {
    fs.rmSync(NPM_DIR, { recursive: true, force: true });
  });

  it('captures npmImports in DIR entry', () => {
    const { scanProject } = require('../scripts/scan');
    const dir = scanProject(NPM_DIR, 'npm-test', 'npm-test/', TEST_OUTPUT);

    const entry = dir.files['pkg-user.js'];
    assert.ok(entry, 'pkg-user.js should be in DIR (2 connections)');
    assert.ok(Array.isArray(entry.npmImports), 'should have npmImports array');
    assert.ok(entry.npmImports.includes('express'), 'should include express');
  });

  it('does not include local imports in npmImports', () => {
    const { scanProject } = require('../scripts/scan');
    const dir = scanProject(NPM_DIR, 'npm-test', 'npm-test/', TEST_OUTPUT);

    const entry = dir.files['pkg-user.js'];
    assert.ok(!entry.npmImports.includes('./db'), 'should not include local imports');
  });
});

describe('buildReferences', () => {
  it('identifies outbound references to _shared/', () => {
    const { scanProject } = require('../scripts/scan');
    const dir = scanProject(path.join(TEST_DIR, 'fake-project'), 'fake-project', 'fake-project/');
    assert.ok(dir.references.outbound.some(r => r.includes('_shared/')));
  });
});
