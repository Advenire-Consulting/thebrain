'use strict';

/**
 * Pattern: sql-operations
 * Extracts SQL strings from .prepare(), .run(), .all(), .get() calls.
 * Classifies as query vs mutation. Produces table nodes and edges.
 */

const SQL_METHODS = new Set(['prepare', 'run', 'all', 'get']);

// SQL regex patterns — extract table names and optionally columns
const SQL_PATTERNS = [
  { re: /SELECT\s+(.+?)\s+FROM\s+(\w+)/gi, edgeType: 'queries_table', hasColumns: true },
  { re: /INSERT\s+INTO\s+(\w+)/gi, edgeType: 'mutates_table', hasColumns: false },
  { re: /UPDATE\s+(\w+)\s+SET/gi, edgeType: 'mutates_table', hasColumns: false },
  { re: /DELETE\s+FROM\s+(\w+)/gi, edgeType: 'mutates_table', hasColumns: false },
  { re: /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/gi, edgeType: 'mutates_table', hasColumns: false },
];

module.exports = {
  create() {
    const operations = [];

    return {
      match(node, ancestors, ctx) {
        if (node.type !== 'CallExpression') return;
        if (node.callee.type !== 'MemberExpression') return;
        if (node.callee.property.type !== 'Identifier') return;

        const method = node.callee.property.name;

        // Direct: db.prepare('SQL'), db.run('SQL')
        if (SQL_METHODS.has(method) && node.arguments.length > 0 && node.arguments[0].type === 'Literal' && typeof node.arguments[0].value === 'string') {
          parseSql(node.arguments[0].value, ctx.posToLine(node.start), operations);
          return;
        }

        // Chained: db.prepare('SQL').get(), db.prepare('SQL').all()
        if ((method === 'get' || method === 'all' || method === 'run') &&
            node.callee.object.type === 'CallExpression' &&
            node.callee.object.callee.type === 'MemberExpression' &&
            node.callee.object.callee.property.type === 'Identifier' &&
            node.callee.object.callee.property.name === 'prepare' &&
            node.callee.object.arguments.length > 0 &&
            node.callee.object.arguments[0].type === 'Literal' &&
            typeof node.callee.object.arguments[0].value === 'string') {
          parseSql(node.callee.object.arguments[0].value, ctx.posToLine(node.start), operations);
        }
      },

      extract(ctx) {
        const tableMap = new Map();
        const edges = [];

        for (const op of operations) {
          // Deduplicate table nodes
          if (!tableMap.has(op.table)) {
            tableMap.set(op.table, {
              name: op.table,
              type: 'table',
              line: null,
              metadata: {},
            });
          }

          edges.push({
            type: op.edgeType,
            source: { name: ctx.filePath, file: ctx.filePath, type: 'module' },
            target: { name: op.table, file: ctx.filePath, type: 'table' },
            data: op.columns ? { columns: op.columns } : null,
          });
        }

        return { nodes: Array.from(tableMap.values()), edges };
      },
    };
  },
};

/** Parse a SQL string and add any detected operations. */
function parseSql(sql, line, operations) {
  for (const pattern of SQL_PATTERNS) {
    pattern.re.lastIndex = 0;
    let match;
    while ((match = pattern.re.exec(sql)) !== null) {
      if (pattern.hasColumns) {
        // SELECT pattern: group 1 = columns, group 2 = table
        const columnStr = match[1];
        const table = match[2];
        const columns = columnStr.split(',')
          .map(c => c.trim().replace(/^\w+\./, '').replace(/\s+as\s+\w+$/i, '').trim())
          .filter(c => c && c !== '*');
        operations.push({ table, edgeType: pattern.edgeType, columns, line });
      } else {
        // INSERT/UPDATE/DELETE/CREATE: group 1 = table
        const table = match[1];
        operations.push({ table, edgeType: pattern.edgeType, columns: null, line });
      }
    }
  }
}
