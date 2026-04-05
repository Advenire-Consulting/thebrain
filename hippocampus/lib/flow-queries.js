'use strict';

/**
 * Read-side operations for the flow graph.
 * Provides trace (follow a value) and fileFlow (everything in/out of a file).
 */
class FlowQueries {
  constructor(db) {
    this.db = db;
    this._prepareStatements();
  }

  _prepareStatements() {
    // Find nodes by name, optionally filtered by project
    this._findByName = this.db.prepare(
      'SELECT * FROM nodes WHERE name = ? AND project = ?'
    );
    this._findByNameAny = this.db.prepare(
      'SELECT * FROM nodes WHERE name = ?'
    );

    // All nodes in a file, ordered by line
    this._nodesInFile = this.db.prepare(
      'SELECT * FROM nodes WHERE project = ? AND file = ? ORDER BY COALESCE(line, 999999)'
    );

    // Outbound edges from a node (joins target node for context)
    this._outEdges = this.db.prepare(`
      SELECT e.*, n.name AS target_name, n.type AS target_type, n.file AS target_file, n.line AS target_line
      FROM edges e
      JOIN nodes n ON n.id = e.target_id
      WHERE e.source_id = ?
    `);

    // Inbound edges to a node (joins source node for context)
    this._inEdges = this.db.prepare(`
      SELECT e.*, n.name AS source_name, n.type AS source_type, n.file AS source_file, n.line AS source_line
      FROM edges e
      JOIN nodes n ON n.id = e.source_id
      WHERE e.target_id = ?
    `);

    // All edges originating from a file
    this._fileOutEdges = this.db.prepare(`
      SELECT e.*, n.name AS target_name, n.type AS target_type, n.file AS target_file
      FROM edges e
      JOIN nodes n ON n.id = e.target_id
      WHERE e.source_project = ? AND e.source_file = ?
    `);

    // All edges targeting nodes in a file
    this._fileInEdges = this.db.prepare(`
      SELECT e.*, sn.name AS source_name, sn.type AS source_type, sn.file AS source_file,
             tn.name AS target_name, tn.type AS target_type, tn.file AS target_file
      FROM edges e
      JOIN nodes sn ON sn.id = e.source_id
      JOIN nodes tn ON tn.id = e.target_id
      WHERE tn.project = ? AND tn.file = ?
    `);

    // Annotations for a node
    this._nodeAnnotations = this.db.prepare(
      "SELECT * FROM annotations WHERE target_type = 'node' AND target_id = ?"
    );
  }

  /**
   * Trace an identifier — where it's set, who calls it, who reads it.
   * Returns null if no matching nodes found.
   */
  trace(identifier, project) {
    const nodes = project
      ? this._findByName.all(identifier, project)
      : this._findByNameAny.all(identifier);

    if (nodes.length === 0) return null;

    const setBy = [];
    const calledBy = [];
    const readBy = [];
    const attaches = [];
    const queries = [];

    for (const node of nodes) {
      // Inbound edges — who points to this node
      const inEdges = this._inEdges.all(node.id);
      for (const e of inEdges) {
        const entry = {
          name: e.source_name,
          type: e.source_type,
          file: e.source_file,
          edgeType: e.type,
          data: e.data_json ? JSON.parse(e.data_json) : null,
        };
        if (e.type === 'attaches') setBy.push(entry);
        else if (e.type === 'calls') calledBy.push(entry);
        else if (e.type === 'reads') readBy.push(entry);
        else setBy.push(entry);
      }

      // Outbound edges — what this node reaches
      const outEdges = this._outEdges.all(node.id);
      for (const e of outEdges) {
        const entry = {
          name: e.target_name,
          type: e.target_type,
          file: e.target_file,
          edgeType: e.type,
          data: e.data_json ? JSON.parse(e.data_json) : null,
        };
        if (e.type === 'attaches') attaches.push(entry);
        else if (e.type === 'queries_table' || e.type === 'mutates_table') queries.push(entry);
        else if (e.type === 'reads') readBy.push(entry);
        else attaches.push(entry);
      }
    }

    return {
      identifier,
      nodes: nodes.map(n => ({
        name: n.name,
        type: n.type,
        file: n.file,
        line: n.line,
        metadata: n.metadata_json ? JSON.parse(n.metadata_json) : null,
      })),
      setBy,
      calledBy,
      readBy,
      attaches,
      queries,
    };
  }

  /**
   * Everything flowing in and out of a file.
   */
  fileFlow(filePath, project) {
    const nodes = this._nodesInFile.all(project, filePath);
    if (nodes.length === 0) return null;

    // Find module node for exports info
    const moduleNode = nodes.find(n => n.type === 'module');
    const exports = moduleNode && moduleNode.metadata_json
      ? JSON.parse(moduleNode.metadata_json).exports || []
      : [];

    // Outbound edges (imports, calls, queries going out)
    const outbound = this._fileOutEdges.all(project, filePath).map(e => ({
      type: e.type,
      target: e.target_name,
      targetType: e.target_type,
      targetFile: e.target_file,
      data: e.data_json ? JSON.parse(e.data_json) : null,
    }));

    // Inbound edges from other files
    const allInbound = this._fileInEdges.all(project, filePath);
    const inbound = allInbound
      .filter(e => e.source_file !== filePath) // Only cross-file edges
      .map(e => ({
        type: e.type,
        source: e.source_name,
        sourceType: e.source_type,
        sourceFile: e.source_file,
        target: e.target_name,
      }));

    // Imports: outbound requires edges
    const imports = outbound
      .filter(e => e.type === 'requires')
      .map(e => e.data ? e.data.path : e.target);

    return {
      file: filePath,
      project,
      nodes: nodes.map(n => ({
        name: n.name,
        type: n.type,
        line: n.line,
        metadata: n.metadata_json ? JSON.parse(n.metadata_json) : null,
      })),
      exports,
      imports,
      outbound: outbound.filter(e => e.type !== 'requires'),
      inbound,
    };
  }

  /** Get annotations for a node ID. */
  getAnnotations(nodeId) {
    return this._nodeAnnotations.all(nodeId);
  }
}

module.exports = { FlowQueries };
