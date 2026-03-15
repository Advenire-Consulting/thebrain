const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { extractAndStore } = require('../scripts/extract');
const { RecallDB } = require('../lib/db');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cc2-full-'));
}

function writeJsonl(dir, filename, records) {
  const lines = records.map(r => JSON.stringify(r)).join('\n');
  fs.writeFileSync(path.join(dir, filename), lines);
}

describe('extractAndStore', () => {
  it('extracts a window from index and stores in db', async () => {
    const dir = tmpDir();
    const dbPath = path.join(dir, 'test-recall.db');
    const jsonlDir = path.join(dir, 'conversations');
    fs.mkdirSync(jsonlDir);

    writeJsonl(jsonlDir, 'sess1.jsonl', [
      { type: 'user', message: { content: 'Fix the burger menu' }, timestamp: '2026-03-01T10:00:00Z' },
      { type: 'assistant', message: { content: [{ type: 'text', text: 'I will fix the burger component' }] }, timestamp: '2026-03-01T10:01:00Z' },
    ]);

    const windowsIndex = {
      'sess1': {
        date: '2026-03-01',
        file: 'sess1.jsonl',
        dir: jsonlDir,
        windows: [{ seq: 0, startLine: 0, endLine: 1, startTime: '2026-03-01T10:00:00Z', endTime: '2026-03-01T10:01:00Z' }],
      },
    };

    const db = new RecallDB(dbPath);
    await extractAndStore(db, windowsIndex, 'medium');

    assert.ok(db.hasWindow('sess1', 0));
    const winRow = db.getWindow('sess1', 0);
    const terms = db.getTerms(winRow.id);
    const userBurger = terms.find(t => t.term === 'burger' && t.source === 'user');
    assert.ok(userBurger);

    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('skips already-extracted windows', async () => {
    const dir = tmpDir();
    const dbPath = path.join(dir, 'test-recall.db');
    const jsonlDir = path.join(dir, 'conversations');
    fs.mkdirSync(jsonlDir);

    writeJsonl(jsonlDir, 'sess1.jsonl', [
      { type: 'user', message: { content: 'Hello' }, timestamp: '2026-03-01T10:00:00Z' },
    ]);

    const windowsIndex = {
      'sess1': {
        date: '2026-03-01',
        file: 'sess1.jsonl',
        dir: jsonlDir,
        windows: [{ seq: 0, startLine: 0, endLine: 0, startTime: '2026-03-01T10:00:00Z', endTime: '2026-03-01T10:00:00Z' }],
      },
    };

    const db = new RecallDB(dbPath);
    const stats1 = await extractAndStore(db, windowsIndex, 'medium');
    assert.equal(stats1.extracted, 1);
    assert.equal(stats1.skipped, 0);

    const stats2 = await extractAndStore(db, windowsIndex, 'medium');
    assert.equal(stats2.extracted, 0);
    assert.equal(stats2.skipped, 1);

    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
