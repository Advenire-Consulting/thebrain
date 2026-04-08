const test = require('node:test');
const assert = require('node:assert/strict');
const {
  listChunks,
  extractPlanHeader,
  extractChunkBody,
  filterPriorObservations,
  assembleAssignment,
  computeDispatchPayloads,
} = require('./chunk-extractor.js');

const SAMPLE_PLAN = [
  '# Plan Title',
  '',
  '**Goal:** Build a thing.',
  '',
  '## Architecture decisions',
  '',
  '1. Decision one.',
  '2. Decision two.',
  '',
  '## Chunk 1 — First chunk',
  '',
  '**Goal:** First.',
  '',
  'Body of chunk 1.',
  '',
  '## Chunk 2 — Second chunk',
  '',
  '**Goal:** Second.',
  '',
  'Body of chunk 2.',
  '',
  '## Sonnet handoff prompts',
  '',
  'Trailing handoff content (should be excluded from chunk 2).',
].join('\n');

test('listChunks finds both chunks', () => {
  const chunks = listChunks(SAMPLE_PLAN);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].number, 1);
  assert.equal(chunks[0].name, 'First chunk');
  assert.equal(chunks[1].number, 2);
  assert.equal(chunks[1].name, 'Second chunk');
});

test('listChunks computes line ranges (1-indexed)', () => {
  const chunks = listChunks(SAMPLE_PLAN);
  // Chunk 1 starts at line 10 ("## Chunk 1 — First chunk")
  assert.equal(chunks[0].startLine, 10);
  // Chunk 2 starts at line 16
  assert.equal(chunks[1].startLine, 16);
  // Chunk 2 ends at line before "## Sonnet handoff prompts" (line 22) → line 21
  assert.equal(chunks[1].endLine, 21);
});

