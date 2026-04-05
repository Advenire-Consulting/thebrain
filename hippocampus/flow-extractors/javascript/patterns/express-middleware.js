'use strict';

/**
 * Pattern: express-middleware
 * Extracts app.use() calls with sequence tracking and sub-app mounting.
 * Produces middleware nodes and mounts edges.
 */
module.exports = {
  create() {
    let sequence = 0;
    const middlewares = [];
    const mounts = [];

    return {
      match(node, ancestors, ctx) {
        if (node.type !== 'CallExpression') return;
        if (node.callee.type !== 'MemberExpression') return;
        if (node.callee.property.type !== 'Identifier' || node.callee.property.name !== 'use') return;

        const appName = node.callee.object.type === 'Identifier' ? node.callee.object.name : null;
        const args = node.arguments;
        if (!args.length) return;

        sequence++;
        let prefix = null;
        let handlerArgs = args;

        // First arg is string → path prefix
        if (args[0].type === 'Literal' && typeof args[0].value === 'string') {
          prefix = args[0].value;
          handlerArgs = args.slice(1);
        }

        // Determine handler name for display
        let handlerName = null;
        if (handlerArgs.length > 0) {
          const handler = handlerArgs[0];
          if (handler.type === 'Identifier') {
            handlerName = handler.name;
          } else if (handler.type === 'CallExpression' && handler.callee.type === 'Identifier') {
            handlerName = handler.callee.name + '()';
          } else if (handler.type === 'CallExpression' && handler.callee.type === 'MemberExpression') {
            const obj = handler.callee.object.type === 'Identifier' ? handler.callee.object.name : '';
            const prop = handler.callee.property.type === 'Identifier' ? handler.callee.property.name : '';
            handlerName = obj + '.' + prop + '()';
          }
        }

        middlewares.push({
          name: handlerName || `middleware#${sequence}`,
          app: appName,
          prefix,
          sequence,
          line: ctx.posToLine(node.start),
        });

        // Sub-app or router mount: app.use('/prefix', identifierHandler)
        if (prefix && handlerArgs.length > 0 && handlerArgs[0].type === 'Identifier') {
          mounts.push({
            app: appName,
            target: handlerArgs[0].name,
            prefix,
            line: ctx.posToLine(node.start),
          });
        }
      },

      extract(ctx) {
        const nodes = middlewares.map(mw => ({
          name: mw.name,
          type: 'middleware',
          line: mw.line,
          metadata: { app: mw.app, prefix: mw.prefix, sequence: mw.sequence },
        }));

        const edges = mounts.map(m => ({
          type: 'mounts',
          source: { name: m.app || '<app>', file: ctx.filePath, type: 'function' },
          target: { name: m.target, file: ctx.filePath, type: 'function' },
          data: { prefix: m.prefix },
        }));

        return { nodes, edges };
      },
    };
  },
};
