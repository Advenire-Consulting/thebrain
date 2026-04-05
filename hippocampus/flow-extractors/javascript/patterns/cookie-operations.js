'use strict';

/**
 * Pattern: cookie-operations
 * Extracts res.cookie(), res.clearCookie(), and req.cookies.x reads.
 * Creates property nodes for each cookie name so edges have valid targets.
 */
module.exports = {
  create() {
    const setCookies = [];
    const readCookies = [];

    return {
      match(node, ancestors, ctx) {
        if (node.type !== 'CallExpression' && node.type !== 'MemberExpression') return;

        // res.cookie('name', value, opts) or res.clearCookie('name', opts)
        if (node.type === 'CallExpression' &&
            node.callee.type === 'MemberExpression' &&
            node.callee.object.type === 'Identifier' && node.callee.object.name === 'res' &&
            node.callee.property.type === 'Identifier') {

          const method = node.callee.property.name;
          if ((method === 'cookie' || method === 'clearCookie') &&
              node.arguments.length > 0 &&
              node.arguments[0].type === 'Literal' &&
              typeof node.arguments[0].value === 'string') {
            setCookies.push({
              cookieName: node.arguments[0].value,
              operation: method === 'clearCookie' ? 'clear' : 'set',
              line: ctx.posToLine(node.start),
            });
          }
        }

        // req.cookies.name (MemberExpression chain)
        if (node.type === 'MemberExpression' &&
            node.object.type === 'MemberExpression' &&
            node.object.object.type === 'Identifier' && node.object.object.name === 'req' &&
            node.object.property.type === 'Identifier' && node.object.property.name === 'cookies' &&
            node.property.type === 'Identifier') {
          readCookies.push({
            cookieName: node.property.name,
            line: ctx.posToLine(node.start),
          });
        }
      },

      extract(ctx) {
        const nodeMap = new Map();
        const edges = [];

        // Create property nodes for each cookie
        for (const sc of setCookies) {
          const nodeName = `cookie:${sc.cookieName}`;
          if (!nodeMap.has(nodeName)) {
            nodeMap.set(nodeName, {
              name: nodeName,
              type: 'property',
              line: null,
              metadata: { cookieName: sc.cookieName },
            });
          }
          edges.push({
            type: 'sets_cookie',
            source: { name: ctx.filePath, file: ctx.filePath, type: 'module' },
            target: { name: nodeName, file: ctx.filePath, type: 'property' },
            data: { cookieName: sc.cookieName, operation: sc.operation },
          });
        }

        for (const rc of readCookies) {
          const nodeName = `cookie:${rc.cookieName}`;
          if (!nodeMap.has(nodeName)) {
            nodeMap.set(nodeName, {
              name: nodeName,
              type: 'property',
              line: null,
              metadata: { cookieName: rc.cookieName },
            });
          }
          edges.push({
            type: 'reads_cookie',
            source: { name: ctx.filePath, file: ctx.filePath, type: 'module' },
            target: { name: nodeName, file: ctx.filePath, type: 'property' },
            data: { cookieName: rc.cookieName },
          });
        }

        return { nodes: Array.from(nodeMap.values()), edges };
      },
    };
  },
};
