# Git Re-engagement Briefing — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface a one-line git change summary when a cold dlPFC file is re-engaged, so the user knows what changed while they were away.

**Architecture:** The existing dlPFC hooks (read-hook, post-edit-hook) already bump file heat scores. Before bumping, check if the file is cold (score < 1.0). If so, run `git log --oneline --since=<last_touched_at>` and emit results to stderr. A new `last_touched_at` column tracks when each file was last touched. A new `git-briefing.js` module handles git checks. No persistence — output is ephemeral.

**Tech Stack:** Node.js, better-sqlite3, child_process (execFileSync for git — array args, no shell injection)

**Existing test pattern:** New tests use `node:test` + `assert` (codebase standard).

---

## Chunk 1: Schema + Git Briefing Module

### Task 1: Add `last_touched_at` column to schema

**Files:**
- Modify: `dlpfc/lib/db.js:10-33` (schema + bumpFileHeat method)
- Test: `dlpfc/test/git-briefing.test.js` (new)

- [ ] **Step 1: Write failing test for `last_touched_at` column**

Create `dlpfc/test/git-briefing.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test dlpfc/test/git-briefing.test.js`
Expected: FAIL — `last_touched_at` is undefined (column doesn't exist yet)

- [ ] **Step 3: Add `last_touched_at` to schema and bumpFileHeat**

In `dlpfc/lib/db.js`, add `last_touched_at DATETIME` to the `file_heat` CREATE TABLE after `context_note TEXT`. Update `bumpFileHeat()` to write `CURRENT_TIMESTAMP` on both INSERT and UPDATE:

```js
bumpFileHeat(project, filePath, weight, sessionId) {
  this.db.prepare(`
    INSERT INTO file_heat (project, file_path, score, touch_count, last_session, last_touched_at, updated_at)
    VALUES (?, ?, ?, 1, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(project, file_path) DO UPDATE SET
      score = score + ?,
      touch_count = touch_count + 1,
      last_session = ?,
      last_touched_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  `).run(project, filePath, weight, sessionId, weight, sessionId);
}
```

Add migration for existing databases in constructor, after `this.db.exec(SCHEMA)`:

```js
try {
  this.db.prepare('SELECT last_touched_at FROM file_heat LIMIT 0').run();
} catch {
  this.db.exec('ALTER TABLE file_heat ADD COLUMN last_touched_at DATETIME');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test dlpfc/test/git-briefing.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add dlpfc/lib/db.js dlpfc/test/git-briefing.test.js
git commit -m "feat(dlpfc): add last_touched_at column to file_heat"
```

---

### Task 2: Create git-briefing module

**Files:**
- Create: `dlpfc/lib/git-briefing.js`
- Modify: `dlpfc/test/git-briefing.test.js`

- [ ] **Step 1: Write failing tests for git briefing**

Append to `dlpfc/test/git-briefing.test.js`:

```js
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
    const result = checkGitChanges(tmpDir, testFile, new Date().toISOString());
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test dlpfc/test/git-briefing.test.js`
Expected: FAIL — `checkGitChanges` not found

- [ ] **Step 3: Implement git-briefing module**

Create `dlpfc/lib/git-briefing.js`:

```js
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Check if a directory is inside a git repo
function isGitRepo(dir) {
  try {
    execFileSync('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 3000
    });
    return true;
  } catch {
    return false;
  }
}

// Get git changes for a file since a given timestamp
// Returns a formatted string or null if no changes / not a git repo
function checkGitChanges(projectRoot, filePath, sinceTimestamp) {
  try {
    if (!isGitRepo(projectRoot)) return null;

    const output = execFileSync('git', [
      '-C', projectRoot,
      'log', '--oneline',
      '--since=' + sinceTimestamp,
      '--', filePath
    ], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000
    }).trim();

    if (!output) return null;

    const lines = output.split('\n');
    if (lines.length === 1) {
      return lines[0];
    }
    return lines.length + ' commits: ' + lines[0] + ' ... ' + lines[lines.length - 1];
  } catch {
    return null;
  }
}

// File-based session dedup — one state file per session
// Returns true if this file has already been briefed this session
function hasBeenBriefed(sessionId, project, filePath) {
  const stateFile = path.join(os.homedir(), '.claude', 'git_briefing_state_' + sessionId + '.json');
  let state = [];
  try { state = JSON.parse(fs.readFileSync(stateFile, 'utf-8')); } catch {}

  const key = project + ':' + filePath;
  if (state.includes(key)) return true;

  state.push(key);
  const tmpPath = stateFile + '.tmp.' + process.pid;
  fs.writeFileSync(tmpPath, JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(tmpPath, stateFile);
  return false;
}

module.exports = { checkGitChanges, isGitRepo, hasBeenBriefed };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test dlpfc/test/git-briefing.test.js`
Expected: PASS (all 6 tests)

- [ ] **Step 5: Commit**

```bash
git add dlpfc/lib/git-briefing.js dlpfc/test/git-briefing.test.js
git commit -m "feat(dlpfc): add git-briefing module for re-engagement detection"
```

---

## Chunk 2: Hook Integration

### Task 3: Add re-engagement detection to tracker

**Files:**
- Modify: `dlpfc/lib/tracker.js`
- Modify: `dlpfc/test/git-briefing.test.js`

- [ ] **Step 1: Write failing tests for re-engagement detection**

Append to `dlpfc/test/git-briefing.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test dlpfc/test/git-briefing.test.js`
Expected: FAIL — `bumpFile` returns undefined, not a re-engagement object

- [ ] **Step 3: Update tracker.js to detect re-engagement**

Replace `dlpfc/lib/tracker.js`:

```js
'use strict';

const WEIGHTS = { edit: 1.0, read: 0.3, reference: 0.5 };
const DECAY_FACTOR = 0.8;
const COLD_THRESHOLD = 1.0;

// Bump a file's heat score and optionally seed summary from DIR data
// Returns { reengaged: true, lastTouchedAt } if file was cold, null otherwise
function bumpFile(db, project, filePath, touchType, sessionId, dirData) {
  const weight = WEIGHTS[touchType] || WEIGHTS.reference;

  // Check current state before bumping
  const existing = db.getFileHeat(project, filePath);
  let reengagement = null;

  if (existing && existing.score < COLD_THRESHOLD && existing.last_touched_at) {
    reengagement = { reengaged: true, lastTouchedAt: existing.last_touched_at };
  }

  db.bumpFileHeat(project, filePath, weight, sessionId);

  // Seed summary from DIR on first touch (when no summary exists yet)
  if (dirData) {
    const row = db.getFileHeat(project, filePath);
    if (!row.summary && dirData.files && dirData.files[filePath]) {
      const purpose = dirData.files[filePath].purpose;
      if (purpose) db.updateSummary(project, filePath, purpose);
    }
  }

  return reengagement;
}

// Decay all scores and detect clusters from session co-occurrence
function decayAndCluster(db, sessionId) {
  db.decayAllScores(DECAY_FACTOR);

  const grouped = getSessionFiles(db, sessionId);
  for (const [project, files] of Object.entries(grouped)) {
    if (files.length >= 2) {
      for (let i = 0; i < files.length; i++) {
        for (let j = i + 1; j < files.length; j++) {
          db.upsertCluster(project, [files[i], files[j]]);
        }
      }
    }
  }
}

// Get files touched in a session, grouped by project
function getSessionFiles(db, sessionId) {
  const rows = db.getAllFilesForSession(sessionId);
  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.project]) grouped[row.project] = [];
    grouped[row.project].push(row.file_path);
  }
  return grouped;
}

module.exports = { bumpFile, decayAndCluster, getSessionFiles, WEIGHTS, DECAY_FACTOR, COLD_THRESHOLD };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test dlpfc/test/git-briefing.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add dlpfc/lib/tracker.js dlpfc/test/git-briefing.test.js
git commit -m "feat(dlpfc): detect re-engagement when cold files are bumped"
```

---

### Task 4: Wire git briefing into read-hook

**Files:**
- Modify: `dlpfc/hooks/read-hook.js`

- [ ] **Step 1: Update read-hook to emit git briefing on re-engagement**

In `dlpfc/hooks/read-hook.js`, replace the `bumpFile` call and add git briefing:

```js
const reengagement = bumpFile(db, matchedProject, relativeToProject, 'read', sessionId, dirData);

if (reengagement) {
  const { checkGitChanges, hasBeenBriefed } = require('../lib/git-briefing');
  if (!hasBeenBriefed(sessionId, matchedProject, relativeToProject)) {
    const projectRoot = path.join(cwd, dirData.root);
    const briefing = checkGitChanges(projectRoot, relativeToProject, reengagement.lastTouchedAt);
    if (briefing) {
      process.stderr.write('[git-briefing] ' + relativeToProject + ' changed while cold: ' + briefing + '\n');
    }
  }
}
```

- [ ] **Step 2: Verify hook runs without errors**

```bash
echo '{"tool_name":"Read","tool_input":{"file_path":"/home/sonderbread/websites/thebrain-package/dlpfc/lib/db.js"},"session_id":"test","cwd":"/home/sonderbread/websites"}' | node dlpfc/hooks/read-hook.js
```
Expected: exits 0, no crash.

- [ ] **Step 3: Commit**

```bash
git add dlpfc/hooks/read-hook.js
git commit -m "feat(dlpfc): wire git briefing into read hook"
```

---

### Task 5: Wire git briefing into post-edit-hook

**Files:**
- Modify: `hooks/post-edit-hook.js`

- [ ] **Step 1: Update post-edit-hook to emit git briefing on re-engagement**

In `hooks/post-edit-hook.js`, replace the dlPFC bump block (lines 149-158):

```js
if (WorkingMemoryDB && bumpFileDlpfc) {
  try {
    const wmDb = new WorkingMemoryDB();
    const relativeToProject = path.relative(projectDir, filePath);
    const dirEntry = dirs.find(d => d.name === matchedProject);
    const reengagement = bumpFileDlpfc(wmDb, matchedProject, relativeToProject, 'edit', sessionId, dirEntry);

    if (reengagement) {
      const { checkGitChanges, hasBeenBriefed } = require('../dlpfc/lib/git-briefing');
      if (!hasBeenBriefed(sessionId, matchedProject, relativeToProject)) {
        const briefing = checkGitChanges(projectDir, relativeToProject, reengagement.lastTouchedAt);
        if (briefing) {
          process.stderr.write('[git-briefing] ' + relativeToProject + ' changed while cold: ' + briefing + '\n');
        }
      }
    }

    wmDb.close();
  } catch (err) {
    process.stderr.write('[post-edit] dlPFC bump failed: ' + err.message + '\n');
  }
}
```

- [ ] **Step 2: Verify hook runs without errors**

```bash
echo '{"tool_name":"Edit","tool_input":{"file_path":"/home/sonderbread/websites/thebrain-package/dlpfc/lib/db.js"},"session_id":"test","cwd":"/home/sonderbread/websites"}' | node hooks/post-edit-hook.js
```
Expected: exits 0, no crash.

- [ ] **Step 3: Commit**

```bash
git add hooks/post-edit-hook.js
git commit -m "feat(dlpfc): wire git briefing into post-edit hook"
```

---

## Chunk 3: Cleanup + Docs

### Task 6: State file cleanup in wrapup

**Files:**
- Modify: `scripts/wrapup-mechanical.js`

- [ ] **Step 1: Add state file cleanup to wrapup**

In `scripts/wrapup-mechanical.js`, add cleanup for `git_briefing_state_*.json` files older than 24 hours (alongside any existing hypothalamus state cleanup):

```js
// Clean up stale git briefing state files
const claudeDir = path.join(os.homedir(), '.claude');
const now = Date.now();
for (const f of fs.readdirSync(claudeDir)) {
  if (f.startsWith('git_briefing_state_') && f.endsWith('.json')) {
    const fp = path.join(claudeDir, f);
    try {
      const stat = fs.statSync(fp);
      if (now - stat.mtimeMs > 86400000) fs.unlinkSync(fp);
    } catch {}
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/wrapup-mechanical.js
git commit -m "chore: clean up stale git briefing state files during wrapup"
```

---

### Task 7: Update docs

**Files:**
- Modify: `docs/dlpfc.md`
- Modify: `docs/brain-map.md`
- Modify: `package.json`

- [ ] **Step 1: Update dlpfc.md**

Add a new section after "Opt-In Gates":

```markdown
## Git Re-engagement Briefing

When a cold file (score < 1.0) is re-engaged by a Read or Edit, the hook checks git for changes since `last_touched_at`. If commits exist, a one-line summary is emitted to stderr — visible in the conversation as a system note.

- **Not persisted** — the briefing is ephemeral, consumed once per session
- **Deduped per session** — each file briefed at most once via `git_briefing_state_<session>.json`
- **Git-aware** — skips silently if the project root is not a git repo
- **No dlpfc-live.md changes** — the generated file is unaffected

| File | Purpose |
|------|---------|
| `dlpfc/lib/git-briefing.js` | Git change check + session dedup |
```

- [ ] **Step 2: Update brain-map.md**

Add `git-briefing.js` to the dlpfc code→data section. Add `last_touched_at` to file_heat column notes.

- [ ] **Step 3: Add new test to npm test script**

In `package.json`, add `dlpfc/test/git-briefing.test.js` to the test script (specific file, not wildcard — existing dlpfc tests use Jest syntax):

```json
"test": "node --test hippocampus/test/*.test.js cerebral-cortex-v2/test/*.test.js hypothalamus/test/*.test.js scripts/test/*.test.js dlpfc/test/git-briefing.test.js test/*.test.js"
```

- [ ] **Step 4: Run full test suite**

Run: `npm test`
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add docs/dlpfc.md docs/brain-map.md package.json
git commit -m "docs: add git re-engagement briefing to dlpfc docs and test suite"
```
