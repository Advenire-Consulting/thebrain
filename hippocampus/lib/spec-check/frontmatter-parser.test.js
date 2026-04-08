const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFrontmatter } = require('./frontmatter-parser.js');

// A valid spec frontmatter for baseline tests.
const VALID_SPEC = [
  '---',
  'doc_type: spec',
  'date: 2026-04-07',
  'status: proposed',
  'feature_area: features/x',
  'touches:',
  '  files:',
  '    - path: features/x/routes.js',
  '      mode: modify',
  '      spec_section: L10-L50',
  '  schema: []',
  '  events:',
  '    emits: []',
  '    subscribes: []',
  'depends_on: []',
  '---',
  '',
  '# Body',
].join('\n');

test('parses a valid spec frontmatter', () => {
  const r = parseFrontmatter(VALID_SPEC, 'test.md');
  assert.equal(r.ok, true);
  assert.equal(r.data.doc_type, 'spec');
});

test('rejects a file with no frontmatter', () => {
  const r = parseFrontmatter('# just a heading\n', 'test.md');
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].code, 'HEADERLESS');
});

test('rejects a file with unterminated frontmatter', () => {
  const r = parseFrontmatter('---\ndoc_type: spec\n', 'test.md');
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].code, 'UNTERMINATED');
});

test('rejects missing required scalar', () => {
  const broken = VALID_SPEC.replace('doc_type: spec\n', '');
  const r = parseFrontmatter(broken, 'test.md');
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.code === 'MISSING_FIELD'));
});

test('rejects invalid enum', () => {
  const broken = VALID_SPEC.replace('status: proposed', 'status: maybe');
  const r = parseFrontmatter(broken, 'test.md');
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.code === 'INVALID_ENUM'));
});

test('rejects invalid date format', () => {
  const broken = VALID_SPEC.replace('date: 2026-04-07', 'date: April 7');
  const r = parseFrontmatter(broken, 'test.md');
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.code === 'INVALID_DATE'));
});

test('rejects invalid line ref', () => {
  const broken = VALID_SPEC.replace('spec_section: L10-L50', 'spec_section: 10-50');
  const r = parseFrontmatter(broken, 'test.md');
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.code === 'INVALID_LINE_REF'));
});

test('enforces from_file must appear in touches.files', () => {
  const withBadEmit = VALID_SPEC.replace(
    '    emits: []',
    '    emits:\n      - name: thread.renamed\n        from_file: features/threads/routes.js\n        spec_section: L100'
  );
  const r = parseFrontmatter(withBadEmit, 'test.md');
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.code === 'EMIT_FILE_NOT_LISTED'));
});

test('accepts emit whose from_file IS in touches.files', () => {
  const withGoodEmit = VALID_SPEC.replace(
    '    emits: []',
    '    emits:\n      - name: thread.renamed\n        from_file: features/x/routes.js\n        spec_section: L100'
  );
  const r = parseFrontmatter(withGoodEmit, 'test.md');
  assert.equal(r.ok, true, JSON.stringify(r.errors));
});

test('rejects non-kebab implements id', () => {
  const plan = VALID_SPEC.replace('doc_type: spec', 'doc_type: plan')
    .replace('feature_area: features/x', 'feature_area: features/x\nimplements: Spec With Spaces');
  const r = parseFrontmatter(plan, 'test.md');
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.code === 'INVALID_ID'));
});
