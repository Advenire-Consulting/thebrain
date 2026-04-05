'use strict';

/**
 * Pattern: config-reads
 * Extracts process.env.X and config object property accesses.
 * Produces config nodes and reads edges.
 */

const CONFIG_OBJECTS = new Set(['runtimeConfig', 'config']);

module.exports = {
  create() {
    const configs = [];

    return {
      match(node, ancestors, ctx) {
        if (node.type !== 'MemberExpression') return;

        // process.env.X (nested MemberExpression)
        if (node.object.type === 'MemberExpression' &&
            node.object.object.type === 'Identifier' && node.object.object.name === 'process' &&
            node.object.property.type === 'Identifier' && node.object.property.name === 'env' &&
            node.property.type === 'Identifier') {
          configs.push({
            name: `process.env.${node.property.name}`,
            line: ctx.posToLine(node.start),
          });
          return;
        }

        // config.prop or runtimeConfig.prop
        if (node.object.type === 'Identifier' &&
            CONFIG_OBJECTS.has(node.object.name) &&
            node.property.type === 'Identifier') {
          configs.push({
            name: `${node.object.name}.${node.property.name}`,
            line: ctx.posToLine(node.start),
          });
        }
      },

      extract(ctx) {
        // Deduplicate config nodes
        const nodeMap = new Map();
        const edges = [];

        for (const cfg of configs) {
          if (!nodeMap.has(cfg.name)) {
            nodeMap.set(cfg.name, {
              name: cfg.name,
              type: 'config',
              line: null,
              metadata: {},
            });
          }
          edges.push({
            type: 'reads',
            source: { name: ctx.filePath, file: ctx.filePath, type: 'module' },
            target: { name: cfg.name, file: ctx.filePath, type: 'config' },
          });
        }

        return { nodes: Array.from(nodeMap.values()), edges };
      },
    };
  },
};
