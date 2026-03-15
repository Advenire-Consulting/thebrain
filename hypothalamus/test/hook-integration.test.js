const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOOK_PATH = path.resolve(__dirname, '../../hooks/hypothalamus_hook.js');
const TEST_DIR = path.join(__dirname, '.test-hook-integration');
const STATE_DIR = path.join(process.env.HOME, '.claude');
const SESSION_PREFIXES = ['test-bash-', 'test-edit-'];

const SAMPLE_DIR = {
  name: 'test-portal',
  root: 'test-project/',
  generated_at: '2026-03-07T17:00:00Z',
  aliases: {},
  files: {
    'server.js': {
      purpose: 'Express entry',
      imports: ['./lib/db'],
      exports: ['app'],
    },
    'lib/db.js': {
      purpose: 'DB accessor',
      exports: ['getDb'],
      db: ['data/app.db'],
    },
  },
  schemas: {
    'app.db': {
      path: 'data/app.db',
      tables: { customers: 'id, name, email', orders: 'id, customer_id, total' },
    },
  },
};

function runHook(input, hippocampusDir) {
  const env = { ...process.env, HYPOTHALAMUS_TEST_HIPPOCAMPUS_DIR: hippocampusDir };
  const jsonInput = JSON.stringify(input);
  const result = spawnSync('node', [HOOK_PATH], {
    input: jsonInput,
    env,
    timeout: 5000,
    encoding: 'utf-8',
  });
  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function cleanSessionState() {
  try {
    const files = fs.readdirSync(STATE_DIR);
    for (const f of files) {
      if (SESSION_PREFIXES.some(p => f.includes(p))) {
        fs.unlinkSync(path.join(STATE_DIR, f));
      }
    }
  } catch { /* ignore */ }
}

before(() => {
  cleanSessionState();
  fs.mkdirSync(TEST_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(TEST_DIR, 'test-portal.dir.json'),
    JSON.stringify(SAMPLE_DIR, null, 2)
  );
});

after(() => {
  cleanSessionState();
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe('Hypothalamus Hook — Bash guard', () => {
  it('blocks rm -rf on project root (exit 2)', () => {
    const result = runHook({
      session_id: 'test-bash-1',
      cwd: '/home/user/websites',
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf test-project' },
    }, TEST_DIR);
    assert.equal(result.exitCode, 2);
    assert.ok(result.stderr.includes('project root'));
  });

  it('blocks rm on database file (exit 2)', () => {
    const result = runHook({
      session_id: 'test-bash-2',
      cwd: '/home/user/websites',
      tool_name: 'Bash',
      tool_input: { command: 'rm test-project/data/app.db' },
    }, TEST_DIR);
    assert.equal(result.exitCode, 2);
    assert.ok(result.stderr.includes('database'));
  });

  it('warns on unparseable command (exit 0, stderr)', () => {
    const result = runHook({
      session_id: 'test-bash-3',
      cwd: '/home/user/websites',
      tool_name: 'Bash',
      tool_input: { command: 'eval "rm -rf important"' },
    }, TEST_DIR);
    assert.equal(result.exitCode, 0);
    assert.ok(result.stderr.includes('cannot be fully analyzed'));
  });

  it('allows safe commands silently (exit 0, no stderr)', () => {
    const result = runHook({
      session_id: 'test-bash-4',
      cwd: '/home/user/websites',
      tool_name: 'Bash',
      tool_input: { command: 'ls -la test-project/' },
    }, TEST_DIR);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, '');
  });

  it('suggests archive in RED block message', () => {
    const result = runHook({
      session_id: 'test-bash-5',
      cwd: '/home/user/websites',
      tool_name: 'Bash',
      tool_input: { command: 'rm -rf test-project' },
    }, TEST_DIR);
    assert.ok(result.stderr.includes('marked-for-deletion'));
  });
});

describe('Hypothalamus Hook — Edit guard (existing behavior preserved)', () => {
  it('still warns for Edit tool targeting file with dependents', () => {
    const result = runHook({
      session_id: 'test-edit-1',
      cwd: '/home/user/websites',
      tool_name: 'Edit',
      tool_input: { file_path: '/home/user/websites/test-project/lib/db.js' },
    }, TEST_DIR);
    assert.equal(result.exitCode, 0);
    assert.ok(result.stderr.length > 0);
  });
});
