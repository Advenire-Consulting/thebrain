'use strict';

const RUST_KEYWORDS = new Set([
  'as', 'async', 'await', 'break', 'const', 'continue', 'crate', 'dyn',
  'else', 'enum', 'extern', 'false', 'fn', 'for', 'if', 'impl', 'in',
  'let', 'loop', 'match', 'mod', 'move', 'mut', 'pub', 'ref', 'return',
  'self', 'Self', 'static', 'struct', 'super', 'trait', 'true', 'type',
  'union', 'unsafe', 'use', 'where', 'while', 'yield',
  // Predeclared types
  'bool', 'char', 'str', 'i8', 'i16', 'i32', 'i64', 'i128', 'isize',
  'u8', 'u16', 'u32', 'u64', 'u128', 'usize', 'f32', 'f64',
  // Common stdlib types and macros — filtered to reduce noise
  'String', 'Vec', 'Option', 'Result', 'Box', 'Some', 'None', 'Ok', 'Err',
  'println', 'eprintln', 'format', 'todo', 'unimplemented', 'unreachable',
  'assert', 'debug_assert', 'cfg',
]);

const MIN_IDENTIFIER_LENGTH = 3;

function extractImports(filePath, content) {
  const imports = [];
  let match;

  // use crate::path; or use crate::path::Name;
  const cratePattern = /use\s+(crate::\S+?)(?:::\{|;)/g;
  while ((match = cratePattern.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // use super::path; or use super::path::{items};
  const superPattern = /use\s+(super::\S+?)(?:::\{|;)/g;
  while ((match = superPattern.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // mod name; (not mod name { ... })
  const modPattern = /^mod\s+(\w+)\s*;/gm;
  while ((match = modPattern.exec(content)) !== null) {
    imports.push(match[1]);
  }

  return [...new Set(imports.filter(i =>
    !i.startsWith('std::') && !i.startsWith('core::') && !i.startsWith('alloc::')
  ))];
}

function extractExports(filePath, content) {
  const exports_ = [];
  // pub fn/struct/enum/trait/type/mod/const/static Name
  const pattern = /pub(?:\(\w+\))?\s+(?:async\s+)?(?:unsafe\s+)?(?:fn|struct|enum|trait|type|mod|const|static)\s+(\w+)/g;
  let match;
  while ((match = pattern.exec(content)) !== null) {
    exports_.push(match[1]);
  }
  return exports_;
}

function extractRoutes(filePath, content) {
  const routes = [];
  let match;

  // Actix/Rocket: #[get("/path")], #[post("/path")], etc.
  const attrPattern = /#\[(get|post|put|delete|patch)\("([^"]+)"\)\]/g;
  while ((match = attrPattern.exec(content)) !== null) {
    routes.push(match[1].toUpperCase() + ' ' + match[2]);
  }

  // Axum: .route("/path", get(handler))
  const axumPattern = /\.route\(\s*"([^"]+)"\s*,\s*(get|post|put|patch|delete)\s*\(/g;
  while ((match = axumPattern.exec(content)) !== null) {
    routes.push(match[2].toUpperCase() + ' ' + match[1]);
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
    if (RUST_KEYWORDS.has(term)) continue;
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

    // async fn — check before regular fn
    const asyncFnMatch = trimmed.match(/(?:pub(?:\(\w+\))?\s+)?async\s+(?:unsafe\s+)?fn\s+(\w+)/);
    if (asyncFnMatch) { defs.push({ name: asyncFnMatch[1], type: 'async_function', line: i + 1 }); continue; }

    // Regular fn (not async)
    const fnMatch = trimmed.match(/(?:pub(?:\(\w+\))?\s+)?(?:unsafe\s+)?fn\s+(\w+)/);
    if (fnMatch) { defs.push({ name: fnMatch[1], type: 'function', line: i + 1 }); continue; }

    // struct
    const structMatch = trimmed.match(/(?:pub(?:\(\w+\))?\s+)?struct\s+(\w+)/);
    if (structMatch) { defs.push({ name: structMatch[1], type: 'struct', line: i + 1 }); continue; }

    // enum
    const enumMatch = trimmed.match(/(?:pub(?:\(\w+\))?\s+)?enum\s+(\w+)/);
    if (enumMatch) { defs.push({ name: enumMatch[1], type: 'enum', line: i + 1 }); continue; }

    // trait
    const traitMatch = trimmed.match(/(?:pub(?:\(\w+\))?\s+)?trait\s+(\w+)/);
    if (traitMatch) { defs.push({ name: traitMatch[1], type: 'trait', line: i + 1 }); continue; }

    // impl Name or impl Trait for Name
    const implForMatch = trimmed.match(/^impl(?:<[^>]*>)?\s+(\w+)\s+for\s+(\w+)/);
    if (implForMatch) { defs.push({ name: implForMatch[1] + ' for ' + implForMatch[2], type: 'impl', line: i + 1 }); continue; }

    const implMatch = trimmed.match(/^impl(?:<[^>]*>)?\s+(\w+)/);
    if (implMatch) { defs.push({ name: implMatch[1], type: 'impl', line: i + 1 }); continue; }

    // type
    const typeMatch = trimmed.match(/(?:pub(?:\(\w+\))?\s+)?type\s+(\w+)/);
    if (typeMatch) { defs.push({ name: typeMatch[1], type: 'type', line: i + 1 }); continue; }

    // mod
    const modMatch = trimmed.match(/(?:pub(?:\(\w+\))?\s+)?mod\s+(\w+)/);
    if (modMatch) { defs.push({ name: modMatch[1], type: 'mod', line: i + 1 }); continue; }

    // const
    const constMatch = trimmed.match(/(?:pub(?:\(\w+\))?\s+)?const\s+(\w+)/);
    if (constMatch) { defs.push({ name: constMatch[1], type: 'const', line: i + 1 }); continue; }

    // static
    const staticMatch = trimmed.match(/(?:pub(?:\(\w+\))?\s+)?static\s+(?:mut\s+)?(\w+)/);
    if (staticMatch) { defs.push({ name: staticMatch[1], type: 'static', line: i + 1 }); continue; }
  }

  return defs;
}

module.exports = {
  extensions: ['.rs'],
  extractImports,
  extractExports,
  extractRoutes,
  extractIdentifiers,
  extractDefinitions,
};
