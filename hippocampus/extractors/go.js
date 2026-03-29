'use strict';

const GO_KEYWORDS = new Set([
  'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else',
  'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import', 'interface',
  'map', 'package', 'range', 'return', 'select', 'struct', 'switch', 'type',
  'var', 'nil', 'true', 'false', 'iota',
  // Predeclared types and builtins — filtered to reduce noise
  'bool', 'byte', 'int', 'int8', 'int16', 'int32', 'int64', 'uint', 'uint8',
  'uint16', 'uint32', 'uint64', 'float32', 'float64', 'complex64', 'complex128',
  'string', 'error', 'rune', 'uintptr', 'append', 'cap', 'close', 'copy',
  'delete', 'len', 'make', 'new', 'panic', 'print', 'println', 'recover',
  'any', 'comparable',
]);

const MIN_IDENTIFIER_LENGTH = 3;

function extractImports(filePath, content) {
  const imports = [];

  // Single import: import "path" or import alias "path"
  const singlePattern = /import\s+(?:\w+\s+)?"([^"]+)"/g;
  let match;
  while ((match = singlePattern.exec(content)) !== null) {
    if (match[1].includes('.')) imports.push(match[1]);
  }

  // Block import: import ( "path1" \n "path2" )
  const blockPattern = /import\s*\(([^)]+)\)/gs;
  while ((match = blockPattern.exec(content)) !== null) {
    const block = match[1];
    const linePattern = /(?:\w+\s+)?"([^"]+)"/g;
    let lineMatch;
    while ((lineMatch = linePattern.exec(block)) !== null) {
      if (lineMatch[1].includes('.')) imports.push(lineMatch[1]);
    }
  }

  return [...new Set(imports)];
}

function extractExports(filePath, content) {
  const exports_ = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Package-level exported functions (uppercase, no receiver)
    const funcMatch = trimmed.match(/^func\s+([A-Z]\w*)\s*\(/);
    if (funcMatch) { exports_.push(funcMatch[1]); continue; }

    // Exported types: type Name struct/interface
    const typeMatch = trimmed.match(/^type\s+([A-Z]\w*)\s+/);
    if (typeMatch) { exports_.push(typeMatch[1]); continue; }

    // Exported var/const
    const varMatch = trimmed.match(/^(?:var|const)\s+([A-Z]\w*)/);
    if (varMatch) { exports_.push(varMatch[1]); continue; }
  }

  return exports_;
}

function extractRoutes(filePath, content) {
  const routes = [];
  let match;

  // Chi/Gorilla/Gin: r.Get("/path", ...), r.POST("/path", ...) — case-insensitive method
  const routerPattern = /\w+\.(Get|Post|Put|Delete|Patch|GET|POST|PUT|DELETE|PATCH)\(\s*"([^"]+)"/g;
  while ((match = routerPattern.exec(content)) !== null) {
    routes.push(match[1].toUpperCase() + ' ' + match[2]);
  }

  // net/http: http.HandleFunc("/path", ...) or r.HandleFunc("/path", ...)
  const handleFuncPattern = /\w+\.HandleFunc\(\s*"([^"]+)"/g;
  while ((match = handleFuncPattern.exec(content)) !== null) {
    routes.push('ROUTE ' + match[1]);
  }

  // r.Handle("/path", ...)
  const handlePattern = /\w+\.Handle\(\s*"([^"]+)"/g;
  while ((match = handlePattern.exec(content)) !== null) {
    routes.push('ROUTE ' + match[1]);
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
    if (GO_KEYWORDS.has(term)) continue;
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
    const trimmed = lines[i].trim();

    // Package-level function: func Name(
    const funcMatch = trimmed.match(/^func\s+(\w+)\s*\(/);
    if (funcMatch) { defs.push({ name: funcMatch[1], type: 'function', line: i + 1 }); continue; }

    // Receiver method: func (recv) Name(
    const methodMatch = trimmed.match(/^func\s*\([^)]*\)\s*(\w+)\s*\(/);
    if (methodMatch) { defs.push({ name: methodMatch[1], type: 'method', line: i + 1 }); continue; }

    // Type definitions: type Name struct/interface/other
    const typeStructMatch = trimmed.match(/^type\s+(\w+)\s+struct\b/);
    if (typeStructMatch) { defs.push({ name: typeStructMatch[1], type: 'struct', line: i + 1 }); continue; }

    const typeIfaceMatch = trimmed.match(/^type\s+(\w+)\s+interface\b/);
    if (typeIfaceMatch) { defs.push({ name: typeIfaceMatch[1], type: 'interface', line: i + 1 }); continue; }

    // type Name = ... or type Name SomeType (alias or defined type)
    const typeOtherMatch = trimmed.match(/^type\s+(\w+)\s+/);
    if (typeOtherMatch) { defs.push({ name: typeOtherMatch[1], type: 'type', line: i + 1 }); continue; }

    // Top-level const/var
    const constMatch = trimmed.match(/^const\s+(\w+)/);
    if (constMatch) { defs.push({ name: constMatch[1], type: 'const', line: i + 1 }); continue; }

    const varMatch = trimmed.match(/^var\s+(\w+)/);
    if (varMatch) { defs.push({ name: varMatch[1], type: 'var', line: i + 1 }); continue; }
  }

  return defs;
}

module.exports = {
  extensions: ['.go'],
  extractImports,
  extractExports,
  extractRoutes,
  extractIdentifiers,
  extractDefinitions,
};
