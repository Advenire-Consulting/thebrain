const test = require('node:test');
const assert = require('node:assert/strict');
const { parseYaml } = require('./yaml-parser.js');

test('flat scalars', () => {
  const r = parseYaml('foo: bar\nbaz: qux\n');
  assert.deepEqual(r, { foo: 'bar', baz: 'qux' });
});

test('null scalars', () => {
  const r = parseYaml('a: null\nb: ~\nc:\n');
  assert.deepEqual(r, { a: null, b: null, c: {} });
});

test('integer scalars', () => {
  const r = parseYaml('count: 42\nneg: -7\n');
  assert.deepEqual(r, { count: 42, neg: -7 });
});

test('double-quoted strings preserve colons', () => {
  const r = parseYaml('msg: "hello: world"\n');
  assert.deepEqual(r, { msg: 'hello: world' });
});

test('empty inline collections', () => {
  const r = parseYaml('a: []\nb: {}\n');
  assert.deepEqual(r, { a: [], b: {} });
});

test('nested map', () => {
  const r = parseYaml('outer:\n  inner: value\n');
  assert.deepEqual(r, { outer: { inner: 'value' } });
});

test('two levels of nesting', () => {
  const r = parseYaml('a:\n  b:\n    c: deep\n');
  assert.deepEqual(r, { a: { b: { c: 'deep' } } });
});

test('list of scalars', () => {
  const r = parseYaml('items:\n  - one\n  - two\n  - three\n');
  assert.deepEqual(r, { items: ['one', 'two', 'three'] });
});

test('list of maps with single key', () => {
  const r = parseYaml('items:\n  - name: a\n  - name: b\n');
  assert.deepEqual(r, { items: [{ name: 'a' }, { name: 'b' }] });
});

test('list of maps with multiple keys', () => {
  const r = parseYaml('items:\n  - path: file.js\n    mode: modify\n  - path: other.js\n    mode: create\n');
  assert.deepEqual(r, { items: [
    { path: 'file.js', mode: 'modify' },
    { path: 'other.js', mode: 'create' },
  ]});
});

test('full frontmatter-shaped input', () => {
  const input = [
    'doc_type: spec',
    'date: 2026-04-07',
    'status: proposed',
    'feature_area: features/alerts',
    'touches:',
    '  files:',
    '    - path: features/alerts/routes.js',
    '      mode: modify',
    '      spec_section: L145-L171',
    '      source_lines: null',
    '  schema: []',
    '  events:',
    '    emits: []',
    '    subscribes: []',
    'depends_on: []',
    '',
  ].join('\n');
  const r = parseYaml(input);
  assert.equal(r.doc_type, 'spec');
  assert.equal(r.touches.files.length, 1);
  assert.equal(r.touches.files[0].path, 'features/alerts/routes.js');
  assert.equal(r.touches.files[0].source_lines, null);
  assert.deepEqual(r.touches.schema, []);
  assert.deepEqual(r.touches.events.emits, []);
  assert.deepEqual(r.depends_on, []);
});

test('comments and blank lines are ignored', () => {
  const r = parseYaml('# top comment\n\nfoo: bar\n  # indented comment\nbaz: qux\n');
  assert.deepEqual(r, { foo: 'bar', baz: 'qux' });
});

test('throws on odd indentation', () => {
  assert.throws(() => parseYaml('foo:\n bar: baz\n'), /odd indent/);
});

test('throws on malformed key line', () => {
  assert.throws(() => parseYaml('not a key line\n'), /expected "key:"/);
});
