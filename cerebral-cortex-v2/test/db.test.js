const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

describe('RecallDB', () => {
  let tmpDb;

  it('creates tables on init', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc2-db-'));
    tmpDb = path.join(dir, 'test-recall.db');
    const { RecallDB } = require('../lib/db');
    const db = new RecallDB(tmpDb);

    // Check tables exist
    const tables = db.db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
    const names = tables.map(t => t.name);
    assert.ok(names.includes('windows'));
    assert.ok(names.includes('window_projects'));
    assert.ok(names.includes('window_files'));
    assert.ok(names.includes('window_terms'));
    assert.ok(names.includes('window_decisions'));

    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('inserts and retrieves a window', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc2-db-'));
    tmpDb = path.join(dir, 'test-recall.db');
    const { RecallDB } = require('../lib/db');
    const db = new RecallDB(tmpDb);

    const id = db.insertWindow({
      sessionId: 'sess1',
      seq: 0,
      startLine: 0,
      endLine: 100,
      startTime: '2026-03-01T10:00:00Z',
      endTime: '2026-03-01T11:00:00Z',
    });

    assert.ok(id > 0);

    const row = db.getWindow('sess1', 0);
    assert.equal(row.session_id, 'sess1');
    assert.equal(row.start_line, 0);
    assert.equal(row.end_line, 100);

    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('skips duplicate window on insert', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc2-db-'));
    tmpDb = path.join(dir, 'test-recall.db');
    const { RecallDB } = require('../lib/db');
    const db = new RecallDB(tmpDb);

    const win = { sessionId: 'sess1', seq: 0, startLine: 0, endLine: 100, startTime: '2026-03-01T10:00:00Z', endTime: '2026-03-01T11:00:00Z' };
    const id1 = db.insertWindow(win);
    const id2 = db.insertWindow(win);
    assert.equal(id1, id2);

    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('inserts projects, files, and terms for a window', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc2-db-'));
    tmpDb = path.join(dir, 'test-recall.db');
    const { RecallDB } = require('../lib/db');
    const db = new RecallDB(tmpDb);

    const winId = db.insertWindow({ sessionId: 'sess1', seq: 0, startLine: 0, endLine: 100, startTime: '2026-03-01T10:00:00Z', endTime: '2026-03-01T11:00:00Z' });

    db.insertProjects(winId, { 'advenire-portal': 12, 'thebrain': 3 });
    db.insertFiles(winId, [
      { filePath: 'advenire.consulting/src/nav.js', lines: [20, 45], tool: 'Edit' },
      { filePath: 'advenire.consulting/src/app.js', lines: [30], tool: 'Read' },
    ]);
    db.insertTerms(winId, [
      { term: 'burger', source: 'user', lines: [10, 15, 22], count: 3 },
      { term: 'burger', source: 'assistant', lines: [12, 18], count: 2 },
      { term: 'portal', source: 'user', lines: [10], count: 1 },
    ]);

    const projects = db.getProjects(winId);
    assert.equal(projects.length, 2);
    assert.equal(projects.find(p => p.project === 'advenire-portal').frequency, 12);

    const files = db.getFiles(winId);
    assert.equal(files.length, 2);

    const terms = db.getTerms(winId);
    assert.equal(terms.length, 3);
    const userBurger = terms.find(t => t.term === 'burger' && t.source === 'user');
    assert.equal(userBurger.count, 3);
    assert.deepStrictEqual(JSON.parse(userBurger.lines), [10, 15, 22]);

    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('inserts and retrieves decisions for a window', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc2-db-'));
    const tmpDb = path.join(dir, 'test-recall.db');
    const { RecallDB } = require('../lib/db');
    const db = new RecallDB(tmpDb);

    const winId = db.insertWindow({
      sessionId: 'sess1', seq: 0, startLine: 0, endLine: 500,
      startTime: '2026-03-01T10:00:00Z', endTime: '2026-03-01T12:00:00Z',
    });

    db.insertDecisions(winId, [
      {
        seq: 0, startLine: 44, endLine: 150,
        summary: 'modular architecture — portal-server.js, toolRouter.js',
        terms: ['modular', 'portal', 'iframe', 'module'],
        fileAnchors: ['advenire.consulting/portal-v2/toolRouter.js'],
        status: 'decided',
      },
      {
        seq: 1, startLine: 200, endLine: 300,
        summary: 'burger sidebar — collapsible nav',
        terms: ['burger', 'sidebar', 'collapsible'],
        fileAnchors: null,
        status: 'parked',
      },
    ]);

    const decisions = db.getDecisions(winId);
    assert.equal(decisions.length, 2);
    assert.equal(decisions[0].summary, 'modular architecture — portal-server.js, toolRouter.js');
    assert.equal(decisions[0].status, 'decided');
    assert.deepStrictEqual(JSON.parse(decisions[0].terms), ['modular', 'portal', 'iframe', 'module']);
    assert.equal(decisions[1].status, 'parked');
    assert.equal(decisions[1].file_anchors, null);

    assert.ok(db.hasDecisions(winId));

    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
