'use strict';

const BUILTIN_MODULES = new Set([
  'fs', 'path', 'http', 'https', 'url', 'crypto', 'stream', 'events',
  'util', 'os', 'child_process', 'readline', 'net', 'tls', 'dns',
  'assert', 'buffer', 'cluster', 'console', 'dgram', 'domain',
  'module', 'perf_hooks', 'querystring', 'string_decoder',
  'timers', 'tty', 'v8', 'vm', 'worker_threads', 'zlib',
  'node:fs', 'node:path', 'node:test', 'node:assert', 'node:assert/strict',
  'node:crypto', 'node:readline', 'node:url', 'node:http', 'node:https',
  'node:child_process', 'node:events', 'node:stream', 'node:util',
  'node:os', 'node:net', 'node:buffer', 'node:worker_threads', 'node:zlib',
]);

const JS_KEYWORDS = new Set([
  'abstract', 'arguments', 'async', 'await', 'boolean', 'break', 'byte', 'case',
  'catch', 'char', 'class', 'const', 'continue', 'debugger', 'default', 'delete',
  'do', 'double', 'else', 'enum', 'eval', 'export', 'extends', 'false', 'final',
  'finally', 'float', 'for', 'function', 'goto', 'if', 'implements', 'import',
  'in', 'instanceof', 'int', 'interface', 'let', 'long', 'native', 'new', 'null',
  'of', 'package', 'private', 'protected', 'public', 'require', 'return', 'short',
  'static', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws',
  'transient', 'try', 'typeof', 'undefined', 'var', 'void', 'volatile', 'while',
  'with', 'yield', 'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
  'console', 'process', 'module', 'exports', 'global',
]);

const MIN_IDENTIFIER_LENGTH = 3;
const NOT_METHODS = new Set(['if', 'for', 'while', 'switch', 'catch', 'else']);

// ── DIR file extraction ──────────────────────────────────────────────────────

function extractImports(filePath, content) {
  const imports = [];

  const requirePattern = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match;
  while ((match = requirePattern.exec(content)) !== null) {
    const mod = match[1];
    if (!BUILTIN_MODULES.has(mod) && (mod.startsWith('.') || mod.startsWith('/'))) {
      imports.push(mod);
    }
  }

  const importPattern = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = importPattern.exec(content)) !== null) {
    const mod = match[1];
    if (!BUILTIN_MODULES.has(mod) && (mod.startsWith('.') || mod.startsWith('/'))) {
      imports.push(mod);
    }
  }

  return [...new Set(imports)];
}

// Check if a module is a Node builtin (handles subpath imports like fs/promises)
function isNpmPackage(mod) {
  if (mod.startsWith('.') || mod.startsWith('/') || mod.startsWith('node:')) return false;
  if (BUILTIN_MODULES.has(mod)) return false;
  // Subpath builtins: fs/promises, path/posix, etc.
  const base = mod.split('/')[0];
  if (base !== mod && BUILTIN_MODULES.has(base)) return false;
  return true;
}

// Extract npm package imports (non-relative, non-builtin requires/imports)
function extractNpmImports(filePath, content) {
  const pkgs = [];

  const requirePattern = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match;
  while ((match = requirePattern.exec(content)) !== null) {
    if (isNpmPackage(match[1])) pkgs.push(match[1]);
  }

  const importPattern = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
  while ((match = importPattern.exec(content)) !== null) {
    if (isNpmPackage(match[1])) pkgs.push(match[1]);
  }

  return [...new Set(pkgs)];
}

