'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { WorkingMemoryDB } = require('../lib/db');

const TEST_DB = path.join(__dirname, '.test-git-briefing.db');

function freshDb() {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(TEST_DB + suffix); } catch {}
  }
  return new WorkingMemoryDB(TEST_DB);
}

function cleanup() {
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(TEST_DB + suffix); } catch {}
  }
}

describe('last_touched_at column', () => {
  after(cleanup);

  it('is set on first bump', () => {
    const db = freshDb();
    db.bumpFileHeat('proj', 'file.js', 1.0, 'sess1');
    const row = db.getFileHeat('proj', 'file.js');
    assert.ok(row.last_touched_at, 'last_touched_at should be set');
    db.close();
  });

  it('updates on subsequent bumps', () => {
    const db = freshDb();
    db.bumpFileHeat('proj', 'file.js', 1.0, 'sess1');
    const first = db.getFileHeat('proj', 'file.js').last_touched_at;
    db.bumpFileHeat('proj', 'file.js', 1.0, 'sess2');
    const second = db.getFileHeat('proj', 'file.js').last_touched_at;
    assert.ok(second >= first, 'last_touched_at should update on bump');
    db.close();
  });
});

const { checkGitChanges } = require('../lib/git-briefing');
const { execFileSync } = require('child_process');
const os = require('os');

describe('checkGitChanges', () => {
  const tmpDir = path.join(os.tmpdir(), 'git-briefing-test-' + process.pid);
  const testFile = 'test-file.js';

  before(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
    execFileSync('git', ['init'], { cwd: tmpDir });
    execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: tmpDir });
    execFileSync('git', ['config', 'user.name', 'Test'], { cwd: tmpDir });
    fs.writeFileSync(path.join(tmpDir, testFile), 'v1');
    execFileSync('git', ['add', '.'], { cwd: tmpDir });
    execFileSync('git', ['commit', '-m', 'initial'], { cwd: tmpDir });
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when no changes since timestamp', () => {
    // Use a future timestamp to ensure no commits fall after it
    const future = new Date(Date.now() + 60000).toISOString();
    const result = checkGitChanges(tmpDir, testFile, future);
    assert.strictEqual(result, null);
  });

  it('returns summary when changes exist since timestamp', () => {
    const past = new Date(Date.now() - 86400000).toISOString();
    const result = checkGitChanges(tmpDir, testFile, past);
    assert.ok(result, 'should return a summary string');
    assert.ok(result.includes('initial'), 'should include commit message');
  });

  it('returns null for non-git directories', () => {
    const nonGitDir = path.join(os.tmpdir(), 'not-a-repo-' + process.pid);
    fs.mkdirSync(nonGitDir, { recursive: true });
    const result = checkGitChanges(nonGitDir, 'any.js', new Date().toISOString());
    fs.rmSync(nonGitDir, { recursive: true, force: true });
    assert.strictEqual(result, null);
  });

  it('does not throw for nonexistent paths', () => {
    assert.doesNotThrow(() => {
      checkGitChanges('/nonexistent/path', 'file.js', new Date().toISOString());
    });
  });
});

const { bumpFile } = require('../lib/tracker');

describe('re-engagement detection in bumpFile', () => {
  after(cleanup);

  it('returns re-engagement info when file was cold', () => {
    const db = freshDb();
    db.bumpFileHeat('proj', 'cold.js', 0.5, 'old-sess');
    db.decayAllScores(0.5); // 0.25 — cold

    const result = bumpFile(db, 'proj', 'cold.js', 'read', 'new-sess');
    assert.ok(result, 'should return re-engagement object');
    assert.strictEqual(result.reengaged, true);
    assert.ok(result.lastTouchedAt, 'should include lastTouchedAt');
    db.close();
  });

  it('returns null when file was already warm', () => {
    const db = freshDb();
    db.bumpFileHeat('proj', 'warm.js', 3.0, 'sess1');

    const result = bumpFile(db, 'proj', 'warm.js', 'edit', 'sess2');
    assert.strictEqual(result, null);
    db.close();
  });

  it('returns null for brand new files', () => {
    const db = freshDb();
    const result = bumpFile(db, 'proj', 'new.js', 'edit', 'sess1');
    assert.strictEqual(result, null);
    db.close();
  });
});

const { hasBeenBriefed } = require('../lib/git-briefing');

describe('session dedup (hasBeenBriefed)', () => {
  const testSessionId = 'test-dedup-' + process.pid;
  const stateFile = path.join(os.homedir(), '.claude', 'git_briefing_state_' + testSessionId + '.json');

  after(() => {
    try { fs.unlinkSync(stateFile); } catch {}
  });

  it('allows first check for a file', () => {
    assert.strictEqual(hasBeenBriefed(testSessionId, 'proj', 'file.js'), false);
  });

  it('blocks second check for same file', () => {
    assert.strictEqual(hasBeenBriefed(testSessionId, 'proj', 'file.js'), true);
  });

  it('allows different files independently', () => {
    assert.strictEqual(hasBeenBriefed(testSessionId, 'proj', 'other.js'), false);
  });
});
