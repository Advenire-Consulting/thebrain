'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { FlowDB } = require('../lib/flow-db');
const { loadFlowExtractors } = require('../lib/flow-extractor-registry');
const { collectCodeFiles } = require('../lib/file-collector');

const FLOW_EXTRACTORS_DIR = path.join(__dirname, '..', 'flow-extractors');
const WEBSITES_DIR = path.resolve(__dirname, '../../..');

// Project roster — matches term-scan-cli.js plus runtime and brain
const PROJECTS = [
  { dir: 'advenire.consulting', name: 'advenire-portal' },
  { dir: 'michaelortegon.com', name: 'michaelortegon' },
  { dir: 'sonderos.org', name: 'sonderos' },
  { dir: 'sondercontrols', name: 'sondercontrols' },
  { dir: 'signal-assistant', name: 'signal-assistant' },
  { dir: '_shared', name: 'shared-library' },
  { dir: 'thebrain-package', name: 'thebrain' },
  { dir: 'conversation-explorer', name: 'conversation-explorer' },
  { dir: 'sonder-runtime', name: 'sonder-runtime' },
  { dir: 'thebrain-package', name: 'thebrain-package' },
];

/** SHA-1 hash of file content — matches term-scanner convention. */
function hashContent(content) {
  return crypto.createHash('sha1').update(content).digest('hex');
}

/**
 * Scan an entire project: extract all nodes first, then resolve and insert edges.
 * Returns { scanned, skipped }.
 */
function scanProject(db, projectDir, projectName) {
  const extractors = loadFlowExtractors(FLOW_EXTRACTORS_DIR);
  if (extractors.size === 0) return { scanned: 0, skipped: 0 };

  // Collect all code files matching extractor extensions
  const files = collectCodeFiles(projectDir, new Set(extractors.keys()));
  let scanned = 0;
  let skipped = 0;

  // Phase 0: determine which files need scanning
  const filesToScan = [];
  for (const file of files) {
    const content = fs.readFileSync(file.absolute, 'utf-8');
    const hash = hashContent(content);
    const storedHash = db.getFileHash(projectName, file.relative);
    if (storedHash === hash) {
      skipped++;
      continue;
    }
    filesToScan.push({ ...file, content, hash });
  }

  if (filesToScan.length === 0) return { scanned, skipped };

  // Phase 1 — Nodes: for each changed file, delete old data and insert new nodes
  const fileResults = [];
  for (const file of filesToScan) {
    const ext = path.extname(file.relative);
    const extractor = extractors.get(ext);
    if (!extractor) continue;

    const context = { project: projectName, projectRoot: projectDir, filePath: file.relative };
    let result;
    try {
      result = extractor.extract(file.relative, file.content, context);
    } catch (err) {
      process.stderr.write(`[flow-scan] Extract error ${file.relative}: ${err.message}\n`);
      continue;
    }

    // Transaction per file: delete old, insert new nodes
    db.transaction(() => {
      db.deleteEdgesForFile(projectName, file.relative);
      db.deleteNodesForFile(projectName, file.relative);

      const nodeIdMap = new Map();
      for (const node of result.nodes) {
        try {
          const id = db.insertNode(
            projectName, file.relative, node.name, node.type,
            node.line || null, node.metadata || null
          );
          nodeIdMap.set(`${node.name}:${node.type}`, id);
        } catch (err) {
          // Duplicate node (e.g., same function declared twice) — skip
          process.stderr.write(`[flow-scan] Node insert skip ${node.name}: ${err.message}\n`);
        }
      }

      fileResults.push({ file, edges: result.edges, nodeIdMap });
    });

    scanned++;
  }

  // Phase 2 — Edges: resolve {name, file, type} tuples to node IDs and insert
  // Must run after ALL Phase 1 files complete — all nodes must exist for cross-file resolution
  for (const { file, edges } of fileResults) {
    db.transaction(() => {
      for (const edge of edges) {
        try {
          // Resolve source node
          const sourceFile = edge.source.file || file.relative;
          const sourceId = db.resolveNode(projectName, sourceFile, edge.source.name, edge.source.type);
          if (!sourceId) continue; // Silently skip unresolved

          // Resolve target node
          const targetFile = edge.target.file || file.relative;
          const targetId = db.resolveNode(projectName, targetFile, edge.target.name, edge.target.type);
          if (!targetId) continue; // Silently skip unresolved

          db.insertEdge(sourceId, targetId, edge.type, projectName, file.relative, edge.data || null, edge.sequence || null);
        } catch (err) {
          // Duplicate edge or constraint violation — skip
        }
      }
    });
  }

  // Update file hashes
  for (const file of filesToScan) {
    db.upsertFileHash(projectName, file.relative, file.hash);
  }

  return { scanned, skipped };
}

