'use strict';

const path = require('path');
const fs = require('fs');

const Database = require('better-sqlite3');

const os = require('os');
const DEFAULT_DB_PATH = path.join(os.homedir(), '.claude', 'brain', 'hippocampus', 'terms.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project TEXT NOT NULL,
    path TEXT NOT NULL,
    abs_path TEXT NOT NULL,
    size INTEGER,
    mtime REAL,
    hash TEXT,
    scanned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(project, path)
);

CREATE TABLE IF NOT EXISTS terms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    term TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE IF NOT EXISTS occurrences (
    term_id INTEGER NOT NULL,
    file_id INTEGER NOT NULL,
    line INTEGER NOT NULL,
    PRIMARY KEY (term_id, file_id, line),
    FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE CASCADE,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS definitions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    line INTEGER NOT NULL,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_terms_term ON terms(term);
CREATE INDEX IF NOT EXISTS idx_occurrences_term ON occurrences(term_id);
CREATE INDEX IF NOT EXISTS idx_occurrences_file ON occurrences(file_id);
CREATE INDEX IF NOT EXISTS idx_definitions_file ON definitions(file_id);
CREATE INDEX IF NOT EXISTS idx_definitions_name ON definitions(name);
CREATE INDEX IF NOT EXISTS idx_files_project ON files(project);
`;

class TermDB {
  constructor(dbPath) {
    const resolved = dbPath || DEFAULT_DB_PATH;
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    this.db = new Database(resolved);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(SCHEMA);
    this._prepareStatements();
  }

  _prepareStatements() {
    this._upsertFile = this.db.prepare(`
      INSERT INTO files (project, path, abs_path, size, mtime, hash, scanned_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(project, path) DO UPDATE SET
        abs_path = excluded.abs_path,
        size = excluded.size,
        mtime = excluded.mtime,
        hash = excluded.hash,
        scanned_at = datetime('now')
      RETURNING id
    `);

    this._getFileMeta = this.db.prepare(
      'SELECT id, size, mtime, hash FROM files WHERE project = ? AND path = ?'
    );

    this._deleteOccurrences = this.db.prepare('DELETE FROM occurrences WHERE file_id = ?');
    this._deleteDefinitions = this.db.prepare('DELETE FROM definitions WHERE file_id = ?');
    this._deleteFile = this.db.prepare('DELETE FROM files WHERE id = ?');

    this._getOrCreateTerm = this.db.prepare(`
      INSERT INTO terms (term) VALUES (?)
      ON CONFLICT(term) DO UPDATE SET term = term
      RETURNING id
    `);

    this._insertOccurrence = this.db.prepare(
      'INSERT OR IGNORE INTO occurrences (term_id, file_id, line) VALUES (?, ?, ?)'
    );

    this._insertDefinition = this.db.prepare(
      'INSERT INTO definitions (file_id, name, type, line) VALUES (?, ?, ?, ?)'
    );

    this._findTerm = this.db.prepare(`
      SELECT f.project, f.path, o.line
      FROM occurrences o
      JOIN terms t ON o.term_id = t.id
      JOIN files f ON o.file_id = f.id
      WHERE t.term = ?
      ORDER BY f.project, f.path, o.line
    `);

    this._findTermByProject = this.db.prepare(`
      SELECT f.project, f.path, o.line
      FROM occurrences o
      JOIN terms t ON o.term_id = t.id
      JOIN files f ON o.file_id = f.id
      WHERE t.term = ? AND f.project = ?
      ORDER BY f.path, o.line
    `);

    this._getDefinitions = this.db.prepare(
      'SELECT name, type, line FROM definitions WHERE file_id = ? ORDER BY line'
    );

    this._getStructure = this.db.prepare(`
      SELECT d.name, d.type, d.line
      FROM definitions d
      JOIN files f ON d.file_id = f.id
      WHERE f.project = ? AND f.path = ?
      ORDER BY d.line
    `);

    this._getProjectFiles = this.db.prepare(
      'SELECT id, project, path, size, mtime, hash FROM files WHERE project = ?'
    );

    this._getAllFiles = this.db.prepare('SELECT id, project, path, abs_path FROM files');
  }

  upsertFile(project, filePath, absPath, meta) {
    return this._upsertFile.get(project, filePath, absPath, meta.size, meta.mtime, meta.hash).id;
  }

  getFileMeta(project, filePath) {
    const row = this._getFileMeta.get(project, filePath);
    return row ? { id: row.id, size: row.size, mtime: row.mtime, hash: row.hash } : null;
  }

  replaceOccurrences(fileId, entries) {
    const run = this.db.transaction(() => {
      this._deleteOccurrences.run(fileId);
      for (const entry of entries) {
        const termRow = this._getOrCreateTerm.get(entry.term);
        this._insertOccurrence.run(termRow.id, fileId, entry.line);
      }
    });
    run();
  }

  replaceDefinitions(fileId, entries) {
    const run = this.db.transaction(() => {
      this._deleteDefinitions.run(fileId);
      for (const entry of entries) {
        this._insertDefinition.run(fileId, entry.name, entry.type, entry.line);
      }
    });
    run();
  }

  findTerm(term, project) {
    if (project) return this._findTermByProject.all(term, project);
    return this._findTerm.all(term);
  }

  getDefinitions(fileId) {
    return this._getDefinitions.all(fileId);
  }

  getStructure(project, filePath) {
    return this._getStructure.all(project, filePath);
  }

  getProjectFiles(project) {
    return this._getProjectFiles.all(project);
  }

  getAllFiles() {
    return this._getAllFiles.all();
  }

  removeFile(fileId) {
    this._deleteFile.run(fileId);
  }

  updateMtime(project, filePath, mtime) {
    this.db.prepare('UPDATE files SET mtime = ? WHERE project = ? AND path = ?').run(mtime, project, filePath);
  }

  close() {
    this.db.close();
  }
}

module.exports = { TermDB, DEFAULT_DB_PATH };
