'use strict';

const path = require('path');
const os = require('os');
const Database = require('better-sqlite3');

const BRAIN_DIR = path.join(os.homedir(), '.claude', 'brain');
const DEFAULT_DB_PATH = process.env.THEBRAIN_WORKING_MEMORY_DB || path.join(BRAIN_DIR, 'working-memory.db');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS file_heat (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project TEXT NOT NULL,
    file_path TEXT NOT NULL,
    score REAL DEFAULT 1.0,
    touch_count INTEGER DEFAULT 1,
    last_session TEXT,
    summary TEXT,
    context_note TEXT,
    last_touched_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME,
    UNIQUE(project, file_path)
);

CREATE TABLE IF NOT EXISTS clusters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project TEXT NOT NULL,
    file_paths TEXT NOT NULL,
    co_occurrence_count INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME,
    UNIQUE(project, file_paths)
);
`;

class WorkingMemoryDB {
  constructor(dbPath) {
    this.db = new Database(dbPath || DEFAULT_DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(SCHEMA);
  }

  // Insert or bump score for a file touch
  bumpFileHeat(project, filePath, weight, sessionId) {
    this.db.prepare(`
      INSERT INTO file_heat (project, file_path, score, touch_count, last_session, last_touched_at, updated_at)
      VALUES (?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(project, file_path) DO UPDATE SET
        score = score + ?,
        touch_count = touch_count + 1,
        last_session = ?,
        last_touched_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `).run(project, filePath, weight, sessionId, weight, sessionId);
  }

  // Get a single file's heat entry
  getFileHeat(project, filePath) {
    return this.db.prepare(
      'SELECT * FROM file_heat WHERE project = ? AND file_path = ?'
    ).get(project, filePath);
  }

  // Get files above score threshold, sorted by score descending
  getHotFiles(project, threshold, limit) {
    threshold = threshold || 1.0;
    limit = limit || 15;
    return this.db.prepare(
      'SELECT * FROM file_heat WHERE project = ? AND score >= ? ORDER BY score DESC LIMIT ?'
    ).all(project, threshold, limit);
  }

  // Get all files touched in a given session
  getAllFilesForSession(sessionId) {
    return this.db.prepare(
      'SELECT * FROM file_heat WHERE last_session = ?'
    ).all(sessionId);
  }

  // Update the stable summary for a file
  updateSummary(project, filePath, summary) {
    this.db.prepare(
      'UPDATE file_heat SET summary = ?, updated_at = CURRENT_TIMESTAMP WHERE project = ? AND file_path = ?'
    ).run(summary, project, filePath);
  }

  // Update the volatile context note for a file
  updateContextNote(project, filePath, contextNote) {
    this.db.prepare(
      'UPDATE file_heat SET context_note = ?, updated_at = CURRENT_TIMESTAMP WHERE project = ? AND file_path = ?'
    ).run(contextNote, project, filePath);
  }

  // Decay all scores by a factor (e.g., 0.8)
  decayAllScores(factor) {
    this.db.prepare(
      'UPDATE file_heat SET score = score * ?, updated_at = CURRENT_TIMESTAMP'
    ).run(factor);
  }

  // Get list of projects that have files above threshold
  getActiveProjects(threshold) {
    threshold = threshold || 1.0;
    return this.db.prepare(
      'SELECT DISTINCT project FROM file_heat WHERE score >= ? ORDER BY project'
    ).all(threshold).map(r => r.project);
  }

  // Insert or increment a cluster (file_paths always sorted before insert)
  upsertCluster(project, filePaths) {
    const sorted = JSON.stringify([...filePaths].sort());
    this.db.prepare(`
      INSERT INTO clusters (project, file_paths, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(project, file_paths) DO UPDATE SET
        co_occurrence_count = co_occurrence_count + 1,
        updated_at = CURRENT_TIMESTAMP
    `).run(project, sorted);
  }

  // Get clusters for a project, sorted by co_occurrence_count descending
  getClusters(project, limit) {
    limit = limit || 3;
    return this.db.prepare(
      'SELECT * FROM clusters WHERE project = ? ORDER BY co_occurrence_count DESC LIMIT ?'
    ).all(project, limit);
  }

  close() {
    this.db.close();
  }
}

module.exports = { WorkingMemoryDB, SCHEMA, DEFAULT_DB_PATH };
