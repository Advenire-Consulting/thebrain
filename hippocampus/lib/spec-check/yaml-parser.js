// Hand-rolled YAML subset parser for spec-check frontmatter.
// Supports: flat scalars, nested maps, lists of scalars, lists of maps, quoted/unquoted
// strings, null, empty collections ([], {}), comments (full-line only).
// Does NOT support: anchors, aliases, multi-line strings, flow-style maps, inline comments,
// tags, explicit type coercion. If it needs more, widen the subset deliberately — do not
// reach for js-yaml.

// Parse YAML text into a JS value (object, array, string, number, null).
function parseYaml(text) {
  const lines = text.split('\n').map((raw, i) => ({ raw, lineNum: i + 1 }));
  const tokens = [];
  for (const { raw, lineNum } of lines) {
    const stripped = raw.replace(/\s+$/, '');
    if (stripped.trim() === '' || stripped.trim().startsWith('#')) continue;
    const indent = stripped.match(/^ */)[0].length;
    if (indent % 2 !== 0) {
      throw new Error(`yaml-parser: odd indent ${indent} at line ${lineNum}`);
    }
    tokens.push({ indent, content: stripped.slice(indent), lineNum });
  }
  const [value, consumed] = parseValue(tokens, 0, 0);
  if (consumed < tokens.length) {
    throw new Error(`yaml-parser: trailing content at line ${tokens[consumed].lineNum}`);
  }
  return value;
}

// Parse a value starting at tokens[start], expected at `indent` depth.
// Returns [parsedValue, indexOfNextToken].
function parseValue(tokens, start, indent) {
  if (start >= tokens.length) return [null, start];
  const first = tokens[start];
  if (first.content.startsWith('- ') || first.content === '-') {
    return parseList(tokens, start, indent);
  }
  return parseMap(tokens, start, indent);
}

// Parse a map at the given indent. Returns [obj, nextIndex].
function parseMap(tokens, start, indent) {
  const obj = {};
  let i = start;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.indent < indent) break;
    if (tok.indent > indent) {
      throw new Error(`yaml-parser: unexpected indent at line ${tok.lineNum}`);
    }
    const match = tok.content.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!match) {
      throw new Error(`yaml-parser: expected "key:" at line ${tok.lineNum} — got "${tok.content}"`);
    }
    const key = match[1];
    const inline = match[2];
    if (inline === '') {
      // Nested value on following lines at +2 indent.
      i++;
      if (i >= tokens.length || tokens[i].indent <= indent) {
        // Empty nested — treat as empty object.
        obj[key] = {};
        continue;
      }
      const [nested, next] = parseValue(tokens, i, indent + 2);
      obj[key] = nested;
      i = next;
    } else {
      // Inline scalar.
      obj[key] = parseScalar(inline);
      i++;
    }
  }
  return [obj, i];
}

// Parse a list at the given indent. Returns [arr, nextIndex].
function parseList(tokens, start, indent) {
  const arr = [];
  let i = start;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.indent < indent) break;
    if (tok.indent > indent) {
      throw new Error(`yaml-parser: unexpected list indent at line ${tok.lineNum}`);
    }
    if (!tok.content.startsWith('-')) break;
    const after = tok.content.slice(1).replace(/^\s*/, '');
    if (after === '') {
      // Bare "-" — nested value on next line.
      i++;
      if (i < tokens.length && tokens[i].indent > indent) {
        const [nested, next] = parseValue(tokens, i, tokens[i].indent);
        arr.push(nested);
        i = next;
      } else {
        arr.push(null);
      }
      continue;
    }
    const match = after.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (match) {
      // List item opens a map. First key is on this line; continuation keys at indent+2.
      const key = match[1];
      const inline = match[2];
      const item = {};
      if (inline === '') {
        // Key with nested value below.
        i++;
        if (i < tokens.length && tokens[i].indent > indent + 2) {
          const [nested, next] = parseValue(tokens, i, tokens[i].indent);
          item[key] = nested;
          i = next;
        } else {
          item[key] = {};
        }
      } else {
        item[key] = parseScalar(inline);
        i++;
      }
      // Continuation keys: collect the span of tokens at indent+2 that don't start with "-"
      // and parse them as a sub-map to handle any number of keys cleanly.
      const contStart = i;
      while (i < tokens.length && tokens[i].indent === indent + 2 && !tokens[i].content.startsWith('-')) {
        i++;
      }
      if (i > contStart) {
        const [more] = parseMap(tokens.slice(contStart, i), 0, indent + 2);
        Object.assign(item, more);
      }
      arr.push(item);
    } else {
      // Scalar list item.
      arr.push(parseScalar(after));
      i++;
    }
  }
  return [arr, i];
}

// Parse an inline scalar. Handles quoted strings, null, [], {}, numbers, and raw strings.
function parseScalar(raw) {
  const s = raw.trim();
  if (s === '' || s === 'null' || s === '~') return null;
  if (s === '[]') return [];
  if (s === '{}') return {};
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) {
    return s.slice(1, -1).replace(/''/g, "'");
  }
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  return s;
}

module.exports = { parseYaml };
