'use strict';

const SHELL_BUILTINS = new Set([
  'echo', 'cd', 'exit', 'test', 'read', 'set', 'unset', 'export',
  'local', 'return', 'shift', 'eval', 'trap', 'wait',
  'true', 'false', 'source', 'alias', 'unalias', 'type', 'hash',
  'pwd', 'dirs', 'pushd', 'popd', 'let', 'declare', 'typeset',
  'readonly', 'getopts', 'printf', 'builtin', 'command',
  'then', 'else', 'elif', 'fi', 'do', 'done', 'case', 'esac',
  'while', 'until', 'for', 'in', 'if',
]);

const MIN_IDENTIFIER_LENGTH = 3;

function extractImports(filePath, content) {
  const imports = [];

  // source ./path and . ./path
  const sourcePattern = /(?:^|\n)\s*(?:source|\.)\s+['"]?(\.\/[^\s'"]+|\.\.\/[^\s'"]+)/g;
  let match;
  while ((match = sourcePattern.exec(content)) !== null) {
    imports.push(match[1]);
  }

  return [...new Set(imports)];
}

function extractExports(filePath, content) {
  const exports_ = [];
  const lines = content.split('\n');

  for (const line of lines) {
    // function name() or function name {
    const funcKeyword = line.match(/^\s*function\s+(\w+)/);
    if (funcKeyword) { exports_.push(funcKeyword[1]); continue; }

    // name() {
    const funcShorthand = line.match(/^\s*(\w+)\s*\(\s*\)\s*\{/);
    if (funcShorthand && !SHELL_BUILTINS.has(funcShorthand[1])) {
      exports_.push(funcShorthand[1]);
    }
  }

  return exports_;
}

function extractRoutes() { return []; }

function extractIdentifiers(line, lineNumber) {
  const seen = new Set();
  const results = [];
  const pattern = /[a-zA-Z_]\w*/g;
  let match;
  while ((match = pattern.exec(line)) !== null) {
    const term = match[0];
    if (term.length < MIN_IDENTIFIER_LENGTH) continue;
    if (SHELL_BUILTINS.has(term)) continue;
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

    const funcKeyword = line.match(/^\s*function\s+(\w+)/);
    if (funcKeyword) {
      defs.push({ name: funcKeyword[1], type: 'function', line: i + 1 });
      continue;
    }

    const funcShorthand = line.match(/^\s*(\w+)\s*\(\s*\)\s*\{/);
    if (funcShorthand && !SHELL_BUILTINS.has(funcShorthand[1])) {
      defs.push({ name: funcShorthand[1], type: 'function', line: i + 1 });
    }
  }

  return defs;
}

module.exports = {
  extensions: ['.sh', '.bash'],
  extractImports,
  extractExports,
  extractRoutes,
  extractIdentifiers,
  extractDefinitions,
};
