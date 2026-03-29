'use strict';

const CSHARP_KEYWORDS = new Set([
  'abstract', 'as', 'base', 'bool', 'break', 'byte', 'case', 'catch', 'char',
  'checked', 'class', 'const', 'continue', 'decimal', 'default', 'delegate',
  'do', 'double', 'else', 'enum', 'event', 'explicit', 'extern', 'false',
  'finally', 'fixed', 'float', 'for', 'foreach', 'goto', 'if', 'implicit',
  'in', 'int', 'interface', 'internal', 'is', 'lock', 'long', 'namespace',
  'new', 'null', 'object', 'operator', 'out', 'override', 'params', 'private',
  'protected', 'public', 'readonly', 'record', 'ref', 'return', 'sbyte',
  'sealed', 'short', 'sizeof', 'stackalloc', 'static', 'string', 'struct',
  'switch', 'this', 'throw', 'true', 'try', 'typeof', 'uint', 'ulong',
  'unchecked', 'unsafe', 'ushort', 'using', 'var', 'virtual', 'void',
  'volatile', 'while', 'async', 'await', 'get', 'set', 'value', 'yield',
  'partial', 'where', 'when', 'dynamic', 'nint', 'nuint',
]);

const MIN_IDENTIFIER_LENGTH = 3;

// Keywords that look like method calls in control flow
const CONTROL_FLOW = new Set([
  'if', 'for', 'foreach', 'while', 'switch', 'catch', 'lock', 'using', 'when',
  'typeof', 'sizeof', 'nameof', 'default',
]);

// Type declaration keywords — lines with these aren't methods
const TYPE_DECL = /\b(class|struct|interface|enum|record|namespace|delegate)\s+/;

function extractImports(filePath, content) {
  const imports = [];
  // using Namespace; and using static Namespace.Class;
  const pattern = /using\s+(?:static\s+)?([A-Z][\w.]+)\s*;/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const ns = match[1];
    // Skip System.* and Microsoft.* standard library namespaces
    if (ns.startsWith('System') || ns.startsWith('Microsoft')) continue;
    imports.push(ns);
  }
  return [...new Set(imports)];
}

function extractExports(filePath, content) {
  const exports_ = [];
  // public [modifiers] (class|struct|interface|enum|record) Name
  const pattern = /public\s+(?:(?:static|abstract|sealed|partial)\s+)*(?:class|struct|interface|enum|record)\s+(\w+)/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    exports_.push(match[1]);
  }
  return exports_;
}

function extractRoutes(filePath, content) {
  const routes = [];
  let match;

  // ASP.NET attribute routes: [HttpGet("path")], [HttpPost("path")], etc.
  const httpPattern = /\[Http(Get|Post|Put|Delete|Patch)\("([^"]+)"\)\]/g;
  while ((match = httpPattern.exec(content)) !== null) {
    routes.push(match[1].toUpperCase() + ' ' + match[2]);
  }

  // [Route("path")]
  const routePattern = /\[Route\("([^"]+)"\)\]/g;
  while ((match = routePattern.exec(content)) !== null) {
    routes.push('ROUTE ' + match[1]);
  }

  // Minimal API: app.MapGet("/path", ...), endpoints.MapPost("/path", ...), etc.
  const minimalPattern = /\w+\.Map(Get|Post|Put|Delete|Patch)\(\s*"([^"]+)"/g;
  while ((match = minimalPattern.exec(content)) !== null) {
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
    if (CSHARP_KEYWORDS.has(term)) continue;
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
    const trimmed = line.trim();

    // Type declarations: class, struct, interface, enum, record
    const classMatch = trimmed.match(/\bclass\s+(\w+)/);
    if (classMatch) { defs.push({ name: classMatch[1], type: 'class', line: i + 1 }); continue; }

    const structMatch = trimmed.match(/\bstruct\s+(\w+)/);
    if (structMatch) { defs.push({ name: structMatch[1], type: 'struct', line: i + 1 }); continue; }

    const ifaceMatch = trimmed.match(/\binterface\s+(\w+)/);
    if (ifaceMatch) { defs.push({ name: ifaceMatch[1], type: 'interface', line: i + 1 }); continue; }

    const enumMatch = trimmed.match(/\benum\s+(\w+)/);
    if (enumMatch) { defs.push({ name: enumMatch[1], type: 'enum', line: i + 1 }); continue; }

    const recordMatch = trimmed.match(/\brecord\s+(\w+)/);
    if (recordMatch) { defs.push({ name: recordMatch[1], type: 'record', line: i + 1 }); continue; }

    // Method detection: indented lines with name( that aren't type decls or control flow
    if (TYPE_DECL.test(trimmed)) continue;
    const indent = line.match(/^(\s*)/)[1].length;
    if (indent === 0) continue;
    const methodMatch = trimmed.match(/(\w+)\s*\(/);
    if (methodMatch) {
      const name = methodMatch[1];
      if (CONTROL_FLOW.has(name)) continue;
      // Heuristic: method declarations have at least one word before the method name
      const beforeName = trimmed.slice(0, methodMatch.index).trim();
      if (beforeName.length === 0) continue;
      defs.push({ name, type: 'method', line: i + 1 });
    }
  }

  return defs;
}

module.exports = {
  extensions: ['.cs'],
  extractImports,
  extractExports,
  extractRoutes,
  extractIdentifiers,
  extractDefinitions,
};
