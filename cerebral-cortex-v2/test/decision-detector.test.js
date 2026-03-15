const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

function writeTempJsonl(lines) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc2-detect-'));
  const fp = path.join(dir, 'test-session.jsonl');
  fs.writeFileSync(fp, lines.map(l => JSON.stringify(l)).join('\n') + '\n');
  return { dir, filePath: fp };
}

function userMsg(text) {
  return { type: 'user', timestamp: '2026-03-01T10:00:00Z', message: { content: text } };
}

function assistantText(id, text) {
  return { type: 'assistant', timestamp: '2026-03-01T10:01:00Z', requestId: 'r' + id, message: { content: [{ type: 'text', text }] } };
}

function assistantRead(id, filePath) {
  return {
    type: 'assistant', timestamp: '2026-03-01T10:01:00Z', requestId: 'r' + id,
    message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: filePath } }] }
  };
}

function assistantEdit(id, filePath) {
  return {
    type: 'assistant', timestamp: '2026-03-01T10:02:00Z', requestId: 'r' + id,
    message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: filePath } }] }
  };
}

function assistantWrite(id, filePath) {
  return {
    type: 'assistant', timestamp: '2026-03-01T10:02:00Z', requestId: 'r' + id,
    message: { content: [{ type: 'tool_use', name: 'Write', input: { file_path: filePath } }] }
  };
}

describe('decision-detector', () => {
  it('detects a single Read → discussion → Edit decision', () => {
    const { dir, filePath } = writeTempJsonl([
      assistantRead(0, '/home/testuser/projects/src/server.js'),
      userMsg('I see the server config is wrong'),
      assistantText(2, 'Yes, the port binding is unsafe'),
      userMsg('fix it'),
      assistantEdit(4, '/home/testuser/projects/src/server.js'),
    ]);

    const { detectDecisions } = require('../lib/decision-detector');
    const decisions = detectDecisions(filePath, 0, 4);

    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].status, 'decided');
    assert.ok(decisions[0].fileAnchors.some(f => f.includes('server.js')));
    assert.equal(decisions[0].startLine, 0);
    assert.equal(decisions[0].endLine, 4);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('detects two sequential decisions', () => {
    const { dir, filePath } = writeTempJsonl([
      assistantRead(0, '/home/testuser/projects/src/server.js'),
      userMsg('fix the port'),
      assistantEdit(2, '/home/testuser/projects/src/server.js'),
      assistantRead(3, '/home/testuser/projects/src/auth.js'),
      userMsg('add rate limiting'),
      assistantText(5, 'I will add rate limiting'),
      userMsg('yes'),
      assistantEdit(7, '/home/testuser/projects/src/auth.js'),
    ]);

    const { detectDecisions } = require('../lib/decision-detector');
    const decisions = detectDecisions(filePath, 0, 7);

    assert.equal(decisions.length, 2);
    assert.ok(decisions[0].fileAnchors.some(f => f.includes('server.js')));
    assert.ok(decisions[1].fileAnchors.some(f => f.includes('auth.js')));
    assert.ok(decisions[0].endLine < decisions[1].startLine);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('detects parked topics (discussion with no Write/Edit)', () => {
    const { dir, filePath } = writeTempJsonl([
      assistantRead(0, '/home/testuser/projects/src/server.js'),
      userMsg('fix the port'),
      assistantEdit(2, '/home/testuser/projects/src/server.js'),
      userMsg('we should also add a burger sidebar'),
      assistantText(4, 'Good idea, we can make the nav collapsible'),
      userMsg('lets park that for later'),
    ]);

    const { detectDecisions } = require('../lib/decision-detector');
    const decisions = detectDecisions(filePath, 0, 5);

    assert.equal(decisions.length, 2);
    assert.equal(decisions[0].status, 'decided');
    assert.equal(decisions[1].status, 'parked');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('matches Write/Edit to explored files by directory', () => {
    const { dir, filePath } = writeTempJsonl([
      assistantRead(0, '/home/testuser/projects/src/auth/login.js'),
      userMsg('we need a new middleware'),
      assistantWrite(2, '/home/testuser/projects/src/auth/middleware.js'),
    ]);

    const { detectDecisions } = require('../lib/decision-detector');
    const decisions = detectDecisions(filePath, 0, 2);

    assert.equal(decisions.length, 1);
    assert.equal(decisions[0].status, 'decided');

    fs.rmSync(dir, { recursive: true, force: true });
  });
});
