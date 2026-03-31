'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { findOrphans, checkDependencies } = require('../lib/audit');

describe('findOrphans', () => {
  it('returns empty for empty DIR and file list', () => {
    const dirData = { files: {} };
    const result = findOrphans(dirData, []);
    assert.deepStrictEqual(result.orphans, []);
  });

  it('does not flag a file that appears in another file imports', () => {
    const dirData = {
      files: {
        'lib/db.js': { imports: ['./utils'], exports: ['DB'] },
        'lib/utils.js': { exports: ['helper'] },
      }
    };
    const allFiles = ['lib/db.js', 'lib/utils.js'];
    const result = findOrphans(dirData, allFiles);
    // utils.js is imported by db.js, so it should not be orphaned
    const orphanFiles = result.orphans.map(o => o.file);
    assert.ok(!orphanFiles.includes('lib/utils.js'));
    // db.js has no importers, so it IS orphaned
    assert.ok(orphanFiles.includes('lib/db.js'));
  });

  it('flags a file with zero inbound imports', () => {
    const dirData = {
      files: {
        'lib/db.js': { imports: ['./utils'], exports: ['DB'] },
        'lib/utils.js': { imports: ['./db'], exports: ['helper'] },
      }
    };
    // db and utils import each other — orphan.js has no importers
    const allFiles = ['lib/db.js', 'lib/utils.js', 'lib/orphan.js'];
    const result = findOrphans(dirData, allFiles);
    assert.strictEqual(result.orphans.length, 1);
    assert.strictEqual(result.orphans[0].file, 'lib/orphan.js');
  });

  it('includes exports from DIR when available', () => {
    const dirData = {
      files: {
        'lib/orphan.js': { exports: ['deadFunc', 'deadConst'] },
      }
    };
    const allFiles = ['lib/orphan.js'];
    const result = findOrphans(dirData, allFiles);
    assert.deepStrictEqual(result.orphans[0].exports, ['deadFunc', 'deadConst']);
  });

  it('returns null exports when file is not in DIR', () => {
    const dirData = { files: {} };
    const allFiles = ['lib/orphan.js'];
    const result = findOrphans(dirData, allFiles);
    assert.strictEqual(result.orphans[0].exports, null);
  });

  it('excludes files in test/ directories', () => {
    const dirData = { files: {} };
    const allFiles = ['test/foo.test.js', 'lib/test/bar.test.js'];
    const result = findOrphans(dirData, allFiles);
    assert.deepStrictEqual(result.orphans, []);
  });

  it('excludes files in scripts/ directories', () => {
    const dirData = { files: {} };
    const allFiles = ['scripts/cli.js', 'cerebral-cortex-v2/scripts/scan.js'];
    const result = findOrphans(dirData, allFiles);
    assert.deepStrictEqual(result.orphans, []);
  });

  it('excludes files in hooks/ directories', () => {
    const dirData = { files: {} };
    const allFiles = ['hooks/session-start.js', 'dlpfc/hooks/read-hook.js'];
    const result = findOrphans(dirData, allFiles);
    assert.deepStrictEqual(result.orphans, []);
  });

  it('excludes files in public/ directories', () => {
    const dirData = { files: {} };
    const allFiles = ['public/assets/js/app.js', 'tools/crm/public/module.js'];
    const result = findOrphans(dirData, allFiles);
    assert.deepStrictEqual(result.orphans, []);
  });

  it('excludes files in extractors/ directories', () => {
    const dirData = { files: {} };
    const allFiles = ['extractors/python.js', 'hippocampus/extractors/go.js'];
    const result = findOrphans(dirData, allFiles);
    assert.deepStrictEqual(result.orphans, []);
  });

  it('excludes files in migrations/ directories', () => {
    const dirData = { files: {} };
    const allFiles = ['database/migrations/001-init.js'];
    const result = findOrphans(dirData, allFiles);
    assert.deepStrictEqual(result.orphans, []);
  });

  it('resolves imports with ../ traversal', () => {
    const dirData = {
      files: {
        'routes/api.js': { imports: ['../lib/db'], exports: ['router'] },
        'lib/db.js': { exports: ['query'] },
      }
    };
    const allFiles = ['routes/api.js', 'lib/db.js'];
    const result = findOrphans(dirData, allFiles);
    // lib/db.js is imported via ../lib/db — should not be orphaned
    const orphanFiles = result.orphans.map(o => o.file);
    assert.ok(!orphanFiles.includes('lib/db.js'));
  });

  it('resolves imports without .js extension', () => {
    const dirData = {
      files: {
        'server.js': { imports: ['./lib/db'], exports: ['app'] },
        'lib/db.js': { exports: ['query'] },
      }
    };
    const allFiles = ['server.js', 'lib/db.js'];
    const result = findOrphans(dirData, allFiles);
    // lib/db.js is imported as ./lib/db (no .js) — should resolve and not be orphaned
    const orphanFiles = result.orphans.map(o => o.file);
    assert.ok(!orphanFiles.includes('lib/db.js'));
  });

  it('discards imports that resolve outside project root', () => {
    const dirData = {
      files: {
        'lib/util.js': { imports: ['../../_shared/server-utils'], exports: ['util'] },
      }
    };
    // Both files have no valid inbound imports — both are orphans
    const allFiles = ['lib/util.js', 'lib/orphan.js'];
    const result = findOrphans(dirData, allFiles);
    assert.strictEqual(result.orphans.length, 2);
    const orphanFiles = result.orphans.map(o => o.file);
    assert.ok(orphanFiles.includes('lib/orphan.js'));
    assert.ok(orphanFiles.includes('lib/util.js'));
  });

  it('discards phantom imports that dont match any file in allFiles', () => {
    const dirData = {
      files: {
        'test/extractor.test.js': { imports: ['./database', './auth'], exports: [] },
      }
    };
    const allFiles = ['test/extractor.test.js', 'lib/real.js'];
    const result = findOrphans(dirData, allFiles);
    assert.strictEqual(result.orphans.length, 1);
    assert.strictEqual(result.orphans[0].file, 'lib/real.js');
  });

  it('handles DIR entries with no imports key', () => {
    const dirData = {
      files: {
        'lib/config.js': { exports: ['BRAIN_DIR'] },
        // another entry WITH imports so it's not detected as a library project
        'lib/app.js': { imports: ['./config'], exports: ['start'] },
      }
    };
    // config.js is imported by app.js (not orphaned)
    // app.js and orphan.js have no importers — both orphaned
    // Key assertion: no crash on missing imports key
    const allFiles = ['lib/config.js', 'lib/app.js', 'lib/orphan.js'];
    const result = findOrphans(dirData, allFiles);
    assert.strictEqual(result.library, false);
    const orphanFiles = result.orphans.map(o => o.file);
    assert.ok(!orphanFiles.includes('lib/config.js'), 'config.js imported by app.js');
    assert.ok(orphanFiles.includes('lib/orphan.js'), 'orphan.js has no importers');
  });

  it('accepts custom entryPatterns', () => {
    // DIR with imports so library detection doesn't trigger
    const dirData = { files: { 'lib/a.js': { imports: ['./b'] }, 'lib/b.js': {} } };
    const allFiles = ['lib/a.js', 'lib/b.js', 'workers/task.js', 'lib/orphan.js'];
    const result = findOrphans(dirData, allFiles, { entryPatterns: ['workers/'] });
    const orphanFiles = result.orphans.map(o => o.file);
    assert.ok(!orphanFiles.includes('workers/task.js'));
    assert.ok(orphanFiles.includes('lib/orphan.js'));
  });

  it('excludes files in _archived/ directories', () => {
    const dirData = { files: { 'lib/a.js': { imports: ['./b'] }, 'lib/b.js': {} } };
    const allFiles = ['lib/a.js', 'lib/b.js', 'tool-library/_archived/room-calendar/stuff.js', 'lib/orphan.js'];
    const result = findOrphans(dirData, allFiles);
    const orphanFiles = result.orphans.map(o => o.file);
    assert.ok(!orphanFiles.includes('tool-library/_archived/room-calendar/stuff.js'));
    assert.ok(orphanFiles.includes('lib/orphan.js'));
  });

  it('excludes routes.js and public-routes.js by filename', () => {
    const dirData = { files: { 'lib/a.js': { imports: ['./b'] }, 'lib/b.js': {} } };
    const allFiles = ['lib/a.js', 'lib/b.js', 'tools/crm/routes.js', 'tools/booking/public-routes.js', 'lib/orphan.js'];
    const result = findOrphans(dirData, allFiles);
    const orphanFiles = result.orphans.map(o => o.file);
    assert.ok(!orphanFiles.includes('tools/crm/routes.js'));
    assert.ok(!orphanFiles.includes('tools/booking/public-routes.js'));
    assert.ok(orphanFiles.includes('lib/orphan.js'));
  });

  it('excludes server.js and index.js by filename', () => {
    const dirData = { files: { 'lib/a.js': { imports: ['./b'] }, 'lib/b.js': {} } };
    const allFiles = ['lib/a.js', 'lib/b.js', 'server/index.js', 'app/server.js', 'lib/orphan.js'];
    const result = findOrphans(dirData, allFiles);
    const orphanFiles = result.orphans.map(o => o.file);
    assert.ok(!orphanFiles.includes('server/index.js'));
    assert.ok(!orphanFiles.includes('app/server.js'));
    assert.ok(orphanFiles.includes('lib/orphan.js'));
  });

  it('excludes ecosystem.config files by filename', () => {
    const dirData = { files: { 'lib/a.js': { imports: ['./b'] }, 'lib/b.js': {} } };
    const allFiles = ['lib/a.js', 'lib/b.js', 'ecosystem.config.js', 'ecosystem.config.cjs', 'lib/orphan.js'];
    const result = findOrphans(dirData, allFiles);
    const orphanFiles = result.orphans.map(o => o.file);
    assert.ok(!orphanFiles.includes('ecosystem.config.js'));
    assert.ok(!orphanFiles.includes('ecosystem.config.cjs'));
    assert.ok(orphanFiles.includes('lib/orphan.js'));
  });

  it('detects library projects with no internal imports', () => {
    const dirData = {
      files: {
        'auth.js': { exports: ['login'] },
        'utils.js': { exports: ['escapeHtml'] },
      }
    };
    const allFiles = ['auth.js', 'utils.js', 'db.js'];
    const result = findOrphans(dirData, allFiles);
    assert.strictEqual(result.library, true);
    assert.deepStrictEqual(result.orphans, []);
  });

  it('does not flag as library when internal imports exist', () => {
    const dirData = {
      files: {
        'app.js': { imports: ['./db'], exports: ['app'] },
        'db.js': { exports: ['query'] },
      }
    };
    // app.js imports db.js — internal imports exist, not a library
    // app.js has no importers, lib/orphan.js has no importers
    const allFiles = ['app.js', 'db.js', 'lib/orphan.js'];
    const result = findOrphans(dirData, allFiles);
    assert.strictEqual(result.library, false);
    assert.strictEqual(result.orphans.length, 2);
  });
});

