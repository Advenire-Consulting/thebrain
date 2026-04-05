'use strict';

/**
 * Pattern: cross-project-urls
 * Extracts API URL strings as url_reference nodes for cross-project resolution.
 * No edges — resolution happens in flow-resolve.js.
 */

const API_PATH_RE = /\/api\//;

module.exports = {
  create() {
    const urls = [];

    return {
      match(node, ancestors, ctx) {
        // String literals containing /api/ paths
        if (node.type === 'Literal' && typeof node.value === 'string') {
          const val = node.value;
          if (!API_PATH_RE.test(val)) return;
          // Skip require() paths
          if (ancestors.length > 0) {
            const parent = ancestors[ancestors.length - 1];
            if (parent.type === 'CallExpression' &&
                parent.callee.type === 'Identifier' && parent.callee.name === 'require') {
              return;
            }
          }
          // Skip external URLs (https://, http://)
          if (val.startsWith('http://') || val.startsWith('https://')) return;

          urls.push({
            url: val,
            partial: false,
            line: ctx.posToLine(node.start),
          });
        }

        // Template literal quasis containing /api/
        if (node.type === 'TemplateLiteral') {
          for (const quasi of node.quasis) {
            if (API_PATH_RE.test(quasi.value.raw)) {
              urls.push({
                url: quasi.value.raw,
                partial: true,
                line: ctx.posToLine(node.start),
              });
            }
          }
        }
      },

      extract(ctx) {
        const nodes = urls.map(u => ({
          name: `url_ref:${u.url.substring(0, 60)}`,
          type: 'url_reference',
          line: u.line,
          metadata: { url: u.url, partial: u.partial },
        }));

        return { nodes, edges: [] };
      },
    };
  },
};
