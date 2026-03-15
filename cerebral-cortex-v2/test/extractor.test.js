const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { extractWindow } = require('../lib/extractor');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cc2-ext-'));
}

function writeJsonl(dir, filename, records) {
  const lines = records.map(r => JSON.stringify(r)).join('\n');
  const p = path.join(dir, filename);
  fs.writeFileSync(p, lines);
  return p;
}

const WEBSITES = '/home/testuser/projects/';

// Set up temp config + hippocampus for project detection
const TEST_BRAIN = fs.mkdtempSync(path.join(os.tmpdir(), 'cc2-brain-'));
const TEST_HIPPO = path.join(TEST_BRAIN, 'hippocampus');
fs.mkdirSync(TEST_HIPPO, { recursive: true });
fs.writeFileSync(path.join(TEST_HIPPO, 'advenire-portal.dir.json'), JSON.stringify({
  name: 'advenire-portal', root: 'advenire.consulting/', aliases: {}, files: {}
}));
fs.writeFileSync(path.join(TEST_HIPPO, 'thebrain.dir.json'), JSON.stringify({
  name: 'thebrain', root: 'SonderPlugins/thebrain/', aliases: {}, files: {}
}));
const TEST_CONFIG = path.join(TEST_BRAIN, 'config.json');
fs.writeFileSync(TEST_CONFIG, JSON.stringify({
  workspaces: [{ name: 'projects', path: '/home/testuser/projects' }],
  conversationDirs: [],
}));
process.env.THEBRAIN_CONFIG = TEST_CONFIG;
process.env.THEBRAIN_HIPPOCAMPUS_DIR = TEST_HIPPO;

describe('extractWindow', () => {
  it('extracts user terms with line numbers', async () => {
    const dir = tmpDir();
    const fp = writeJsonl(dir, 'test.jsonl', [
      { type: 'user', message: { content: 'Fix the burger menu on portal' }, timestamp: '2026-03-01T10:00:00Z' },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'I will fix it' }] }, timestamp: '2026-03-01T10:01:00Z' },
      { type: 'user', message: { content: 'The burger should collapse' }, timestamp: '2026-03-01T10:02:00Z' },
    ]);

    const result = await extractWindow(fp, 0, 2, 'medium');
    assert.ok(result.userTerms.burger);
    assert.equal(result.userTerms.burger.count, 2);
    assert.deepStrictEqual(result.userTerms.burger.lines, [0, 2]);
    assert.ok(result.userTerms.portal);
    assert.ok(result.userTerms.collapse);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('extracts assistant terms separately', async () => {
    const dir = tmpDir();
    const fp = writeJsonl(dir, 'test.jsonl', [
      { type: 'user', message: { content: 'Fix the nav' }, timestamp: '2026-03-01T10:00:00Z' },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'I will restructure the burger component for mobile navigation' }] }, timestamp: '2026-03-01T10:01:00Z' },
    ]);

    const result = await extractWindow(fp, 0, 1, 'medium');
    assert.ok(result.assistantTerms.burger);
    assert.deepStrictEqual(result.assistantTerms.burger.lines, [1]);
    assert.ok(result.assistantTerms.navigation);
    assert.ok(result.userTerms.nav);
    assert.ok(!result.userTerms.burger);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('extracts file references from tool calls', async () => {
    const dir = tmpDir();
    const fp = writeJsonl(dir, 'test.jsonl', [
      { type: 'user', message: { content: 'Edit the nav' }, timestamp: '2026-03-01T10:00:00Z' },
      { type: 'assistant', message: { content: [
        { type: 'tool_use', name: 'Read', input: { file_path: WEBSITES + 'advenire.consulting/src/nav.js' } },
      ] }, timestamp: '2026-03-01T10:01:00Z' },
      { type: 'assistant', message: { content: [
        { type: 'tool_use', name: 'Edit', input: { file_path: WEBSITES + 'advenire.consulting/src/nav.js', old_string: 'a', new_string: 'b' } },
      ] }, timestamp: '2026-03-01T10:02:00Z' },
    ]);

    const result = await extractWindow(fp, 0, 2, 'medium');
    const navFile = result.files.find(f => f.filePath.includes('nav.js'));
    assert.ok(navFile);
    assert.deepStrictEqual(navFile.lines, [1, 2]);
    assert.equal(navFile.tool, 'Read,Edit');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('derives project frequencies from file paths', async () => {
    const dir = tmpDir();
    const fp = writeJsonl(dir, 'test.jsonl', [
      { type: 'assistant', message: { content: [
        { type: 'tool_use', name: 'Read', input: { file_path: WEBSITES + 'advenire.consulting/src/a.js' } },
      ] }, timestamp: '2026-03-01T10:00:00Z' },
      { type: 'assistant', message: { content: [
        { type: 'tool_use', name: 'Read', input: { file_path: WEBSITES + 'advenire.consulting/src/b.js' } },
      ] }, timestamp: '2026-03-01T10:01:00Z' },
      { type: 'assistant', message: { content: [
        { type: 'tool_use', name: 'Read', input: { file_path: WEBSITES + 'SonderPlugins/thebrain/lib/x.js' } },
      ] }, timestamp: '2026-03-01T10:02:00Z' },
    ]);

    const result = await extractWindow(fp, 0, 2, 'medium');
    assert.equal(result.projects['advenire-portal'], 2);
    assert.equal(result.projects['thebrain'], 1);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('respects line range - only processes startLine to endLine', async () => {
    const dir = tmpDir();
    const fp = writeJsonl(dir, 'test.jsonl', [
      { type: 'user', message: { content: 'First window stuff' }, timestamp: '2026-03-01T10:00:00Z' },
      { type: 'user', message: { content: 'Still first window' }, timestamp: '2026-03-01T10:01:00Z' },
      { type: 'system', subtype: 'compact_boundary', timestamp: '2026-03-01T11:00:00Z' },
      { type: 'user', message: { content: 'Second window burger' }, timestamp: '2026-03-01T11:01:00Z' },
      { type: 'user', message: { content: 'More second window' }, timestamp: '2026-03-01T11:02:00Z' },
    ]);

    const result = await extractWindow(fp, 3, 4, 'medium');
    assert.ok(result.userTerms.burger);
    assert.ok(!result.userTerms.stuff);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('handles user message content as array', async () => {
    const dir = tmpDir();
    const fp = writeJsonl(dir, 'test.jsonl', [
      { type: 'user', message: { content: [{ type: 'text', text: 'Fix the burger' }] }, timestamp: '2026-03-01T10:00:00Z' },
    ]);

    const result = await extractWindow(fp, 0, 0, 'medium');
    assert.ok(result.userTerms.burger);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
