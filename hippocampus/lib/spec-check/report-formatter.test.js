const test = require('node:test');
const assert = require('node:assert/strict');
const { renderReport, renderHumanSummary, renderClaudeIndex } = require('./report-formatter.js');

const emptyCollisions = {
  fileCollisions: [],
  schemaCollisions: [],
  danglingSubscribes: [],
  doubleEmits: [],
  dependencyOrderIssues: [],
};

test('renderReport produces the banner and doc list', () => {
  const docs = [{
    id: 'test-spec',
    lineCount: 100,
    data: { doc_type: 'spec', status: 'proposed' },
  }];
  const out = renderReport({
    docs,
    collisions: emptyCollisions,
    headerless: [],
    meta: { folderCount: 1, docCount: 1 },
  });
  assert.match(out, /=== SPEC CHECK ===/);
  assert.match(out, /Scanned: 1 folders, 1 docs/);
  assert.match(out, /test-spec/);
  assert.match(out, /exit_code: 0/);
});

test('renderReport includes HEADERLESS section when present', () => {
  const out = renderReport({
    docs: [],
    collisions: emptyCollisions,
    headerless: [{ id: 'old-spec', filePath: '/fake/old-spec.md', lineCount: 200 }],
    meta: { folderCount: 1, docCount: 1 },
  });
  assert.match(out, /=== HEADERLESS DOCS/);
  assert.match(out, /\[H1\] \/fake\/old-spec\.md/);
});

test('renderReport returns exit_code 1 on hard collision', () => {
  const out = renderReport({
    docs: [],
    collisions: {
      ...emptyCollisions,
      fileCollisions: [{
        kind: 'file',
        path: 'x.js',
        severity: 'hard',
        entries: [
          { docId: 'a', entry: { spec_section: 'L10' } },
          { docId: 'b', entry: { spec_section: 'L20' } },
        ],
      }],
    },
    headerless: [],
    meta: { folderCount: 1, docCount: 2 },
  });
  assert.match(out, /exit_code: 1/);
  assert.match(out, /\[C1\]/);
  assert.match(out, /x\.js/);
});

test('renderHumanSummary emits zero collisions cleanly', () => {
  const out = renderHumanSummary({ collisions: emptyCollisions, docs: [] });
  assert.match(out, /0 collisions/i);
});

test('renderClaudeIndex emits structured keys', () => {
  const out = renderClaudeIndex({
    docs: [{ id: 'a', filePath: '/x/a.md', data: {} }],
    collisions: emptyCollisions,
    headerless: [],
  });
  assert.match(out, /^docs:/m);
  assert.match(out, /a: \/x\/a\.md/);
  assert.match(out, /conflicts\.files/);
});

test('renderClaudeIndex lists dependency_graph entries', () => {
  const out = renderClaudeIndex({
    docs: [{
      id: 'plan-a',
      filePath: '/x.md',
      data: { doc_type: 'plan', status: 'proposed', implements: 'spec-a', depends_on: [] },
    }],
    collisions: emptyCollisions,
    headerless: [],
  });
  assert.match(out, /dependency_graph/);
  assert.match(out, /plan-a/);
  assert.match(out, /implements: spec-a/);
});
