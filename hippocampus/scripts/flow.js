'use strict';

const path = require('path');
const { FlowDB } = require('../lib/flow-db');
const { FlowQueries } = require('../lib/flow-queries');

/**
 * Format a trace result into compact, readable output (~100-300 tokens).
 */
function formatTrace(result) {
  if (!result) return 'No results found.';

  const lines = [];

  // Header: identifier — type (file:line)
  for (const node of result.nodes) {
    const loc = node.line ? `${node.file}:${node.line}` : node.file;
    lines.push(`${node.name} — ${node.type} (${loc})`);

    // Shape/params/exports from metadata
    if (node.metadata) {
      if (node.metadata.params && node.metadata.params.length > 0) {
        lines.push(`  params: ${node.metadata.params.join(', ')}`);
      }
      if (node.metadata.shape && node.metadata.shape.length > 0) {
        lines.push(`  shape: { ${node.metadata.shape.join(', ')} }`);
      }
      if (node.metadata.exports && node.metadata.exports.length > 0) {
        lines.push(`  exports: ${node.metadata.exports.join(', ')}`);
      }
    }
  }

  // Set by
  if (result.setBy.length > 0) {
    lines.push('');
    lines.push('Set by:');
    for (const e of result.setBy) {
      lines.push(`  ${e.name} (${e.file}) [${e.edgeType}]`);
    }
  }

  // Called by
  if (result.calledBy.length > 0) {
    lines.push('');
    lines.push('Called by:');
    for (const e of result.calledBy) {
      lines.push(`  ${e.name} (${e.file})`);
    }
  }

  // Read by
  if (result.readBy.length > 0) {
    lines.push('');
    lines.push('Read by:');
    for (const e of result.readBy) {
      const detail = e.data && e.data.fullPath ? ` — ${e.data.fullPath}` : '';
      lines.push(`  ${e.name} (${e.file})${detail}`);
    }
  }

  // Attaches
  if (result.attaches.length > 0) {
    lines.push('');
    lines.push('Attaches:');
    for (const e of result.attaches) {
      lines.push(`  → ${e.name} (${e.file}) [${e.edgeType}]`);
    }
  }

  // Tables
  if (result.queries.length > 0) {
    lines.push('');
    lines.push('Tables:');
    for (const e of result.queries) {
      const cols = e.data && e.data.columns ? ` (${e.data.columns.join(', ')})` : '';
      lines.push(`  ${e.name}${cols} [${e.edgeType}]`);
    }
  }

  return lines.join('\n');
}

/**
 * Format a file flow result into compact output (~200-300 tokens).
 */
function formatFileFlow(result) {
  if (!result) return 'No results found.';

  const lines = [];
  lines.push(`${result.file} (${result.project})`);

  // Imports/Exports
  if (result.imports.length > 0) {
    lines.push(`Imports: ${result.imports.join(', ')}`);
  }
  if (result.exports.length > 0) {
    lines.push(`Exports: ${result.exports.join(', ')}`);
  }

  // Nodes grouped by type (skip module type)
  const byType = {};
  for (const n of result.nodes) {
    if (n.type === 'module') continue;
    if (!byType[n.type]) byType[n.type] = [];
    byType[n.type].push(n);
  }

  for (const [type, nodes] of Object.entries(byType)) {
    lines.push('');
    lines.push(`${type}s:`);
    for (const n of nodes) {
      const loc = n.line ? `:${n.line}` : '';
      lines.push(`  ${n.name}${loc}`);
    }
  }

  // Outbound (non-requires)
  if (result.outbound.length > 0) {
    lines.push('');
    lines.push('Reaches:');
    for (const e of result.outbound) {
      const target = e.targetFile !== result.file ? `${e.target} (${e.targetFile})` : e.target;
      lines.push(`  → ${target} [${e.type}]`);
    }
  }

  // Consumed by (grouped by source file)
  if (result.inbound.length > 0) {
    lines.push('');
    lines.push('Consumed by:');
    const byFile = {};
    for (const e of result.inbound) {
      if (!byFile[e.sourceFile]) byFile[e.sourceFile] = [];
      byFile[e.sourceFile].push(e);
    }
    for (const [file, edges] of Object.entries(byFile)) {
      lines.push(`  ${file}:`);
      for (const e of edges) {
        lines.push(`    ${e.source} → ${e.target} [${e.type}]`);
      }
    }
  }

  return lines.join('\n');
}

