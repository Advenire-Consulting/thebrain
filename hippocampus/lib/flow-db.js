'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

const DEFAULT_DB_PATH = path.join(os.homedir(), '.claude', 'brain', 'hippocampus', 'flow.db');

const SCHEMA = `
-- A node in the code graph (function, route, middleware, table, property, config, module, url_reference)
CREATE TABLE IF NOT EXISTS nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project TEXT NOT NULL,
    file TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    line INTEGER,
    metadata_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
);

-- A relationship between two nodes
CREATE TABLE IF NOT EXISTS edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    source_project TEXT NOT NULL,
    source_file TEXT NOT NULL,
    data_json TEXT,
    sequence INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
);

-- Optional human/AI-authored context. Ephemeral — deleted on re-scan.
CREATE TABLE IF NOT EXISTS annotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target_type TEXT NOT NULL CHECK(target_type IN ('node', 'edge')),
    target_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    author TEXT DEFAULT 'human',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
);

-- File hash tracking for incremental updates
CREATE TABLE IF NOT EXISTS file_hashes (
    project TEXT NOT NULL,
    file TEXT NOT NULL,
    hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME,
    PRIMARY KEY (project, file)
);

-- Safety net: prevent duplicate nodes. COALESCE handles NULL lines.
CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_unique ON nodes(project, file, name, type, COALESCE(line, -1));
CREATE INDEX IF NOT EXISTS idx_nodes_project_file ON nodes(project, file);
CREATE INDEX IF NOT EXISTS idx_nodes_project_type ON nodes(project, type);
CREATE INDEX IF NOT EXISTS idx_nodes_name ON nodes(name);
CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
CREATE INDEX IF NOT EXISTS idx_edges_type ON edges(type);
CREATE INDEX IF NOT EXISTS idx_edges_source_file ON edges(source_project, source_file);
CREATE INDEX IF NOT EXISTS idx_annotations_target ON annotations(target_type, target_id);
`;

/**
 * SQLite database for the flow graph — nodes, edges, annotations, file hashes.
 * Write-side operations. Read-side is in flow-queries.js.
 */
class FlowDB {
  constructor(dbPath) {
    this.db = new Database(dbPath || DEFAULT_DB_PATH);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(SCHEMA);
    this._prepareStatements();
  }

  _prepareStatements() {
    this._insertNode = this.db.prepare(
      `INSERT INTO nodes (project, file, name, type, line, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    this._insertEdge = this.db.prepare(
      `INSERT INTO edges (source_id, target_id, type, source_project, source_file, data_json, sequence)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    this._getNode = this.db.prepare('SELECT * FROM nodes WHERE id = ?');
    this._resolveNode = this.db.prepare(
      'SELECT id FROM nodes WHERE project = ? AND file = ? AND name = ? AND type = ? LIMIT 1'
    );
    this._deleteNodesForFile = this.db.prepare(
      'DELETE FROM nodes WHERE project = ? AND file = ?'
    );
    this._deleteEdgesForFile = this.db.prepare(
      'DELETE FROM edges WHERE source_project = ? AND source_file = ?'
    );
    this._getFileHash = this.db.prepare(
      'SELECT hash FROM file_hashes WHERE project = ? AND file = ?'
    );
    this._upsertFileHash = this.db.prepare(
      `INSERT INTO file_hashes (project, file, hash)
       VALUES (?, ?, ?)
       ON CONFLICT(project, file) DO UPDATE SET hash = excluded.hash, updated_at = CURRENT_TIMESTAMP`
    );
    this._deleteFileHash = this.db.prepare(
      'DELETE FROM file_hashes WHERE project = ? AND file = ?'
    );
    this._cleanOrphanedAnnotations = this.db.prepare(`
      DELETE FROM annotations WHERE
        (target_type = 'node' AND target_id NOT IN (SELECT id FROM nodes)) OR
        (target_type = 'edge' AND target_id NOT IN (SELECT id FROM edges))
    `);
  }

  /** Insert a node. Returns the new row ID. */
  insertNode(project, file, name, type, line, metadata) {
    const metaJson = metadata ? JSON.stringify(metadata) : null;
    return this._insertNode.run(project, file, name, type, line || null, metaJson).lastInsertRowid;
  }

  /** Insert an edge with denormalized source location. Returns the new row ID. */
  insertEdge(sourceId, targetId, type, sourceProject, sourceFile, dataJson, sequence) {
    const data = dataJson && typeof dataJson === 'object' ? JSON.stringify(dataJson) : dataJson || null;
    return this._insertEdge.run(sourceId, targetId, type, sourceProject, sourceFile, data, sequence || null).lastInsertRowid;
  }

  /** Get a node by ID. Returns row or undefined. */
  getNode(id) {
    return this._getNode.get(id);
  }

  /** Resolve a node by {project, file, name, type}. Returns node ID or null. */
  resolveNode(project, file, name, type) {
    const row = this._resolveNode.get(project, file, name, type);
    return row ? row.id : null;
  }

  /** Delete all nodes for a file. CASCADE removes associated edges. */
  deleteNodesForFile(project, file) {
    return this._deleteNodesForFile.run(project, file);
  }

  /** Delete outbound edges from a file using denormalized columns (fast, no join). */
  deleteEdgesForFile(project, file) {
    return this._deleteEdgesForFile.run(project, file);
  }

  /** Get stored hash for a file. Returns hash string or null. */
  getFileHash(project, file) {
    const row = this._getFileHash.get(project, file);
    return row ? row.hash : null;
  }

  /** Upsert file hash for incremental scanning. */
  upsertFileHash(project, file, hash) {
    return this._upsertFileHash.run(project, file, hash);
  }

  /** Delete a file's hash entry (used when file is deleted). */
  deleteFileHash(project, file) {
    return this._deleteFileHash.run(project, file);
  }

  /** Remove annotations pointing to deleted nodes/edges. */
  cleanOrphanedAnnotations() {
    return this._cleanOrphanedAnnotations.run();
  }

  /** Run a function inside a transaction. Rolls back on error. */
  transaction(fn) {
    const tx = this.db.transaction(fn);
    return tx();
  }

  close() {
    this.db.close();
  }
}

module.exports = { FlowDB, DEFAULT_DB_PATH };
