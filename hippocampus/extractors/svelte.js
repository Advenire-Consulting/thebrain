'use strict';

const path = require('path');

const SVELTE_KEYWORDS = new Set([
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

// Extract relative import paths from svelte script blocks
function extractImports(filePath, content) {
  const imports = [];
  const pattern = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const mod = match[1];
    if (mod.startsWith('.') || mod.startsWith('/')) {
      imports.push(mod);
    }
  }
  return [...new Set(imports)];
}

// Component name and props exposed by this svelte file
function extractExports(filePath, content) {
  const exports_ = [];
  const basename = path.basename(filePath, '.svelte');
  exports_.push(basename);

  const propsPattern = /let\s*\{([^}]+)\}\s*=\s*\$props\(\)/g;
  let match;
  while ((match = propsPattern.exec(content)) !== null) {
    const propsStr = match[1];
    const props = propsStr.split(',').map(p => {
      const trimmed = p.trim();
      const name = trimmed.split('=')[0].trim();
      return name;
    }).filter(Boolean);
    for (const prop of props) {
      exports_.push('prop:' + prop);
    }
  }

  return exports_;
}

// Svelte files do not define HTTP routes
function extractRoutes() { return []; }

// Extract code identifiers from a single line, including $-prefixed runes
function extractIdentifiers(line, lineNumber) {
  const seen = new Set();
  const results = [];
  const pattern = /\$?[a-zA-Z_][\w$]*/g;
  let match;
  while ((match = pattern.exec(line)) !== null) {
    const term = match[0];
    if (term.length < MIN_IDENTIFIER_LENGTH) continue;
    if (SVELTE_KEYWORDS.has(term)) continue;
    if (seen.has(term)) continue;
    seen.add(term);
    results.push({ term, line: lineNumber });
  }
  return results;
}

// Extract functions, reactive declarations, props, and state from svelte content
function extractDefinitions(content) {
  const lines = content.split('\n');
  const defs = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // function and async function declarations
    const funcMatch = trimmed.match(/^(?:async\s+)?function\s+(\w+)\s*\(/);
    if (funcMatch) {
      defs.push({ name: funcMatch[1], type: 'function', line: i + 1 });
      continue;
    }

    // Arrow functions: const name = (...) => or const name = async (...) =>
    const arrowMatch = trimmed.match(/^(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[\w]+)\s*=>/);
    if (arrowMatch) {
      defs.push({ name: arrowMatch[1], type: 'arrow', line: i + 1 });
      continue;
    }

    // $state declarations: let name = $state(...)
    const stateMatch = trimmed.match(/^let\s+(\w+)\s*=\s*\$state\(/);
    if (stateMatch) {
      defs.push({ name: stateMatch[1], type: 'state', line: i + 1 });
      continue;
    }

    // $derived declarations: let name = $derived(...) or $derived.by(...)
    const derivedMatch = trimmed.match(/^let\s+(\w+)\s*=\s*\$derived(?:\.by)?\(/);
    if (derivedMatch) {
      defs.push({ name: derivedMatch[1], type: 'derived', line: i + 1 });
      continue;
    }

    // $effect usage
    const effectMatch = trimmed.match(/^\$effect\(/);
    if (effectMatch) {
      defs.push({ name: '$effect', type: 'effect', line: i + 1 });
      continue;
    }

    // Props from $props() destructuring
    const propsMatch = trimmed.match(/^let\s*\{([^}]+)\}\s*=\s*\$props\(\)/);
    if (propsMatch) {
      const propsStr = propsMatch[1];
      const props = propsStr.split(',').map(p => {
        const t = p.trim();
        return t.split('=')[0].trim();
      }).filter(Boolean);
      for (const prop of props) {
        defs.push({ name: prop, type: 'prop', line: i + 1 });
      }
    }
  }

  return defs;
}

module.exports = {
  extensions: ['.svelte'],
  extractImports,
  extractExports,
  extractRoutes,
  extractIdentifiers,
  extractDefinitions,
};
