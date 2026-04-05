'use strict';

/**
 * Pattern: express-routes
 * Extracts app.get(), app.post(), router.delete(), etc.
 * Produces route nodes and mounts_route edges.
 */

const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'all', 'options', 'head']);

module.exports = {
  create() {
    const routes = [];

    return {
      match(node, ancestors, ctx) {
        // CallExpression where callee is *.method() with string first arg
        if (node.type !== 'CallExpression') return;
        if (node.callee.type !== 'MemberExpression') return;
        if (node.callee.property.type !== 'Identifier') return;

        const method = node.callee.property.name;
        if (!HTTP_METHODS.has(method)) return;

        // First argument must be a string literal (the route path)
        if (!node.arguments.length || node.arguments[0].type !== 'Literal') return;
        if (typeof node.arguments[0].value !== 'string') return;

        const routePath = node.arguments[0].value;
        const appName = node.callee.object.type === 'Identifier' ? node.callee.object.name : null;

        routes.push({
          method: method.toUpperCase(),
          path: routePath,
          app: appName,
          line: ctx.posToLine(node.start),
        });
      },

      extract(ctx) {
        const nodes = routes.map(r => ({
          name: `${r.method} ${r.path}`,
          type: 'route',
          line: r.line,
          metadata: { method: r.method, path: r.path, app: r.app },
        }));

        const edges = routes.map(r => ({
          type: 'mounts_route',
          source: { name: r.app || '<app>', file: ctx.filePath, type: 'function' },
          target: { name: `${r.method} ${r.path}`, file: ctx.filePath, type: 'route' },
        }));

        return { nodes, edges };
      },
    };
  },
};
