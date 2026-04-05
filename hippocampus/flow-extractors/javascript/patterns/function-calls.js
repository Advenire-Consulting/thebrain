'use strict';

/**
 * Pattern: function-calls
 * Extracts function declarations, expressions, arrow functions, call sites, argument passing.
 * Uses create() factory for per-file state isolation.
 */
module.exports = {
  create() {
    const functions = [];
    const calls = [];
    const functionStack = [];

    /** Get the current enclosing function name, or '<module>' for top-level. */
    function currentFunction() {
      return functionStack.length > 0 ? functionStack[functionStack.length - 1] : '<module>';
    }

    return {
      match(node, ancestors, ctx) {
        // Named function declarations: function foo(a, b) {}
        if (node.type === 'FunctionDeclaration' && node.id) {
          const params = (node.params || []).map(p => p.type === 'Identifier' ? p.name : '?');
          functions.push({
            name: node.id.name,
            line: ctx.posToLine(node.start),
            params,
          });
          functionStack.push(node.id.name);
        }

        // Variable declarator with function expression or arrow: const x = function() {} / const x = () => {}
        if (node.type === 'VariableDeclarator' && node.id && node.id.type === 'Identifier' && node.init) {
          const init = node.init;
          if (init.type === 'FunctionExpression' || init.type === 'ArrowFunctionExpression') {
            const params = (init.params || []).map(p => p.type === 'Identifier' ? p.name : '?');
            functions.push({
              name: node.id.name,
              line: ctx.posToLine(node.start),
              params,
            });
            functionStack.push(node.id.name);
          }
        }

        // Call expressions: foo(), bar(x, y)
        if (node.type === 'CallExpression') {
          let calleeName = null;

          // Direct call: foo()
          if (node.callee.type === 'Identifier') {
            calleeName = node.callee.name;
          }
          // Member call: obj.method() — skip, handled by other patterns (express, etc.)
          // But record simple method calls on known objects
          if (node.callee.type === 'MemberExpression' && node.callee.property.type === 'Identifier') {
            // Skip require() — handled by module-exports
            // Skip known framework calls — handled by other patterns
          }

          if (calleeName) {
            const caller = currentFunction();
            calls.push({
              caller,
              callee: calleeName,
              line: ctx.posToLine(node.start),
              args: (node.arguments || [])
                .filter(a => a.type === 'Identifier')
                .map(a => a.name),
            });
          }
        }
      },

      extract(ctx) {
        const nodes = functions.map(fn => ({
          name: fn.name,
          type: 'function',
          line: fn.line,
          metadata: { params: fn.params },
        }));

        const edges = [];

        // Call edges
        for (const call of calls) {
          edges.push({
            type: 'calls',
            source: { name: call.caller, file: ctx.filePath, type: 'function' },
            target: { name: call.callee, file: ctx.filePath, type: 'function' },
          });

          // Argument passing edges
          for (const arg of call.args) {
            edges.push({
              type: 'passes_arg',
              source: { name: call.caller, file: ctx.filePath, type: 'function' },
              target: { name: arg, file: ctx.filePath, type: 'function' },
              data: { argument: arg, callee: call.callee },
            });
          }
        }

        return { nodes, edges };
      },
    };
  },
};
