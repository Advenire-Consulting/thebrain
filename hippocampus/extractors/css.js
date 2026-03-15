'use strict';

function extractImports(filePath, content) {
  const imports = [];
  // @import url('./base.css') and @import './theme.css'
  const pattern = /@import\s+(?:url\(\s*)?['"]([^'"]+)['"]\s*\)?/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    imports.push(match[1]);
  }
  return [...new Set(imports)];
}

function extractExports() { return []; }
function extractRoutes() { return []; }

function extractIdentifiers(line, lineNumber) {
  const seen = new Set();
  const results = [];

  const classPattern = /\.([a-zA-Z_][\w-]*)/g;
  let match;
  while ((match = classPattern.exec(line)) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      results.push({ term: match[1], line: lineNumber });
    }
  }

  const varPattern = /(--[\w-]+)/g;
  while ((match = varPattern.exec(line)) !== null) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      results.push({ term: match[1], line: lineNumber });
    }
  }

  return results;
}

function extractDefinitions(content) {
  const lines = content.split('\n');
  const defs = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const classMatch = line.match(/^\.([a-zA-Z_][\w-]*)\s*\{/);
    if (classMatch) {
      defs.push({ name: classMatch[1], type: 'css_class', line: i + 1 });
    }
    const varMatch = line.match(/\s*(--[\w-]+)\s*:/);
    if (varMatch) {
      defs.push({ name: varMatch[1], type: 'css_var', line: i + 1 });
    }
  }

  return defs;
}

module.exports = {
  extensions: ['.css'],
  extractImports,
  extractExports,
  extractRoutes,
  extractIdentifiers,
  extractDefinitions,
};
