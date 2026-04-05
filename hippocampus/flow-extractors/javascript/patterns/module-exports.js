'use strict';

/**
 * Pattern: module-exports
 * Extracts module.exports, exports.x assignments, and require() calls.
 * Produces module nodes and requires edges.
 */
module.exports = {
  create() {
    const exportNames = [];
    const requires = [];

    return {
      match(node, ancestors, ctx) {
        // module.exports = { ... } or module.exports = identifier
        if (node.type === 'AssignmentExpression' &&
            node.left.type === 'MemberExpression' &&
            node.left.object.type === 'Identifier' && node.left.object.name === 'module' &&
            node.left.property.type === 'Identifier' && node.left.property.name === 'exports') {

          if (node.right.type === 'ObjectExpression') {
            // Object with named properties
            for (const prop of node.right.properties) {
              if (prop.key && prop.key.type === 'Identifier') {
                exportNames.push(prop.key.name);
              }
            }
          } else if (node.right.type === 'Identifier') {
            // Single export: module.exports = createApp
            exportNames.push(node.right.name);
          }
        }

        // exports.name = ...
        if (node.type === 'AssignmentExpression' &&
            node.left.type === 'MemberExpression' &&
            node.left.object.type === 'Identifier' && node.left.object.name === 'exports' &&
            node.left.property.type === 'Identifier') {
          exportNames.push(node.left.property.name);
        }

        // require('./path') calls — only local requires (starting with . or /)
        if (node.type === 'CallExpression' &&
            node.callee.type === 'Identifier' && node.callee.name === 'require' &&
            node.arguments.length > 0 && node.arguments[0].type === 'Literal' &&
            typeof node.arguments[0].value === 'string') {
          const reqPath = node.arguments[0].value;
          if (reqPath.startsWith('.') || reqPath.startsWith('/')) {
            requires.push({
              path: reqPath,
              line: ctx.posToLine(node.start),
            });
          }
        }
      },

      extract(ctx) {
        const nodes = [];
        const edges = [];

        // Module node named after file path
        if (exportNames.length > 0 || requires.length > 0) {
          nodes.push({
            name: ctx.filePath,
            type: 'module',
            line: null,
            metadata: { exports: [...new Set(exportNames)] },
          });
        }

        // Requires edges from this module to required modules
        for (const req of requires) {
          // Normalize path: strip ./ prefix, resolve ../, add .js if no extension
          let resolved = req.path;
          if (!resolved.match(/\.\w+$/)) resolved += '.js';

          edges.push({
            type: 'requires',
            source: { name: ctx.filePath, file: ctx.filePath, type: 'module' },
            target: { name: resolved, file: resolved, type: 'module' },
            data: { path: req.path },
          });
        }

        return { nodes, edges };
      },
    };
  },
};