/**
 * Scan a single file (for post-edit hook).
 * Handles file deletion: removes nodes/edges/hash if file doesn't exist.
 */
function scanSingleFile(db, projectDir, projectName, filePath) {
  const absolutePath = path.join(projectDir, filePath);

  // Handle deleted files
  if (!fs.existsSync(absolutePath)) {
    db.deleteEdgesForFile(projectName, filePath);
    db.deleteNodesForFile(projectName, filePath);
    db.deleteFileHash(projectName, filePath);
    return { scanned: 0, skipped: 0, deleted: true };
  }

  const content = fs.readFileSync(absolutePath, 'utf-8');
  const hash = hashContent(content);
  const storedHash = db.getFileHash(projectName, filePath);
  if (storedHash === hash) return { scanned: 0, skipped: 1 };

  const extractors = loadFlowExtractors(FLOW_EXTRACTORS_DIR);
  const ext = path.extname(filePath);
  const extractor = extractors.get(ext);
  if (!extractor) return { scanned: 0, skipped: 1 };

  const context = { project: projectName, projectRoot: projectDir, filePath };
  let result;
  try {
    result = extractor.extract(filePath, content, context);
  } catch (err) {
    process.stderr.write(`[flow-scan] Extract error ${filePath}: ${err.message}\n`);
    return { scanned: 0, skipped: 0 };
  }

  // Delete old data and insert new
  db.transaction(() => {
    db.deleteEdgesForFile(projectName, filePath);
    db.deleteNodesForFile(projectName, filePath);

    for (const node of result.nodes) {
      try {
        db.insertNode(projectName, filePath, node.name, node.type, node.line || null, node.metadata || null);
      } catch (err) {
        process.stderr.write(`[flow-scan] Node insert skip ${node.name}: ${err.message}\n`);
      }
    }
  });

  // Resolve and insert edges
  db.transaction(() => {
    for (const edge of result.edges) {
      try {
        const sourceFile = edge.source.file || filePath;
        const sourceId = db.resolveNode(projectName, sourceFile, edge.source.name, edge.source.type);
        if (!sourceId) continue;

        const targetFile = edge.target.file || filePath;
        const targetId = db.resolveNode(projectName, targetFile, edge.target.name, edge.target.type);
        if (!targetId) continue;

        db.insertEdge(sourceId, targetId, edge.type, projectName, filePath, edge.data || null, edge.sequence || null);
      } catch (err) {
        // Skip duplicate/constraint errors
      }
    }
  });

  db.upsertFileHash(projectName, filePath, hash);
  return { scanned: 1, skipped: 0 };
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const db = new FlowDB();

  try {
    if (args[0] === '--file' && args[1] && args[2]) {
      // Single file mode: --file <project> <filePath>
      const projectName = args[1];
      const filePath = args[2];
      // Find project directory
      const proj = PROJECTS.find(p => p.name === projectName);
      const projectDir = proj ? path.join(WEBSITES_DIR, proj.dir) : path.resolve(filePath, '..');

      const result = scanSingleFile(db, projectDir, projectName, filePath);
      console.log(`Flow scan (single): ${filePath} — scanned=${result.scanned}, skipped=${result.skipped}`);
    } else {
      // Full scan: optional project name filter, or --all / no args for all
      const targetProject = (!args[0] || args[0] === '--all') ? null : args[0];
      let totalScanned = 0, totalSkipped = 0;

      for (const proj of PROJECTS) {
        if (targetProject && proj.name !== targetProject) continue;

        const projectDir = path.join(WEBSITES_DIR, proj.dir);
        if (!fs.existsSync(projectDir)) {
          console.log(`  SKIP ${proj.name} — not found`);
          continue;
        }

        const result = scanProject(db, projectDir, proj.name);
        totalScanned += result.scanned;
        totalSkipped += result.skipped;

        if (result.scanned > 0) {
          console.log(`  ${proj.name}: ${result.scanned} scanned, ${result.skipped} skipped`);
        }
      }

      console.log(`Flow scan complete: ${totalScanned} scanned, ${totalSkipped} skipped`);
    }
  } finally {
    db.close();
  }
}

module.exports = { scanProject, scanSingleFile, hashContent };