// CLI entry point
if (require.main === module) {
  const args = process.argv.slice(2);
  const db = new FlowDB();
  const queries = new FlowQueries(db.db);

  try {
    if (args[0] === '--trace' && args[1]) {
      const identifier = args[1];
      const projectIdx = args.indexOf('--project');
      const project = projectIdx !== -1 ? args[projectIdx + 1] : null;
      const result = queries.trace(identifier, project);
      console.log(formatTrace(result));

    } else if (args[0] === '--flow' && args[1]) {
      const file = args[1];
      const projectIdx = args.indexOf('--project');
      const project = projectIdx !== -1 ? args[projectIdx + 1] : null;
      if (!project) {
        console.error('--flow requires --project');
        process.exit(1);
      }
      const result = queries.fileFlow(file, project);
      console.log(formatFileFlow(result));

    } else if (args[0] === '--notes' && args[1]) {
      // --notes <file:name> [--project P]
      const [file, name] = args[1].split(':');
      const projectIdx = args.indexOf('--project');
      const project = projectIdx !== -1 ? args[projectIdx + 1] : null;

      // Find matching node
      const findNodes = project
        ? db.db.prepare('SELECT * FROM nodes WHERE file = ? AND name = ? AND project = ?').all(file, name, project)
        : db.db.prepare('SELECT * FROM nodes WHERE file = ? AND name = ?').all(file, name);

      if (findNodes.length === 0) {
        console.log(`No node found for ${args[1]}`);
      } else {
        for (const node of findNodes) {
          const annotations = queries.getAnnotations(node.id);
          console.log(`${node.name} (${node.type}, ${node.file}:${node.line || '?'}):`);
          if (annotations.length === 0) {
            console.log('  (no annotations)');
          } else {
            for (const a of annotations) {
              console.log(`  [${a.author}] ${a.content}`);
            }
          }
        }
      }

    } else if (args[0] === '--annotate' && args[1] && args[2]) {
      // --annotate <file:name> "note" [--project P]
      const [file, name] = args[1].split(':');
      const note = args[2];
      const projectIdx = args.indexOf('--project');
      const project = projectIdx !== -1 ? args[projectIdx + 1] : null;

      const findNodes = project
        ? db.db.prepare('SELECT * FROM nodes WHERE file = ? AND name = ? AND project = ?').all(file, name, project)
        : db.db.prepare('SELECT * FROM nodes WHERE file = ? AND name = ?').all(file, name);

      if (findNodes.length === 0) {
        console.log(`No node found for ${args[1]}`);
      } else if (findNodes.length > 1) {
        console.log('Ambiguous — multiple matches:');
        for (const n of findNodes) {
          console.log(`  ${n.project}/${n.file}:${n.name} (${n.type})`);
        }
      } else {
        db.db.prepare(
          "INSERT INTO annotations (target_type, target_id, content) VALUES ('node', ?, ?)"
        ).run(findNodes[0].id, note);
        console.log(`Annotation added to ${findNodes[0].name}`);
      }

    } else {
      console.log(`Usage:
  flow.js --trace <identifier> [--project P]
  flow.js --flow <file> --project P
  flow.js --notes <file:name> [--project P]
  flow.js --annotate <file:name> "note" [--project P]`);
    }
  } finally {
    db.close();
  }
}

module.exports = { formatTrace, formatFileFlow };
