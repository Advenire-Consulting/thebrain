// Frontmatter parser for spec/plan markdown files.
// Extracts the --- ... --- block, parses it as YAML, validates against the canonical schema,
// and enforces cross-field rules (from_file must appear in touches.files).

const { parseYaml } = require('./yaml-parser.js');
const { SCHEMA } = require('./schema.js');

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const LINE_REF_RE = /^L\d+(-L\d+)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Parse the frontmatter block from a markdown file's contents.
function parseFrontmatter(fileContents, filePath) {
  const lines = fileContents.split('\n');
  if (lines[0] !== '---') {
    return { ok: false, errors: [{ code: 'HEADERLESS', message: `${filePath}: no frontmatter block` }] };
  }
  let endLine = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') { endLine = i; break; }
  }
  if (endLine === -1) {
    return { ok: false, errors: [{ code: 'UNTERMINATED', message: `${filePath}: frontmatter not terminated` }] };
  }
  const body = lines.slice(1, endLine).join('\n');
  let data;
  try {
    data = parseYaml(body);
  } catch (err) {
    return { ok: false, errors: [{ code: 'YAML_ERROR', message: `${filePath}: ${err.message}` }] };
  }
  const errors = validate(data, filePath);
  if (errors.length) return { ok: false, errors };
  return { ok: true, data, rawStartLine: 1, rawEndLine: endLine + 1 };
}

// Validate a parsed frontmatter object against SCHEMA + cross-field rules.
function validate(data, filePath) {
  const errors = [];
  const ctx = filePath;

  // Required scalars.
  for (const [field, def] of Object.entries(SCHEMA.required)) {
    if (data[field] === undefined || data[field] === null) {
      errors.push({ code: 'MISSING_FIELD', message: `${ctx}: required field "${field}" missing` });
      continue;
    }
    if (def.type === 'enum' && !def.values.includes(data[field])) {
      errors.push({ code: 'INVALID_ENUM', message: `${ctx}: ${field}=${data[field]} not in [${def.values.join(', ')}]` });
    }
    if (def.type === 'date' && !DATE_RE.test(data[field])) {
      errors.push({ code: 'INVALID_DATE', message: `${ctx}: ${field}="${data[field]}" not YYYY-MM-DD` });
    }
    if (def.type === 'string' && typeof data[field] !== 'string') {
      errors.push({ code: 'INVALID_TYPE', message: `${ctx}: ${field} must be a string` });
    }
  }

  // Required arrays — must exist (may be empty).
  for (const arrPath of Object.keys(SCHEMA.requiredArrays)) {
    const arr = getPath(data, arrPath);
    if (!Array.isArray(arr)) {
      errors.push({ code: 'MISSING_ARRAY', message: `${ctx}: ${arrPath} must be an array (possibly empty)` });
      continue;
    }
    const itemShape = SCHEMA.requiredArrays[arrPath].itemShape;
    arr.forEach((item, idx) => {
      for (const [key, spec] of Object.entries(itemShape)) {
        if (spec.required && (item[key] === undefined || (item[key] === null && !spec.nullable))) {
          errors.push({ code: 'MISSING_ITEM_FIELD', message: `${ctx}: ${arrPath}[${idx}].${key} required` });
          continue;
        }
        if (item[key] === undefined || item[key] === null) continue;
        if (spec.type === 'enum' && !spec.values.includes(item[key])) {
          errors.push({ code: 'INVALID_ENUM', message: `${ctx}: ${arrPath}[${idx}].${key}=${item[key]} not in [${spec.values.join(', ')}]` });
        }
        if (spec.type === 'line_ref' && !LINE_REF_RE.test(item[key])) {
          errors.push({ code: 'INVALID_LINE_REF', message: `${ctx}: ${arrPath}[${idx}].${key}="${item[key]}" must match L<n> or L<n>-L<n>` });
        }
      }
    });
  }

  // Cross-field rule: every emits[].from_file must appear in touches.files[].path.
  const emits = getPath(data, 'touches.events.emits') || [];
  const files = getPath(data, 'touches.files') || [];
  const filePaths = new Set(files.map(f => f.path));
  for (const emit of emits) {
    if (emit.from_file && !filePaths.has(emit.from_file)) {
      errors.push({
        code: 'EMIT_FILE_NOT_LISTED',
        message: `${ctx}: emits "${emit.name}" from_file=${emit.from_file} but not in touches.files`,
      });
    }
  }

  // id format: implements + depends_on[].doc must be kebab-case.
  if (data.implements !== undefined && data.implements !== null) {
    if (typeof data.implements !== 'string' || !ID_RE.test(data.implements)) {
      errors.push({ code: 'INVALID_ID', message: `${ctx}: implements="${data.implements}" not kebab-case` });
    }
  }
  for (const dep of (data.depends_on || [])) {
    if (dep.doc && !ID_RE.test(dep.doc)) {
      errors.push({ code: 'INVALID_ID', message: `${ctx}: depends_on.doc="${dep.doc}" not kebab-case` });
    }
  }

  return errors;
}

// Dot-path getter: getPath(obj, 'touches.events.emits') walks the nested structure.
function getPath(obj, dotted) {
  return dotted.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

module.exports = { parseFrontmatter };
