'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Run pending migrations against a better-sqlite3 database.
 *
 * Migration files are numbered SQL files: 001-name.sql, 002-name.sql, etc.
 * The database tracks its current version in a `meta` table (key: 'schema_version').
 * Each migration runs inside a transaction; version is bumped after success.
 *
 * @param {object} db - An open better-sqlite3 instance
 * @param {string} migrationsDir - Directory containing numbered .sql files
 * @param {object} [opts] - Options
 * @param {boolean} [opts.quiet] - Suppress console output
 * @returns {{ applied: string[], fromVersion: number, toVersion: number }}
 */
function migrate(db, migrationsDir, opts) {
  const quiet = opts && opts.quiet;

  // Ensure meta table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
  const currentVersion = row ? parseInt(row.value, 10) : 0;

  // Collect and sort migration files
  let files;
  try {
    files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql') || f.endsWith('.js'));
  } catch {
    return { applied: [], fromVersion: currentVersion, toVersion: currentVersion };
  }

  const migrations = files
    .map(f => {
      const match = f.match(/^(\d+)-/);
      return match ? { file: f, version: parseInt(match[1], 10) } : null;
    })
    .filter(m => m && m.version > currentVersion)
    .sort((a, b) => a.version - b.version);

  if (migrations.length === 0) {
    // Detect potential downgrade — DB schema is newer than available migrations
    const maxAvailableVersion = files.reduce((max, f) => {
      const match = f.match(/^(\d+)-/);
      return match ? Math.max(max, parseInt(match[1], 10)) : max;
    }, 0);
    if (currentVersion > maxAvailableVersion && !quiet) {
      console.warn(`[migrator] Database schema version (${currentVersion}) is newer than code (${maxAvailableVersion}). Possible downgrade.`);
    }
    return { applied: [], fromVersion: currentVersion, toVersion: currentVersion };
  }

  const applied = [];

  for (const m of migrations) {
    const filePath = path.join(migrationsDir, m.file);

    try {
      if (m.file.endsWith('.js')) {
        // JS migration — exports a function that receives the db handle
        const migrateFn = require(filePath);
        migrateFn(db);
      } else {
        // SQL migration — execute in a transaction
        const sql = fs.readFileSync(filePath, 'utf-8');
        db.transaction(() => { db.exec(sql); })();
      }

      db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)").run(String(m.version));
      applied.push(m.file);
      if (!quiet) console.log(`  Migration ${m.file} applied`);
    } catch (err) {
      if (!quiet) console.error(`  Migration ${m.file} FAILED: ${err.message}`);
      throw err;
    }
  }

  const finalVersion = migrations[migrations.length - 1].version;
  return { applied, fromVersion: currentVersion, toVersion: finalVersion };
}

module.exports = { migrate };
