'use strict';

const PYTHON_KEYWORDS = new Set([
  'def', 'class', 'import', 'from', 'if', 'elif', 'else', 'for', 'while',
  'return', 'yield', 'async', 'await', 'with', 'as', 'try', 'except',
  'finally', 'raise', 'pass', 'break', 'continue', 'and', 'or', 'not',
  'is', 'in', 'lambda', 'global', 'nonlocal', 'True', 'False', 'None',
  'self', 'cls', 'del', 'assert', 'print',
]);

const MIN_IDENTIFIER_LENGTH = 3;

function extractImports(filePath, content) {
  const imports = [];

  // from . import x, from .lib import y, from ..core import z
  const fromRelativePattern = /from\s+(\.[\w.]*)\s+import/g;
  let match;
  while ((match = fromRelativePattern.exec(content)) !== null) {
    imports.push(match[1]);
  }

  return [...new Set(imports)];
}

function extractExports(filePath, content) {
  const exports_ = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // Top-level only: no leading whitespace
    const funcMatch = line.match(/^(?:async\s+)?def\s+(\w+)\s*\(/);
    if (funcMatch) exports_.push(funcMatch[1]);

    const classMatch = line.match(/^class\s+(\w+)/);
    if (classMatch) exports_.push(classMatch[1]);
  }

  return exports_;
}

function extractRoutes(filePath, content) {
  const routes = [];

  // Flask: @app.route('/path') or @blueprint.route('/path')
  const flaskPattern = /@\w+\.route\(\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = flaskPattern.exec(content)) !== null) {
    routes.push('ROUTE ' + match[1]);
  }

  // FastAPI: @app.get('/path'), @router.post('/path'), etc.
  const fastapiPattern = /@\w+\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;
  while ((match = fastapiPattern.exec(content)) !== null) {
    routes.push(match[1].toUpperCase() + ' ' + match[2]);
  }

  return routes;
}

function extractIdentifiers(line, lineNumber) {
  const seen = new Set();
  const results = [];
  const pattern = /[a-zA-Z_]\w*/g;
  let match;
  while ((match = pattern.exec(line)) !== null) {
    const term = match[0];
    if (term.length < MIN_IDENTIFIER_LENGTH) continue;
    if (PYTHON_KEYWORDS.has(term)) continue;
    if (seen.has(term)) continue;
    seen.add(term);
    results.push({ term, line: lineNumber });
  }
  return results;
}

function extractDefinitions(content) {
  const lines = content.split('\n');
  const defs = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const asyncFuncMatch = line.match(/^(\s*)async\s+def\s+(\w+)\s*\(/);
    if (asyncFuncMatch) {
      defs.push({ name: asyncFuncMatch[2], type: 'async_function', line: i + 1 });
      continue;
    }

    const funcMatch = line.match(/^(\s*)def\s+(\w+)\s*\(/);
    if (funcMatch) {
      defs.push({ name: funcMatch[2], type: 'function', line: i + 1 });
      continue;
    }

    const classMatch = line.match(/^(\s*)class\s+(\w+)/);
    if (classMatch) {
      defs.push({ name: classMatch[2], type: 'class', line: i + 1 });
    }
  }

  return defs;
}

module.exports = {
  extensions: ['.py'],
  extractImports,
  extractExports,
  extractRoutes,
  extractIdentifiers,
  extractDefinitions,
};
