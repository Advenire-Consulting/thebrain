'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');
const { migrate } = require('../lib/migrator');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'migrator-'));
}

describe('migrator', () => {
  it('creates meta table and applies migrations from version 0', () => {
    const dir = tmpDir();
    const migrationsDir = path.join(dir, 'migrations');
    fs.mkdirSync(migrationsDir);

    fs.writeFileSync(path.join(migrationsDir, '001-create-items.sql'),
      'CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT);');
    fs.writeFileSync(path.join(migrationsDir, '002-add-status.sql'),
      "ALTER TABLE items ADD COLUMN status TEXT DEFAULT 'active';");

    const db = new Database(':memory:');
    const result = migrate(db, migrationsDir, { quiet: true });

    assert.deepStrictEqual(result.applied, ['001-create-items.sql', '002-add-status.sql']);
    assert.equal(result.fromVersion, 0);
    assert.equal(result.toVersion, 2);

    const cols = db.prepare("PRAGMA table_info('items')").all().map(c => c.name);
    assert.ok(cols.includes('id'));
    assert.ok(cols.includes('name'));
    assert.ok(cols.includes('status'));

    const version = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
    assert.equal(version.value, '2');

    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('skips already-applied migrations', () => {
    const dir = tmpDir();
    const migrationsDir = path.join(dir, 'migrations');
    fs.mkdirSync(migrationsDir);

    fs.writeFileSync(path.join(migrationsDir, '001-create.sql'),
      'CREATE TABLE things (id INTEGER PRIMARY KEY);');
    fs.writeFileSync(path.join(migrationsDir, '002-extend.sql'),
      'ALTER TABLE things ADD COLUMN label TEXT;');

    const db = new Database(':memory:');
    const r1 = migrate(db, migrationsDir, { quiet: true });
    assert.equal(r1.applied.length, 2);

    const r2 = migrate(db, migrationsDir, { quiet: true });
    assert.equal(r2.applied.length, 0);
    assert.equal(r2.fromVersion, 2);
    assert.equal(r2.toVersion, 2);

    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('applies only new migrations when version is ahead', () => {
    const dir = tmpDir();
    const migrationsDir = path.join(dir, 'migrations');
    fs.mkdirSync(migrationsDir);

    fs.writeFileSync(path.join(migrationsDir, '001-create.sql'),
      'CREATE TABLE data (id INTEGER PRIMARY KEY);');

    const db = new Database(':memory:');
    migrate(db, migrationsDir, { quiet: true });

    fs.writeFileSync(path.join(migrationsDir, '002-extend.sql'),
      'ALTER TABLE data ADD COLUMN value TEXT;');

    const result = migrate(db, migrationsDir, { quiet: true });
    assert.deepStrictEqual(result.applied, ['002-extend.sql']);
    assert.equal(result.fromVersion, 1);
    assert.equal(result.toVersion, 2);

    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('rolls back on failed migration', () => {
    const dir = tmpDir();
    const migrationsDir = path.join(dir, 'migrations');
    fs.mkdirSync(migrationsDir);

    fs.writeFileSync(path.join(migrationsDir, '001-good.sql'),
      'CREATE TABLE valid (id INTEGER PRIMARY KEY);');
    fs.writeFileSync(path.join(migrationsDir, '002-bad.sql'),
      'THIS IS NOT VALID SQL;');

    const db = new Database(':memory:');
    assert.throws(() => migrate(db, migrationsDir, { quiet: true }));

    const version = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
    assert.equal(version.value, '1');

    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('handles missing migrations directory', () => {
    const db = new Database(':memory:');
    const result = migrate(db, '/nonexistent/path', { quiet: true });
    assert.equal(result.applied.length, 0);
    db.close();
  });

  it('handles existing database with pre-set schema_version', () => {
    const dir = tmpDir();
    const migrationsDir = path.join(dir, 'migrations');
    fs.mkdirSync(migrationsDir);

    fs.writeFileSync(path.join(migrationsDir, '001-initial.sql'),
      'CREATE TABLE IF NOT EXISTS items (id INTEGER PRIMARY KEY);');
    fs.writeFileSync(path.join(migrationsDir, '002-new.sql'),
      'ALTER TABLE items ADD COLUMN name TEXT;');

    const db = new Database(':memory:');
    db.exec('CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)');
    db.exec("INSERT INTO meta (key, value) VALUES ('schema_version', '1')");
    db.exec('CREATE TABLE items (id INTEGER PRIMARY KEY)');

    const result = migrate(db, migrationsDir, { quiet: true });
    assert.deepStrictEqual(result.applied, ['002-new.sql']);
    assert.equal(result.fromVersion, 1);
    assert.equal(result.toVersion, 2);

    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
