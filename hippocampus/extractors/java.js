'use strict';

const JAVA_KEYWORDS = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char',
  'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
  'extends', 'false', 'final', 'finally', 'float', 'for', 'goto', 'if',
  'implements', 'import', 'instanceof', 'int', 'interface', 'long', 'native',
  'new', 'null', 'package', 'private', 'protected', 'public', 'return',
  'short', 'static', 'strictfp', 'super', 'switch', 'synchronized', 'this',
  'throw', 'throws', 'transient', 'true', 'try', 'var', 'void', 'volatile',
  'while', 'yield', 'record', 'sealed', 'permits',
  // Common stdlib identifiers — filtered to reduce noise
  'String', 'System', 'Override',
]);

const MIN_IDENTIFIER_LENGTH = 3;

const CONTROL_FLOW = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'synchronized', 'assert',
  'typeof', 'instanceof',
]);

const TYPE_DECL = /\b(class|interface|enum|record|@interface)\s+/;

function extractImports(filePath, content) {
  const imports = [];
  // import [static] package.Class;
  const pattern = /import\s+(?:static\s+)?([\w.]+)\s*;/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    const pkg = match[1];
    if (pkg.startsWith('java.') || pkg.startsWith('javax.') ||
        pkg.startsWith('jakarta.') || pkg.startsWith('sun.') ||
        pkg.startsWith('com.sun.')) continue;
    imports.push(pkg);
  }
  return [...new Set(imports)];
}

function extractExports(filePath, content) {
  const exports_ = [];
  // public [modifiers] (class|abstract class|interface|enum|record) Name
  const pattern = /public\s+(?:(?:abstract|final|sealed|static)\s+)*(?:class|interface|enum|record)\s+(\w+)/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    exports_.push(match[1]);
  }
  // public @interface Name (annotations)
  const annotPattern = /public\s+@interface\s+(\w+)/g;
  while ((match = annotPattern.exec(content)) !== null) {
    exports_.push(match[1]);
  }
  return exports_;
}

function extractRoutes(filePath, content) {
  const routes = [];
  let match;

  // Spring: @GetMapping("/path"), @PostMapping("/path"), etc.
  const springPattern = /@(Get|Post|Put|Delete|Patch)Mapping\(\s*"([^"]+)"/g;
  while ((match = springPattern.exec(content)) !== null) {
    routes.push(match[1].toUpperCase() + ' ' + match[2]);
  }

  // Spring: @RequestMapping("/path")
  const reqMapPattern = /@RequestMapping\(\s*"([^"]+)"/g;
  while ((match = reqMapPattern.exec(content)) !== null) {
    routes.push('ROUTE ' + match[1]);
  }

  // JAX-RS: @Path("/path")
  const pathPattern = /@Path\(\s*"([^"]+)"/g;
  while ((match = pathPattern.exec(content)) !== null) {
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
    if (JAVA_KEYWORDS.has(term)) continue;
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

    // Type declarations
    const classMatch = trimmed.match(/\bclass\s+(\w+)/);
    if (classMatch) { defs.push({ name: classMatch[1], type: 'class', line: i + 1 }); continue; }

    const ifaceMatch = trimmed.match(/\binterface\s+(\w+)/);
    // Distinguish @interface (annotation) from interface
    if (ifaceMatch) {
      const isAnnotation = trimmed.match(/@interface\s+(\w+)/);
      if (isAnnotation) {
        defs.push({ name: isAnnotation[1], type: 'annotation', line: i + 1 });
      } else {
        defs.push({ name: ifaceMatch[1], type: 'interface', line: i + 1 });
      }
      continue;
    }

    const enumMatch = trimmed.match(/\benum\s+(\w+)/);
    if (enumMatch) { defs.push({ name: enumMatch[1], type: 'enum', line: i + 1 }); continue; }

    const recordMatch = trimmed.match(/\brecord\s+(\w+)/);
    if (recordMatch) { defs.push({ name: recordMatch[1], type: 'record', line: i + 1 }); continue; }

    // Method detection: indented, has name(, not a type decl or control flow
    if (TYPE_DECL.test(trimmed)) continue;
    const indent = line.match(/^(\s*)/)[1].length;
    if (indent === 0) continue;
    const methodMatch = trimmed.match(/(\w+)\s*\(/);
    if (methodMatch) {
      const name = methodMatch[1];
      if (CONTROL_FLOW.has(name)) continue;
      const beforeName = trimmed.slice(0, methodMatch.index).trim();
      if (beforeName.length === 0) continue;
      defs.push({ name, type: 'method', line: i + 1 });
    }
  }

  return defs;
}

module.exports = {
  extensions: ['.java'],
  extractImports,
  extractExports,
  extractRoutes,
  extractIdentifiers,
  extractDefinitions,
};