test('extractPlanHeader returns everything before first chunk', () => {
  const header = extractPlanHeader(SAMPLE_PLAN);
  assert.match(header, /# Plan Title/);
  assert.match(header, /Architecture decisions/);
  assert.match(header, /Decision one\./);
  assert.doesNotMatch(header, /Chunk 1/);
});

test('extractChunkBody returns the chunk slice', () => {
  const body = extractChunkBody(SAMPLE_PLAN, 1);
  assert.match(body, /## Chunk 1 — First chunk/);
  assert.match(body, /Body of chunk 1\./);
  assert.doesNotMatch(body, /Chunk 2/);
});

test('extractChunkBody returns null for missing chunk', () => {
  assert.equal(extractChunkBody(SAMPLE_PLAN, 99), null);
});

test('extractChunkBody for last chunk excludes terminal sections', () => {
  const body = extractChunkBody(SAMPLE_PLAN, 2);
  assert.match(body, /Body of chunk 2/);
  assert.doesNotMatch(body, /Trailing handoff content/);
  assert.doesNotMatch(body, /Sonnet handoff prompts/);
});

test('filterPriorObservations returns empty when chunkNumber is 1', () => {
  const obs = '## Chunk 1 — 2026-04-07\n\nNote.\n';
  assert.equal(filterPriorObservations(obs, 1), '');
});

test('filterPriorObservations returns only prior chunks', () => {
  const obs = [
    '## Chunk 1 — 2026-04-07',
    '',
    'First note.',
    '',
    '## Chunk 2 — 2026-04-07',
    '',
    'Second note.',
  ].join('\n');
  const filtered = filterPriorObservations(obs, 3);
  assert.match(filtered, /Chunk 1/);
  assert.match(filtered, /First note/);
  assert.match(filtered, /Chunk 2/);
  assert.match(filtered, /Second note/);
});

test('filterPriorObservations excludes own and future chunks', () => {
  const obs = [
    '## Chunk 1 — 2026-04-07',
    '',
    'First.',
    '',
    '## Chunk 2 — 2026-04-07',
    '',
    'Second.',
    '',
    '## Chunk 3 — 2026-04-07',
    '',
    'Third.',
  ].join('\n');
  const filtered = filterPriorObservations(obs, 2);
  assert.match(filtered, /First/);
  assert.doesNotMatch(filtered, /Second/);
  assert.doesNotMatch(filtered, /Third/);
});

test('assembleAssignment includes preamble, header, and chunk body', () => {
  const out = assembleAssignment({
    planPath: '/fake/plan.md',
    planContents: SAMPLE_PLAN,
    chunkNumber: 1,
  });
  assert.match(out, /## Sonnet assignment — Chunk 1/);
  assert.match(out, /Standing rules:/);
  assert.match(out, /Do NOT restart services/);
  assert.match(out, /Architecture decisions/);
  assert.match(out, /Body of chunk 1/);
});

test('assembleAssignment omits Prior agent observations section when chunk 1', () => {
  const out = assembleAssignment({
    planPath: '/fake/plan.md',
    planContents: SAMPLE_PLAN,
    chunkNumber: 1,
    observations: '## Chunk 1 — 2026-04-07\n\nFake.\n',
  });
  assert.doesNotMatch(out, /Prior agent observations/);
});

test('assembleAssignment includes Prior agent observations when relevant', () => {
  const out = assembleAssignment({
    planPath: '/fake/plan.md',
    planContents: SAMPLE_PLAN,
    chunkNumber: 2,
    observations: '## Chunk 1 — 2026-04-07\n\nPrior chunk note.\n',
  });
  assert.match(out, /## Prior agent observations/);
  assert.match(out, /Prior chunk note/);
});

test('assembleAssignment throws on missing chunk', () => {
  assert.throws(() => assembleAssignment({
    planPath: '/fake/plan.md',
    planContents: SAMPLE_PLAN,
    chunkNumber: 99,
  }), /chunk 99 not found/);
});

test('computeDispatchPayloads returns one payload per chunk', () => {
  const payloads = computeDispatchPayloads({
    planPath: '/fake/dir/2026-04-08-my-plan.md',
    planContents: SAMPLE_PLAN,
  });
  assert.equal(payloads.length, 2);
  assert.equal(payloads[0].chunkNumber, 1);
  assert.equal(payloads[1].chunkNumber, 2);
});

test('computeDispatchPayloads builds deterministic file paths under <plan-dir>/chunks/', () => {
  const payloads = computeDispatchPayloads({
    planPath: '/fake/dir/2026-04-08-my-plan.md',
    planContents: SAMPLE_PLAN,
  });
  assert.equal(payloads[0].fileName, '2026-04-08-my-plan-chunk-1.md');
  assert.equal(payloads[0].filePath, '/fake/dir/chunks/2026-04-08-my-plan-chunk-1.md');
  assert.equal(payloads[1].fileName, '2026-04-08-my-plan-chunk-2.md');
  assert.equal(payloads[1].filePath, '/fake/dir/chunks/2026-04-08-my-plan-chunk-2.md');
});

test('computeDispatchPayloads content matches assembleAssignment for each chunk', () => {
  const payloads = computeDispatchPayloads({
    planPath: '/fake/dir/plan.md',
    planContents: SAMPLE_PLAN,
  });
  const expected1 = assembleAssignment({
    planPath: '/fake/dir/plan.md',
    planContents: SAMPLE_PLAN,
    chunkNumber: 1,
  });
  assert.equal(payloads[0].content, expected1);
});

test('computeDispatchPayloads threads observations through to each chunk', () => {
  const observations = '## Chunk 1 — 2026-04-08\n\nNoted for chunk 2.\n';
  const payloads = computeDispatchPayloads({
    planPath: '/fake/dir/plan.md',
    planContents: SAMPLE_PLAN,
    observations,
  });
  // chunk 1 should NOT see its own observations (prior-only filter)
  assert.doesNotMatch(payloads[0].content, /Noted for chunk 2/);
  // chunk 2 should see chunk 1's observations
  assert.match(payloads[1].content, /Noted for chunk 2/);
  assert.match(payloads[1].content, /Prior agent observations/);
});

test('computeDispatchPayloads readInstruction matches file path', () => {
  const payloads = computeDispatchPayloads({
    planPath: '/fake/dir/plan.md',
    planContents: SAMPLE_PLAN,
  });
  assert.equal(payloads[0].readInstruction, 'Read /fake/dir/chunks/plan-chunk-1.md and execute it.');
});

test('computeDispatchPayloads returns empty array when no chunks present', () => {
  const payloads = computeDispatchPayloads({
    planPath: '/fake/dir/plan.md',
    planContents: '# Empty plan\n\nNo chunks here.\n',
  });
  assert.equal(payloads.length, 0);
});