describe('checkDependencies', () => {
  it('returns clean when all imports are declared', () => {
    const dirData = {
      files: {
        'server.js': { npmImports: ['express'], exports: ['app'] },
      }
    };
    const packageJson = { dependencies: { express: '^4.0.0' } };
    const result = checkDependencies(dirData, packageJson);
    assert.deepStrictEqual(result.undeclared, []);
    assert.deepStrictEqual(result.unused, []);
    assert.strictEqual(result.stale, false);
  });

  it('flags undeclared npm import with file location', () => {
    const dirData = {
      files: {
        'server.js': { npmImports: ['express', 'cors'], exports: ['app'] },
      }
    };
    const packageJson = { dependencies: { express: '^4.0.0' } };
    const result = checkDependencies(dirData, packageJson);
    assert.strictEqual(result.undeclared.length, 1);
    assert.strictEqual(result.undeclared[0].pkg, 'cors');
    assert.deepStrictEqual(result.undeclared[0].files, ['server.js']);
  });

  it('flags unused package.json entry', () => {
    const dirData = {
      files: {
        'server.js': { npmImports: ['express'], exports: ['app'] },
      }
    };
    const packageJson = { dependencies: { express: '^4.0.0', lodash: '^4.0.0' } };
    const result = checkDependencies(dirData, packageJson);
    assert.deepStrictEqual(result.unused, ['lodash']);
  });

  it('excludes Node builtins from undeclared', () => {
    const dirData = {
      files: {
        // These would normally be filtered at extraction time — testing defense-in-depth
        'server.js': { npmImports: ['fs', 'path', 'node:test', 'node:assert/strict'], exports: [] },
      }
    };
    const packageJson = { dependencies: {} };
    const result = checkDependencies(dirData, packageJson);
    assert.deepStrictEqual(result.undeclared, []);
  });

  it('handles missing devDependencies gracefully', () => {
    const dirData = {
      files: {
        'server.js': { npmImports: ['express'], exports: ['app'] },
      }
    };
    const packageJson = { dependencies: { express: '^4.0.0' } };
    const result = checkDependencies(dirData, packageJson);
    assert.deepStrictEqual(result.undeclared, []);
  });

  it('checks devDependencies too', () => {
    const dirData = {
      files: {
        'server.js': { npmImports: ['express'], exports: ['app'] },
      }
    };
    const packageJson = {
      dependencies: {},
      devDependencies: { express: '^4.0.0' }
    };
    const result = checkDependencies(dirData, packageJson);
    assert.deepStrictEqual(result.undeclared, []);
  });

  it('returns stale=true when any entry lacks npmImports', () => {
    const dirData = {
      files: {
        'server.js': { exports: ['app'] },
      }
    };
    const packageJson = { dependencies: {} };
    const result = checkDependencies(dirData, packageJson);
    assert.strictEqual(result.stale, true);
  });

  it('handles scoped packages', () => {
    const dirData = {
      files: {
        'server.js': { npmImports: ['@anthropic-ai/sdk'], exports: [] },
      }
    };
    const packageJson = { dependencies: { '@anthropic-ai/sdk': '^1.0.0' } };
    const result = checkDependencies(dirData, packageJson);
    assert.deepStrictEqual(result.undeclared, []);
    assert.deepStrictEqual(result.unused, []);
  });

  it('aggregates files per undeclared package', () => {
    const dirData = {
      files: {
        'server.js': { npmImports: ['cors'], exports: ['app'] },
        'routes/api.js': { npmImports: ['cors'], exports: ['router'] },
      }
    };
    const packageJson = { dependencies: {} };
    const result = checkDependencies(dirData, packageJson);
    assert.strictEqual(result.undeclared.length, 1);
    assert.strictEqual(result.undeclared[0].pkg, 'cors');
    assert.deepStrictEqual(result.undeclared[0].files, ['routes/api.js', 'server.js']);
  });
});
