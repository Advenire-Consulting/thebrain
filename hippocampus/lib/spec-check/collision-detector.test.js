const test = require('node:test');
const assert = require('node:assert/strict');
const {
  detectFileCollisions,
  detectSchemaCollisions,
  detectDanglingSubscribes,
  detectDoubleEmits,
  detectDependencyOrderIssues,
  detectAll,
} = require('./collision-detector.js');

// Fake doc factory. Fills in sane defaults for anything not passed.
function makeDoc(id, overrides = {}) {
  return {
    id,
    filePath: `/fake/${id}.md`,
    data: {
      doc_type: 'spec',
      status: 'proposed',
      touches: { files: [], schema: [], events: { emits: [], subscribes: [] } },
      depends_on: [],
      ...overrides,
    },
  };
}

test('detectFileCollisions returns hard when two docs touch same file without source_lines', () => {
  const docs = [
    makeDoc('a', { touches: { files: [{ path: 'x.js', mode: 'modify', spec_section: 'L10' }], schema: [], events: { emits: [], subscribes: [] } } }),
    makeDoc('b', { touches: { files: [{ path: 'x.js', mode: 'modify', spec_section: 'L20' }], schema: [], events: { emits: [], subscribes: [] } } }),
  ];
  const r = detectFileCollisions(docs);
  assert.equal(r.length, 1);
  assert.equal(r[0].severity, 'hard');
  assert.equal(r[0].path, 'x.js');
});

test('detectFileCollisions returns soft when source_lines do not overlap', () => {
  const docs = [
    makeDoc('a', { touches: { files: [{ path: 'x.js', mode: 'modify', spec_section: 'L10', source_lines: 'L1-L50' }], schema: [], events: { emits: [], subscribes: [] } } }),
    makeDoc('b', { touches: { files: [{ path: 'x.js', mode: 'modify', spec_section: 'L20', source_lines: 'L100-L200' }], schema: [], events: { emits: [], subscribes: [] } } }),
  ];
  const r = detectFileCollisions(docs);
  assert.equal(r[0].severity, 'soft');
});

test('detectFileCollisions returns hard when source_lines overlap', () => {
  const docs = [
    makeDoc('a', { touches: { files: [{ path: 'x.js', mode: 'modify', spec_section: 'L10', source_lines: 'L1-L100' }], schema: [], events: { emits: [], subscribes: [] } } }),
    makeDoc('b', { touches: { files: [{ path: 'x.js', mode: 'modify', spec_section: 'L20', source_lines: 'L50-L150' }], schema: [], events: { emits: [], subscribes: [] } } }),
  ];
  const r = detectFileCollisions(docs);
  assert.equal(r[0].severity, 'hard');
});

test('detectFileCollisions ignores single-doc files', () => {
  const docs = [
    makeDoc('a', { touches: { files: [{ path: 'x.js', mode: 'modify', spec_section: 'L10' }], schema: [], events: { emits: [], subscribes: [] } } }),
  ];
  assert.deepEqual(detectFileCollisions(docs), []);
});

test('detectSchemaCollisions flags same-table hits', () => {
  const docs = [
    makeDoc('a', { touches: { files: [], schema: [{ table: 'notifications', change: 'add_columns', spec_section: 'L10' }], events: { emits: [], subscribes: [] } } }),
    makeDoc('b', { touches: { files: [], schema: [{ table: 'notifications', change: 'add_indexes', spec_section: 'L20' }], events: { emits: [], subscribes: [] } } }),
  ];
  const r = detectSchemaCollisions(docs);
  assert.equal(r.length, 1);
  assert.equal(r[0].table, 'notifications');
  assert.equal(r[0].severity, 'hard');
});

test('detectDanglingSubscribes flags unowned events', () => {
  const docs = [
    makeDoc('a', { touches: { files: [], schema: [], events: { emits: [], subscribes: [{ name: 'ghost.event', spec_section: 'L10' }] } } }),
  ];
  const r = detectDanglingSubscribes(docs);
  assert.equal(r.length, 1);
  assert.equal(r[0].event, 'ghost.event');
  assert.equal(r[0].subscribers.length, 1);
  assert.equal(r[0].subscribers[0].docId, 'a');
});

test('detectDanglingSubscribes accepts in-scope emit', () => {
  const docs = [
    makeDoc('a', { touches: { files: [{ path: 'x.js', mode: 'modify', spec_section: 'L5' }], schema: [], events: { emits: [{ name: 'x.event', from_file: 'x.js', spec_section: 'L10' }], subscribes: [] } } }),
    makeDoc('b', { touches: { files: [], schema: [], events: { emits: [], subscribes: [{ name: 'x.event', spec_section: 'L20' }] } } }),
  ];
  assert.deepEqual(detectDanglingSubscribes(docs), []);
});

test('detectDanglingSubscribes accepts codebase emit', () => {
  const docs = [
    makeDoc('a', { touches: { files: [], schema: [], events: { emits: [], subscribes: [{ name: 'existing.event', spec_section: 'L10' }] } } }),
  ];
  assert.deepEqual(detectDanglingSubscribes(docs, new Set(['existing.event'])), []);
});

