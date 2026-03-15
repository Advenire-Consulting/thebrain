const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const CWD = '/home/user/websites';

describe('extractPaths', () => {
  it('extracts absolute paths from simple commands', () => {
    const { extractPaths } = require('../lib/path-extractor');
    const result = extractPaths('rm /home/user/websites/advenire.consulting/test.js', CWD);
    assert.deepEqual(result.paths, ['/home/user/websites/advenire.consulting/test.js']);
    assert.equal(result.unparseable, false);
  });

  it('resolves relative paths against cwd', () => {
    const { extractPaths } = require('../lib/path-extractor');
    const result = extractPaths('rm advenire.consulting/test.js', CWD);
    assert.deepEqual(result.paths, ['/home/user/websites/advenire.consulting/test.js']);
  });

  it('resolves .. paths correctly', () => {
    const { extractPaths } = require('../lib/path-extractor');
    const result = extractPaths('mv ../secrets/key.pem .', '/home/user/websites/advenire.consulting');
    assert.ok(result.paths.includes('/home/user/websites/secrets/key.pem'));
    assert.ok(result.paths.includes('/home/user/websites/advenire.consulting'));
  });

  it('expands ~ to HOME', () => {
    const { extractPaths } = require('../lib/path-extractor');
    const result = extractPaths('cp ~/backup/db.sqlite .', CWD);
    assert.ok(result.paths.some(p => p.includes('/backup/db.sqlite')));
  });

  it('adjusts cwd for inline cd commands', () => {
    const { extractPaths } = require('../lib/path-extractor');
    const result = extractPaths('cd advenire.consulting && rm -rf src', CWD);
    assert.ok(result.paths.includes('/home/user/websites/advenire.consulting/src'));
  });

  it('extracts multiple paths from mv command', () => {
    const { extractPaths } = require('../lib/path-extractor');
    const result = extractPaths('mv advenire.consulting /tmp/backup/', CWD);
    assert.equal(result.paths.length, 2);
  });

  it('ignores flags and options', () => {
    const { extractPaths } = require('../lib/path-extractor');
    const result = extractPaths('rm -rf --no-preserve-root advenire.consulting', CWD);
    assert.deepEqual(result.paths, ['/home/user/websites/advenire.consulting']);
  });

  it('marks eval commands as unparseable', () => {
    const { extractPaths } = require('../lib/path-extractor');
    const result = extractPaths('eval "rm -rf important"', CWD);
    assert.equal(result.unparseable, true);
  });

  it('marks subshell commands as unparseable', () => {
    const { extractPaths } = require('../lib/path-extractor');
    const result = extractPaths('rm $(cat targets.txt)', CWD);
    assert.equal(result.unparseable, true);
  });

  it('marks env variable paths as unparseable', () => {
    const { extractPaths } = require('../lib/path-extractor');
    const result = extractPaths('rm -rf $DEPLOY_DIR', CWD);
    assert.equal(result.unparseable, true);
  });

  it('marks piped xargs as unparseable', () => {
    const { extractPaths } = require('../lib/path-extractor');
    const result = extractPaths('find . -name "*.db" | xargs rm', CWD);
    assert.equal(result.unparseable, true);
  });

  it('marks script execution as unparseable', () => {
    const { extractPaths } = require('../lib/path-extractor');
    const result = extractPaths('bash destroy-everything.sh', CWD);
    assert.equal(result.unparseable, true);
  });

  it('extracts quoted paths with spaces', () => {
    const { extractPaths } = require('../lib/path-extractor');
    const result = extractPaths('rm "my project/file.js"', CWD);
    assert.deepEqual(result.paths, ['/home/user/websites/my project/file.js']);
  });

  it('returns empty paths for non-filesystem commands', () => {
    const { extractPaths } = require('../lib/path-extractor');
    const result = extractPaths('echo hello world', CWD);
    assert.deepEqual(result.paths, []);
    assert.equal(result.unparseable, false);
  });

  it('does not flag npm commands as unparseable', () => {
    const { extractPaths } = require('../lib/path-extractor');
    const result = extractPaths('npm install express', CWD);
    assert.equal(result.unparseable, false);
  });

  it('extracts paths from git checkout', () => {
    const { extractPaths } = require('../lib/path-extractor');
    const result = extractPaths('git checkout -- advenire.consulting/server.js', CWD);
    assert.ok(result.paths.includes('/home/user/websites/advenire.consulting/server.js'));
  });

  it('extracts paths from semicolon-chained commands', () => {
    const { extractPaths } = require('../lib/path-extractor');
    const result = extractPaths('rm file1.js; rm file2.js', CWD);
    assert.equal(result.paths.length, 2);
  });

  it('strips heredoc content — does not extract paths from heredoc body', () => {
    const { extractPaths } = require('../lib/path-extractor');
    const cmd = "cat >> ~/.claude/brain/prefrontal-cortex.md << 'PFCEOF'\nFiles: sonder-runtime/lib/database.js\nNext: Task 5\nPFCEOF";
    const result = extractPaths(cmd, CWD);
    // Should only see the target file (prefrontal-cortex.md), not files mentioned in heredoc body
    const basenames = result.paths.map(p => p.split('/').pop());
    assert.ok(!basenames.includes('database.js'), 'heredoc body paths should be stripped');
  });
});