function extractExports(filePath, content) {
  const exports_ = [];

  // CommonJS: module.exports = { a, b, c }
  const destructuredPattern = /module\.exports\s*=\s*\{([^}]+)\}/;
  const destructured = content.match(destructuredPattern);
  if (destructured) {
    const keys = destructured[1].split(',').map(k => k.trim().split(':')[0].trim()).filter(Boolean);
    exports_.push(...keys);
  }

  // CommonJS: module.exports = identifier
  const defaultPattern = /module\.exports\s*=\s*([a-zA-Z_]\w*)\s*;/;
  const defaultMatch = content.match(defaultPattern);
  if (defaultMatch && exports_.length === 0) {
    exports_.push(defaultMatch[1]);
  }

  // CommonJS: exports.name = ...
  const namedPattern = /exports\.(\w+)\s*=/g;
  let match;
  while ((match = namedPattern.exec(content)) !== null) {
    if (!exports_.includes(match[1])) exports_.push(match[1]);
  }

  // ES modules: export function/class/const/default
  const esExportPattern = /export\s+(?:default\s+)?(?:function|class|const|let|var)\s+(\w+)/g;
  while ((match = esExportPattern.exec(content)) !== null) {
    if (!exports_.includes(match[1])) exports_.push(match[1]);
  }

  // ES modules: export default identifier
  const esDefaultPattern = /export\s+default\s+([a-zA-Z_]\w*)\s*;/g;
  while ((match = esDefaultPattern.exec(content)) !== null) {
    if (!exports_.includes(match[1])) exports_.push(match[1]);
  }

  return exports_;
}

function extractRoutes(filePath, content) {
  const routes = [];
  const routePattern = /(?:router|app)\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g;
  let match;
  while ((match = routePattern.exec(content)) !== null) {
    routes.push(`${match[1].toUpperCase()} ${match[2]}`);
  }
  return routes;
}

// ── Term index extraction ────────────────────────────────────────────────────

function extractIdentifiers(line, lineNumber) {
  const seen = new Set();
  const results = [];
  const pattern = /[a-zA-Z_$][\w$]*/g;
  let match;
  while ((match = pattern.exec(line)) !== null) {
    const term = match[0];
    if (term.length < MIN_IDENTIFIER_LENGTH) continue;
    if (JS_KEYWORDS.has(term)) continue;
    if (seen.has(term)) continue;
    seen.add(term);
    results.push({ term, line: lineNumber });
  }
  return results;
}

function extractDefinitions(content) {
  const lines = content.split('\n');
  const defs = [];

  let inClass = false;
  let braceDepth = 0;
  let classStartDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;

    const classMatch = trimmed.match(/^class\s+(\w+)/);
    if (classMatch) {
      defs.push({ name: classMatch[1], type: 'class', line: i + 1 });
      inClass = true;
      classStartDepth = braceDepth;
    }

    // Handles: function foo(), async function foo(), export function foo(), export async function foo(), export default function foo()
    const funcMatch = trimmed.match(/^(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+(\w+)\s*\(/);
    if (funcMatch) {
      defs.push({ name: funcMatch[1], type: 'function', line: i + 1 });
    }

    if (!funcMatch) {
      // Handles: const foo = () =>, export const foo = () =>, export default arrow
      const arrowMatch = trimmed.match(/^(?:export\s+(?:default\s+)?)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[\w]+)\s*=>/);
      if (arrowMatch) {
        defs.push({ name: arrowMatch[1], type: 'arrow', line: i + 1 });
      }
    }

    if (!funcMatch) {
      // Handles: const foo = function(), export const foo = function()
      const exprMatch = trimmed.match(/^(?:export\s+(?:default\s+)?)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function\s*\(/);
      if (exprMatch) {
        defs.push({ name: exprMatch[1], type: 'function', line: i + 1 });
      }
    }

    if (inClass && braceDepth > classStartDepth) {
      const methodMatch = trimmed.match(/^(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/);
      if (methodMatch && !NOT_METHODS.has(methodMatch[1]) && methodMatch[1] !== 'function') {
        defs.push({ name: methodMatch[1], type: 'method', line: i + 1 });
      }
    }

    braceDepth += opens - closes;
    if (inClass && braceDepth <= classStartDepth) {
      inClass = false;
    }
  }

  return defs;
}

module.exports = {
  extensions: ['.js', '.mjs', '.cjs'],
  extractImports,
  extractNpmImports,
  extractExports,
  extractRoutes,
  extractIdentifiers,
  extractDefinitions,
};
