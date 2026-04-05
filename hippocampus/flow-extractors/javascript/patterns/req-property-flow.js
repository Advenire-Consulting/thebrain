'use strict';

/**
 * Pattern: req-property-flow
 * Extracts req.x = ... assignments as property nodes with attaches edges.
 * Extracts req.x.y reads as reads edges. Records object shapes in metadata.
 */

const TRACKED_ROOTS = new Set(['req', 'res']);

module.exports = {
  create() {
    const assignments = [];
    const reads = [];

    return {
      match(node, ancestors, ctx) {
        // Assignment: req.x = ... or res.locals.x = ...
        if (node.type === 'AssignmentExpression' &&
            node.left.type === 'MemberExpression') {
          const path = buildMemberPath(node.left);
          if (path && isTrackedPath(path)) {
            // Extract shape if RHS is an object expression
            let shape = null;
            if (node.right.type === 'ObjectExpression') {
              shape = node.right.properties
                .filter(p => p.key && p.key.type === 'Identifier')
                .map(p => p.key.name);
            }
            assignments.push({
              name: path,
              line: ctx.posToLine(node.start),
              shape,
            });
          }
        }

        // Read: req.company.slug (MemberExpression chain, 2+ dots, not assignment target)
        if (node.type === 'MemberExpression') {
          const path = buildMemberPath(node);
          if (!path || !isTrackedPath(path)) return;
          // Need at least 2 dots (e.g., req.company.slug)
          if (path.split('.').length < 3) return;
          // Not an assignment target
          if (isAssignmentTarget(node, ancestors)) return;

          reads.push({
            fullPath: path,
            basePath: normalizeToBase(path),
            line: ctx.posToLine(node.start),
          });
        }
      },

      extract(ctx) {
        // Deduplicate property nodes by name
        const propMap = new Map();
        for (const a of assignments) {
          if (!propMap.has(a.name)) {
            propMap.set(a.name, {
              name: a.name,
              type: 'property',
              line: a.line,
              metadata: { shape: a.shape || [] },
            });
          }
        }
        const nodes = Array.from(propMap.values());

        const edges = [];

        // Attaches edges from module to property
        for (const a of assignments) {
          edges.push({
            type: 'attaches',
            source: { name: ctx.filePath, file: ctx.filePath, type: 'module' },
            target: { name: a.name, file: ctx.filePath, type: 'property' },
          });
        }

        // Reads edges — normalize to base property (req.company.slug → req.company)
        const seenReads = new Set();
        for (const r of reads) {
          const key = `${r.basePath}@${r.line}`;
          if (seenReads.has(key)) continue;
          seenReads.add(key);
          edges.push({
            type: 'reads',
            source: { name: ctx.filePath, file: ctx.filePath, type: 'module' },
            target: { name: r.basePath, file: ctx.filePath, type: 'property' },
            data: { fullPath: r.fullPath },
          });
        }

        return { nodes, edges };
      },
    };
  },
};

/** Walk a MemberExpression chain and build a dotted path string. */
function buildMemberPath(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && node.property.type === 'Identifier') {
    const obj = buildMemberPath(node.object);
    if (!obj) return null;
    return obj + '.' + node.property.name;
  }
  return null;
}

/** Check if path starts with a tracked root (req, res). */
function isTrackedPath(path) {
  const root = path.split('.')[0];
  return TRACKED_ROOTS.has(root);
}

/** Check if a node is the left-hand side of an assignment. */
function isAssignmentTarget(node, ancestors) {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const parent = ancestors[i];
    if (parent.type === 'AssignmentExpression' && parent.left === node) return true;
    if (parent.type === 'MemberExpression') continue;
    break;
  }
  return false;
}

/** Normalize a deep read to its base property: req.company.slug → req.company */
function normalizeToBase(path) {
  const parts = path.split('.');
  // req.company.slug → req.company (keep first 2 segments)
  return parts.slice(0, 2).join('.');
}
