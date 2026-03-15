'use strict';

const jsExtractor = require('./javascript');

function extractImports(filePath, content) {
  // JS extractor handles require() and import...from
  const jsImports = jsExtractor.extractImports(filePath, content);

  // Also handle: import type { X } from './types'
  const importTypePattern = /import\s+type\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
  let match;
  while ((match = importTypePattern.exec(content)) !== null) {
    const mod = match[1];
    if (mod.startsWith('.') || mod.startsWith('/')) {
      if (!jsImports.includes(mod)) jsImports.push(mod);
    }
  }

  return jsImports;
}

function extractExports(filePath, content) {
  const exports_ = [];

  // ES module exports (covers function, class, const, let, var, interface, type, enum)
  const esPattern = /export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type|enum)\s+(\w+)/g;
  let match;
  while ((match = esPattern.exec(content)) !== null) {
    if (!exports_.includes(match[1])) exports_.push(match[1]);
  }

  // export default identifier;
  const defaultPattern = /export\s+default\s+([a-zA-Z_]\w*)\s*;/g;
  while ((match = defaultPattern.exec(content)) !== null) {
    if (!exports_.includes(match[1])) exports_.push(match[1]);
  }

  // Also check CommonJS for .ts files that use it
  const cjsExports = jsExtractor.extractExports(filePath, content);
  for (const e of cjsExports) {
    if (!exports_.includes(e)) exports_.push(e);
  }

  return exports_;
}

function extractDefinitions(content) {
  // Start with all JS definitions
  const defs = jsExtractor.extractDefinitions(content);
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    const interfaceMatch = trimmed.match(/^(?:export\s+)?interface\s+(\w+)/);
    if (interfaceMatch) {
      defs.push({ name: interfaceMatch[1], type: 'interface', line: i + 1 });
    }

    const typeMatch = trimmed.match(/^(?:export\s+)?type\s+(\w+)\s*=/);
    if (typeMatch) {
      defs.push({ name: typeMatch[1], type: 'type', line: i + 1 });
    }

    const enumMatch = trimmed.match(/^(?:export\s+)?enum\s+(\w+)/);
    if (enumMatch) {
      defs.push({ name: enumMatch[1], type: 'enum', line: i + 1 });
    }
  }

  return defs;
}

module.exports = {
  extensions: ['.ts', '.tsx'],
  extractImports,
  extractExports,
  extractRoutes: jsExtractor.extractRoutes,
  extractIdentifiers: jsExtractor.extractIdentifiers,
  extractDefinitions,
};
