const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { scanDirectory, writeIndex, readIndex } = require('../lib/scanner');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cc2-idx-'));
}

function writeJsonl(dir, filename, records) {
  const lines = records.map(r => JSON.stringify(r)).join('\n');
  fs.writeFileSync(path.join(dir, filename), lines);
}

function userRecord(text, ts) {
  return { type: 'user', message: { content: text }, timestamp: ts };
}

function assistantRecord(text, ts) {
  return { type: 'assistant', message: { content: [{ type: 'text', text }] }, timestamp: ts };
}

describe('scanDirectory and writeIndex', () => {
  it('scans a directory and produces an index object', async () => {
    const dir = tmpDir();
    writeJsonl(dir, 'sess1.jsonl', [
      userRecord('Hello', '2026-03-01T10:00:00Z'),
      assistantRecord('Hi', '2026-03-01T10:01:00Z'),
    ]);
    writeJsonl(dir, 'sess2.jsonl', [
      userRecord('Bye', '2026-03-02T10:00:00Z'),
      assistantRecord('Later', '2026-03-02T10:01:00Z'),
    ]);
    // Non-jsonl file should be ignored
    fs.writeFileSync(path.join(dir, 'readme.txt'), 'not a jsonl');

    const { index, skipped } = await scanDirectory(dir);
    assert.equal(Object.keys(index).length, 2);
    assert.ok(index['sess1']);
    assert.ok(index['sess2']);
    assert.equal(index['sess1'].windows.length, 1);
    assert.equal(skipped, 0);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes and reads index file', () => {
    const dir = tmpDir();
    const indexPath = path.join(dir, 'windows.json');
    const data = {
      'sess1': { date: '2026-03-01', file: 'sess1.jsonl', dir: '/tmp', windows: [{ seq: 0, startLine: 0, endLine: 1, startTime: '2026-03-01T10:00:00Z', endTime: '2026-03-01T10:01:00Z' }] }
    };

    writeIndex(indexPath, data);
    assert.ok(fs.existsSync(indexPath));

    const loaded = readIndex(indexPath);
    assert.deepStrictEqual(loaded, data);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
