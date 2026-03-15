const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { RecallDB } = require('../lib/db');
const { search } = require('../lib/search');

function tmpDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc2-search-'));
  return { dir, dbPath: path.join(dir, 'test.db') };
}

function seedDb(db) {
  // Window 1: advenire, burger-heavy
  const w1 = db.insertWindow({ sessionId: 'sess1', seq: 0, startLine: 0, endLine: 100, startTime: '2026-03-07T10:00:00Z', endTime: '2026-03-07T11:00:00Z' });
  db.insertProjects(w1, { 'advenire-portal': 15, 'thebrain': 2 });
  db.insertFiles(w1, [{ filePath: 'advenire.consulting/src/portal-nav.js', lines: [20, 45, 80], tool: 'Read,Edit' }]);
  db.insertTerms(w1, [
    { term: 'burger', source: 'user', lines: [10, 15, 22, 30, 40], count: 5 },
    { term: 'burger', source: 'assistant', lines: [12, 18, 25], count: 3 },
    { term: 'portal', source: 'user', lines: [10, 30], count: 2 },
    { term: 'collapse', source: 'user', lines: [22, 40], count: 2 },
    { term: 'sidebar', source: 'user', lines: [15], count: 1 },
    { term: 'redesign', source: 'user', lines: [10], count: 1 },
  ]);

  // Window 2: michaelortegon, burger mentioned once
  const w2 = db.insertWindow({ sessionId: 'sess2', seq: 0, startLine: 0, endLine: 200, startTime: '2026-03-06T10:00:00Z', endTime: '2026-03-06T12:00:00Z' });
  db.insertProjects(w2, { 'michaelortegon': 20 });
  db.insertFiles(w2, [{ filePath: 'michaelortegon.com/src/blog.js', lines: [50], tool: 'Edit' }]);
  db.insertTerms(w2, [
    { term: 'burger', source: 'user', lines: [100], count: 1 },
    { term: 'blog', source: 'user', lines: [10, 20, 30], count: 3 },
  ]);

  // Window 3: advenire, no burger
  const w3 = db.insertWindow({ sessionId: 'sess3', seq: 0, startLine: 0, endLine: 150, startTime: '2026-03-05T10:00:00Z', endTime: '2026-03-05T11:00:00Z' });
  db.insertProjects(w3, { 'advenire-portal': 10 });
  db.insertTerms(w3, [
    { term: 'booking', source: 'user', lines: [10, 20], count: 2 },
    { term: 'portal', source: 'user', lines: [10], count: 1 },
  ]);
}

describe('search', () => {
  it('ranks burger + advenire above burger + michaelortegon', () => {
    const { dir, dbPath } = tmpDb();
    const db = new RecallDB(dbPath);
    seedDb(db);

    const results = search(db, [['portal', 'advenire'], ['burger', 'collapse', 'sidebar']]);
    assert.ok(results.length >= 2);
    assert.equal(results[0].sessionId, 'sess1');

    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('returns focus line range', () => {
    const { dir, dbPath } = tmpDb();
    const db = new RecallDB(dbPath);
    seedDb(db);

    const results = search(db, [['burger']]);
    const top = results[0];
    assert.ok(top.focusStart !== undefined);
    assert.ok(top.focusEnd !== undefined);
    assert.ok(top.focusStart <= top.focusEnd);

    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('applies trust decay - recent windows score higher as tiebreaker', () => {
    const { dir, dbPath } = tmpDb();
    const db = new RecallDB(dbPath);

    const w1 = db.insertWindow({ sessionId: 'old', seq: 0, startLine: 0, endLine: 50, startTime: '2026-01-01T10:00:00Z', endTime: '2026-01-01T11:00:00Z' });
    db.insertTerms(w1, [{ term: 'scratchpad', source: 'user', lines: [10], count: 1 }]);

    const w2 = db.insertWindow({ sessionId: 'new', seq: 0, startLine: 0, endLine: 50, startTime: '2026-03-07T10:00:00Z', endTime: '2026-03-07T11:00:00Z' });
    db.insertTerms(w2, [{ term: 'scratchpad', source: 'user', lines: [10], count: 1 }]);

    const results = search(db, [['scratchpad']]);
    assert.equal(results[0].sessionId, 'new');

    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('project cluster boosts windows with matching project', () => {
    const { dir, dbPath } = tmpDb();
    const db = new RecallDB(dbPath);
    seedDb(db);

    const results = search(db, [['portal']]);
    assert.equal(results[0].sessionId, 'sess1');

    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
