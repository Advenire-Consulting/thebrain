const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { scanFile } = require('../lib/scanner');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cc2-scan-'));
}

function writeJsonl(dir, filename, records) {
  const lines = records.map(r => JSON.stringify(r)).join('\n');
  const p = path.join(dir, filename);
  fs.writeFileSync(p, lines);
  return p;
}

function userRecord(text, timestamp) {
  return { type: 'user', message: { content: text }, timestamp };
}

function assistantRecord(text, timestamp) {
  return { type: 'assistant', message: { content: [{ type: 'text', text }] }, timestamp };
}

function compactBoundary(timestamp, preTokens) {
  return { type: 'system', subtype: 'compact_boundary', compactMetadata: { trigger: 'manual', preTokens }, timestamp };
}

describe('scanFile', () => {
  let dir;

  it('returns one window for a simple session', async () => {
    dir = tmpDir();
    const fp = writeJsonl(dir, 'simple.jsonl', [
      userRecord('Hello', '2026-03-01T10:00:00Z'),
      assistantRecord('Hi', '2026-03-01T10:01:00Z'),
      userRecord('Fix bug', '2026-03-01T10:05:00Z'),
      assistantRecord('Done', '2026-03-01T10:06:00Z'),
    ]);

    const result = await scanFile(fp);
    assert.equal(result.sessionId, 'simple');
    assert.equal(result.date, '2026-03-01');
    assert.equal(result.windows.length, 1);
    assert.equal(result.windows[0].seq, 0);
    assert.equal(result.windows[0].startLine, 0);
    assert.equal(result.windows[0].endLine, 3);
    assert.equal(result.windows[0].startTime, '2026-03-01T10:00:00Z');
    assert.equal(result.windows[0].endTime, '2026-03-01T10:06:00Z');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('splits on compact_boundary into two windows', async () => {
    dir = tmpDir();
    const fp = writeJsonl(dir, 'compact.jsonl', [
      userRecord('Work 1', '2026-03-01T10:00:00Z'),
      assistantRecord('Done 1', '2026-03-01T10:30:00Z'),
      compactBoundary('2026-03-01T11:00:00Z', 150000),
      userRecord('Work 2', '2026-03-01T11:00:01Z'),
      assistantRecord('Done 2', '2026-03-01T11:01:00Z'),
    ]);

    const result = await scanFile(fp);
    assert.equal(result.windows.length, 2);

    assert.equal(result.windows[0].seq, 0);
    assert.equal(result.windows[0].startLine, 0);
    assert.equal(result.windows[0].endLine, 2);
    assert.equal(result.windows[0].startTime, '2026-03-01T10:00:00Z');
    assert.equal(result.windows[0].endTime, '2026-03-01T11:00:00Z');

    assert.equal(result.windows[1].seq, 1);
    assert.equal(result.windows[1].startLine, 3);
    assert.equal(result.windows[1].endLine, 4);
    assert.equal(result.windows[1].startTime, '2026-03-01T11:00:01Z');
    assert.equal(result.windows[1].endTime, '2026-03-01T11:01:00Z');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('handles three windows from two compactions', async () => {
    dir = tmpDir();
    const fp = writeJsonl(dir, 'multi.jsonl', [
      userRecord('W1', '2026-03-01T10:00:00Z'),
      assistantRecord('R1', '2026-03-01T10:30:00Z'),
      compactBoundary('2026-03-01T11:00:00Z', 120000),
      userRecord('W2', '2026-03-01T11:00:01Z'),
      assistantRecord('R2', '2026-03-01T11:30:00Z'),
      compactBoundary('2026-03-01T12:00:00Z', 90000),
      userRecord('W3', '2026-03-01T12:00:01Z'),
      assistantRecord('R3', '2026-03-01T12:30:00Z'),
    ]);

    const result = await scanFile(fp);
    assert.equal(result.windows.length, 3);
    assert.equal(result.windows[0].endLine, 2);
    assert.equal(result.windows[1].startLine, 3);
    assert.equal(result.windows[1].endLine, 5);
    assert.equal(result.windows[2].startLine, 6);
    assert.equal(result.windows[2].endLine, 7);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('skips non-timestamped records for time range but counts them for line numbers', async () => {
    dir = tmpDir();
    const fp = writeJsonl(dir, 'mixed.jsonl', [
      { type: 'file-history-snapshot', snapshot: {} },
      userRecord('Hello', '2026-03-01T10:00:00Z'),
      { type: 'last-prompt', data: {} },
      assistantRecord('Hi', '2026-03-01T10:01:00Z'),
    ]);

    const result = await scanFile(fp);
    assert.equal(result.windows.length, 1);
    assert.equal(result.windows[0].startLine, 0);
    assert.equal(result.windows[0].endLine, 3);
    assert.equal(result.windows[0].startTime, '2026-03-01T10:00:00Z');
    assert.equal(result.windows[0].endTime, '2026-03-01T10:01:00Z');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns null for empty file', async () => {
    dir = tmpDir();
    const fp = path.join(dir, 'empty.jsonl');
    fs.writeFileSync(fp, '');

    const result = await scanFile(fp);
    assert.equal(result, null);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('extracts session ID from filename', async () => {
    dir = tmpDir();
    const fp = writeJsonl(dir, 'abc12345-defg-hijk.jsonl', [
      userRecord('Hello', '2026-03-01T10:00:00Z'),
      assistantRecord('Hi', '2026-03-01T10:01:00Z'),
    ]);

    const result = await scanFile(fp);
    assert.equal(result.sessionId, 'abc12345-defg-hijk');

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
