const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { main } = require('./spec-check.js');

// Capture console output for assertion.
function captureConsole(fn) {
  const origLog = console.log;
  const origErr = console.error;
  const chunks = { log: [], err: [] };
  console.log = (...args) => chunks.log.push(args.join(' '));
  console.error = (...args) => chunks.err.push(args.join(' '));
  return fn().then(code => {
    console.log = origLog;
    console.error = origErr;
    return { code, stdout: chunks.log.join('\n'), stderr: chunks.err.join('\n') };
  }).catch(err => {
    console.log = origLog;
    console.error = origErr;
    throw err;
  });
}

// Make a temp fixture folder with named files.
async function makeFixture(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-check-'));
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(root, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, contents);
  }
  return root;
}

// Minimal valid frontmatter helper.
function validSpec(extras = '') {
  return [
    '---',
    'doc_type: spec',
    'date: 2026-04-07',
    'status: proposed',
    'feature_area: features/x',
    'touches:',
    '  files: []',
    '  schema: []',
    '  events:',
    '    emits: []',
    '    subscribes: []',
    'depends_on: []',
    extras,
    '---',
    '',
    '# Body',
  ].filter(l => l !== '').join('\n') + '\n';
}

test('CLI --template spec prints a template', async () => {
  const r = await captureConsole(() => main(['--template', 'spec']));
  assert.equal(r.code, 0);
  assert.match(r.stdout, /doc_type: spec/);
});

test('CLI --template plan prints a template with implements', async () => {
  const r = await captureConsole(() => main(['--template', 'plan']));
  assert.equal(r.code, 0);
  assert.match(r.stdout, /implements:/);
});

test('CLI --dir with clean docs returns 0', async () => {
  const root = await makeFixture({
    'a.md': validSpec(),
    'b.md': validSpec(),
  });
  const r = await captureConsole(() => main(['--dir', root]));
  assert.equal(r.code, 0);
  assert.match(r.stdout, /exit_code: 0/);
});

test('CLI --dir detects file collision as hard', async () => {
  // Both docs declare a modify on features/x.js — hard collision.
  const doc = [
    '---',
    'doc_type: spec',
    'date: 2026-04-07',
    'status: proposed',
    'feature_area: features/x',
    'touches:',
    '  files:',
    '    - path: features/x.js',
    '      mode: modify',
    '      spec_section: L1-L10',
    '  schema: []',
    '  events:',
    '    emits: []',
    '    subscribes: []',
    'depends_on: []',
    '---',
  ].join('\n') + '\n';
  const root = await makeFixture({ 'a.md': doc, 'b.md': doc });
  const r = await captureConsole(() => main(['--dir', root]));
  assert.equal(r.code, 1);
  assert.match(r.stdout, /features\/x\.js/);
});

test('CLI --strict returns 2 on headerless', async () => {
  const root = await makeFixture({
    'clean.md': validSpec(),
    'headerless.md': '# just a heading\n',
  });
  const r = await captureConsole(() => main(['--dir', root, '--strict']));
  assert.equal(r.code, 2);
});

test('CLI --dir bad path returns 3', async () => {
  const r = await captureConsole(() => main(['--dir', '/definitely/not/here']));
  assert.equal(r.code, 3);
});

test('CLI with no args prints help and returns 3', async () => {
  const r = await captureConsole(() => main([]));
  assert.equal(r.code, 3);
});

// --- Chunk-extractor surface tests ---

// A minimal plan fixture with two chunks for testing the extractor surfaces.
const SAMPLE_PLAN_FILE = [
  '# Sample Plan',
  '',
  '**Goal:** Test the chunk extractor.',
  '',
  '## Architecture decisions',
  '',
  '1. Use chunks.',
  '',
  '## Chunk 1 — First',
  '',
  '**Goal:** Do thing one.',
  '',
  'Body 1.',
  '',
  '## Chunk 2 — Second',
  '',
  '**Goal:** Do thing two.',
  '',
  'Body 2.',
  '',
  '## Sonnet handoff prompts',
  '',
  'Trailing.',
].join('\n');

test('CLI --list-chunks prints chunk list', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-check-plan-'));
  const planPath = path.join(root, 'sample-plan.md');
  await fs.writeFile(planPath, SAMPLE_PLAN_FILE);
  const r = await captureConsole(() => main(['--list-chunks', planPath]));
  assert.equal(r.code, 0);
  assert.match(r.stdout, /Chunk 1: First/);
  assert.match(r.stdout, /Chunk 2: Second/);
  assert.match(r.stdout, /L\d+-L\d+/);
});

test('CLI --chunk-range prints L<start>-L<end>', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-check-plan-'));
  const planPath = path.join(root, 'sample-plan.md');
  await fs.writeFile(planPath, SAMPLE_PLAN_FILE);
  const r = await captureConsole(() => main(['--chunk-range', planPath, '1']));
  assert.equal(r.code, 0);
  assert.match(r.stdout, /^L\d+-L\d+$/m);
});

test('CLI --chunk-range returns 3 on missing chunk', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-check-plan-'));
  const planPath = path.join(root, 'sample-plan.md');
  await fs.writeFile(planPath, SAMPLE_PLAN_FILE);
  const r = await captureConsole(() => main(['--chunk-range', planPath, '99']));
  assert.equal(r.code, 3);
});

test('CLI --chunk-content includes preamble, header, and chunk body', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-check-plan-'));
  const planPath = path.join(root, 'sample-plan.md');
  await fs.writeFile(planPath, SAMPLE_PLAN_FILE);
  const r = await captureConsole(() => main(['--chunk-content', planPath, '1']));
  assert.equal(r.code, 0);
  assert.match(r.stdout, /## Sonnet assignment — Chunk 1/);
  assert.match(r.stdout, /Standing rules:/);
  assert.match(r.stdout, /Architecture decisions/);
  assert.match(r.stdout, /Body 1\./);
  assert.doesNotMatch(r.stdout, /Body 2\./);
});

test('CLI --chunk-content omits Prior agent observations when chunk is 1', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-check-plan-'));
  const planPath = path.join(root, 'sample-plan.md');
  await fs.writeFile(planPath, SAMPLE_PLAN_FILE);
  // Create observations file with a Chunk 1 entry — should be ignored when requesting Chunk 1.
  await fs.writeFile(path.join(root, 'sample-plan.observations.md'),
    '## Chunk 1 — 2026-04-07\n\nNote.\n');
  const r = await captureConsole(() => main(['--chunk-content', planPath, '1']));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.stdout, /Prior agent observations/);
});

test('CLI --chunk-content includes Prior agent observations from sibling file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-check-plan-'));
  const planPath = path.join(root, 'sample-plan.md');
  await fs.writeFile(planPath, SAMPLE_PLAN_FILE);
  await fs.writeFile(path.join(root, 'sample-plan.observations.md'),
    '## Chunk 1 — 2026-04-07\n\nFlagged a thing.\n');
  const r = await captureConsole(() => main(['--chunk-content', planPath, '2']));
  assert.equal(r.code, 0);
  assert.match(r.stdout, /## Prior agent observations/);
  assert.match(r.stdout, /Flagged a thing/);
});
