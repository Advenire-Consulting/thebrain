'use strict';

const acorn = require('acorn');
const fs = require('fs');
const path = require('path');

const PATTERNS_DIR = path.join(__dirname, 'patterns');

/**
 * Load pattern modules from the patterns/ directory.
 * Each module exports either:
 *   A) { create() } — factory returning { match, extract } with per-file state
 *   B) { match, extract } — stateless module
 */
function loadPatterns() {
  const patterns = [];
  let files;
  try {
    files = fs.readdirSync(PATTERNS_DIR).filter(f => f.endsWith('.js'));
  } catch {
    return patterns;
  }

  for (const file of files) {
    try {
      const mod = require(path.join(PATTERNS_DIR, file));
      if (typeof mod.create === 'function') {
        patterns.push({ name: file, factory: mod.create });
      } else if (typeof mod.match === 'function' && typeof mod.extract === 'function') {
        patterns.push({ name: file, stateless: mod });
      } else {
        process.stderr.write(`[js-extractor] Pattern ${file} missing match/extract or create — skipped\n`);
      }
    } catch (err) {
      process.stderr.write(`[js-extractor] Failed to load pattern ${file}: ${err.message}\n`);
    }
  }
  return patterns;
}

/** Convert acorn 0-indexed position to 1-indexed line number. */
function posToLine(content, pos) {
  let line = 1;
  for (let i = 0; i < pos && i < content.length; i++) {
    if (content[i] === '\n') line++;
  }
  return line;
}

/** Recursive AST walker tracking ancestor chain. */
function walkAST(node, ancestors, visitor) {
  if (!node || typeof node !== 'object') return;
  if (node.type) {
    visitor(node, ancestors);
    ancestors = [...ancestors, node];
  }
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === 'object' && item.type) {
          walkAST(item, ancestors, visitor);
        }
      }
    } else if (child && typeof child === 'object' && child.type) {
      walkAST(child, ancestors, visitor);
    }
  }
}

// Cache loaded patterns (module-level, cleared on require.cache invalidation)
let _patterns = null;

/**
 * Extract flow nodes and edges from a JavaScript file.
 * Parses AST once, delegates to all auto-discovered pattern modules.
 */
function extract(filePath, content, context) {
  const empty = { nodes: [], edges: [] };

  // Empty file — nothing to extract
  if (!content || !content.trim()) return empty;

  // Parse AST
  let ast;
  try {
    ast = acorn.parse(content, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowReturnOutsideFunction: true,
      allowHashBang: true,
    });
  } catch (err) {
    process.stderr.write(`[js-extractor] Parse error in ${filePath}: ${err.message}\n`);
    return empty;
  }

  // Load patterns on first call
  if (!_patterns) _patterns = loadPatterns();
  if (_patterns.length === 0) return empty;

  // Build context for match and extract
  const matchCtx = { filePath, content, posToLine: (pos) => posToLine(content, pos) };
  const extractCtx = { ...context, filePath };

  // Create fresh instances for factory patterns, use stateless directly
  const instances = _patterns.map(p => {
    if (p.factory) return { name: p.name, inst: p.factory() };
    return { name: p.name, inst: p.stateless };
  });

  // Walk AST — call match() on every pattern for every node
  walkAST(ast, [], (node, ancestors) => {
    for (const { name, inst } of instances) {
      try {
        inst.match(node, ancestors, matchCtx);
      } catch (err) {
        process.stderr.write(`[js-extractor] Pattern ${name} error on ${node.type}: ${err.message}\n`);
      }
    }
  });

  // Collect results from all patterns
  const allNodes = [];
  const allEdges = [];

  for (const { name, inst } of instances) {
    try {
      const result = inst.extract(extractCtx);
      if (result.nodes) allNodes.push(...result.nodes);
      if (result.edges) allEdges.push(...result.edges);
    } catch (err) {
      process.stderr.write(`[js-extractor] Pattern ${name} extract error: ${err.message}\n`);
    }
  }

  return { nodes: allNodes, edges: allEdges };
}

module.exports = {
  extensions: ['.js', '.mjs', '.cjs'],
  extract,
};