test('detectDoubleEmits flags same-file same-name emits', () => {
  const docs = [
    makeDoc('a', { touches: { files: [{ path: 'x.js', mode: 'modify', spec_section: 'L5' }], schema: [], events: { emits: [{ name: 'foo', from_file: 'x.js', spec_section: 'L10' }], subscribes: [] } } }),
    makeDoc('b', { touches: { files: [{ path: 'x.js', mode: 'modify', spec_section: 'L5' }], schema: [], events: { emits: [{ name: 'foo', from_file: 'x.js', spec_section: 'L20' }], subscribes: [] } } }),
  ];
  const r = detectDoubleEmits(docs);
  assert.equal(r.length, 1);
  assert.equal(r[0].event, 'foo');
});

test('detectDependencyOrderIssues flags in-flight depending on proposed', () => {
  const docs = [
    makeDoc('a', { status: 'in-flight', depends_on: [{ doc: 'b', reason: 'needs it' }] }),
    makeDoc('b', { status: 'proposed' }),
  ];
  const r = detectDependencyOrderIssues(docs);
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, 'order_violation');
});

test('detectDependencyOrderIssues flags missing dependency', () => {
  const docs = [
    makeDoc('a', { status: 'in-flight', depends_on: [{ doc: 'nonexistent', reason: 'x' }] }),
  ];
  const r = detectDependencyOrderIssues(docs);
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, 'missing_dependency');
});

// --- intra-doc duplicate entries are not collisions ---

test('detectSchemaCollisions ignores same-doc multi-change entries (add_columns + add_indexes on one table)', () => {
  const docs = [
    makeDoc('a', { touches: { files: [], schema: [
      { table: 'notifications', change: 'add_columns', spec_section: 'L10' },
      { table: 'notifications', change: 'add_indexes', spec_section: 'L20' },
    ], events: { emits: [], subscribes: [] } } }),
  ];
  assert.deepEqual(detectSchemaCollisions(docs), []);
});

test('detectFileCollisions ignores same-doc duplicate file entries', () => {
  const docs = [
    makeDoc('a', { touches: { files: [
      { path: 'x.js', mode: 'modify', spec_section: 'L10' },
      { path: 'x.js', mode: 'modify', spec_section: 'L20' },
    ], schema: [], events: { emits: [], subscribes: [] } } }),
  ];
  assert.deepEqual(detectFileCollisions(docs), []);
});

// --- implements-awareness ---

test('detectFileCollisions skips plan <-> spec-it-implements pair', () => {
  const docs = [
    makeDoc('design', { doc_type: 'spec', touches: { files: [{ path: 'x.js', mode: 'create', spec_section: 'L10' }], schema: [], events: { emits: [], subscribes: [] } } }),
    makeDoc('plan', { doc_type: 'plan', implements: 'design', touches: { files: [{ path: 'x.js', mode: 'create', spec_section: 'L20' }], schema: [], events: { emits: [], subscribes: [] } } }),
  ];
  assert.deepEqual(detectFileCollisions(docs), []);
});

test('detectFileCollisions still flags when a third unrelated doc overlaps an implements pair', () => {
  const docs = [
    makeDoc('design', { doc_type: 'spec', touches: { files: [{ path: 'x.js', mode: 'create', spec_section: 'L10' }], schema: [], events: { emits: [], subscribes: [] } } }),
    makeDoc('plan', { doc_type: 'plan', implements: 'design', touches: { files: [{ path: 'x.js', mode: 'create', spec_section: 'L20' }], schema: [], events: { emits: [], subscribes: [] } } }),
    makeDoc('other', { doc_type: 'spec', touches: { files: [{ path: 'x.js', mode: 'modify', spec_section: 'L30' }], schema: [], events: { emits: [], subscribes: [] } } }),
  ];
  const r = detectFileCollisions(docs);
  assert.equal(r.length, 1);
  assert.equal(r[0].path, 'x.js');
});

test('detectSchemaCollisions skips plan <-> spec-it-implements pair', () => {
  const docs = [
    makeDoc('design', { doc_type: 'spec', touches: { files: [], schema: [{ table: 'notifications', change: 'create', spec_section: 'L10' }], events: { emits: [], subscribes: [] } } }),
    makeDoc('plan', { doc_type: 'plan', implements: 'design', touches: { files: [], schema: [{ table: 'notifications', change: 'create', spec_section: 'L20' }], events: { emits: [], subscribes: [] } } }),
  ];
  assert.deepEqual(detectSchemaCollisions(docs), []);
});

test('detectDoubleEmits skips plan <-> spec-it-implements pair', () => {
  const docs = [
    makeDoc('design', { doc_type: 'spec', touches: { files: [{ path: 'x.js', mode: 'create', spec_section: 'L5' }], schema: [], events: { emits: [{ name: 'foo', from_file: 'x.js', spec_section: 'L10' }], subscribes: [] } } }),
    makeDoc('plan', { doc_type: 'plan', implements: 'design', touches: { files: [{ path: 'x.js', mode: 'create', spec_section: 'L5' }], schema: [], events: { emits: [{ name: 'foo', from_file: 'x.js', spec_section: 'L20' }], subscribes: [] } } }),
  ];
  assert.deepEqual(detectDoubleEmits(docs), []);
});

test('detectAll runs every rule', () => {
  const docs = [makeDoc('a')];
  const r = detectAll(docs);
  assert.ok('fileCollisions' in r);
  assert.ok('schemaCollisions' in r);
  assert.ok('danglingSubscribes' in r);
  assert.ok('doubleEmits' in r);
  assert.ok('dependencyOrderIssues' in r);
});
