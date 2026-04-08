// Unit tests for the .md file walker.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { walkSpecDir } = require('./walker.js');

// Build a temp directory with a known layout. Returns the temp root.
async function makeFixture(layout) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-test-'));
  for (const [rel, contents] of Object.entries(layout)) {
    const full = path.join(root, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, contents);
  }
  return root;
}

test('walkSpecDir finds .md files at any depth', async () => {
  const root = await makeFixture({
    'top.md': 'x',
    'sub/mid.md': 'x',
    'sub/deep/bottom.md': 'x',
    'sub/deep/ignored.txt': 'x',
  });
  const found = await walkSpecDir(root);
  assert.equal(found.length, 3);
  assert.ok(found.every(f => f.endsWith('.md')));
});

test('walkSpecDir skips hidden directories', async () => {
  const root = await makeFixture({
    'visible.md': 'x',
    '.hidden/secret.md': 'x',
  });
  const found = await walkSpecDir(root);
  assert.equal(found.length, 1);
  assert.match(found[0], /visible\.md$/);
});

test('walkSpecDir skips node_modules', async () => {
  const root = await makeFixture({
    'real.md': 'x',
    'node_modules/pkg/README.md': 'x',
  });
  const found = await walkSpecDir(root);
  assert.equal(found.length, 1);
});

test('walkSpecDir does not follow symlinks', async () => {
  const root = await makeFixture({
    'real.md': 'x',
    'target/inside.md': 'x',
  });
  // Create a symlink pointing back to root — would loop if followed.
  await fs.symlink(root, path.join(root, 'loop'));
  const found = await walkSpecDir(root);
  // Should find exactly real.md and target/inside.md. No loop, no duplicates.
  assert.equal(found.length, 2);
});

test('walkSpecDir returns sorted paths', async () => {
  const root = await makeFixture({
    'z.md': 'x',
    'a.md': 'x',
    'm.md': 'x',
  });
  const found = await walkSpecDir(root);
  const names = found.map(f => path.basename(f));
  assert.deepEqual(names, ['a.md', 'm.md', 'z.md']);
});

test('walkSpecDir throws on non-directory input', async () => {
  await assert.rejects(
    () => walkSpecDir('/nonexistent/path/here'),
    /not a directory/
  );
});

test('walkSpecDir is case-insensitive on .md extension', async () => {
  const root = await makeFixture({
    'lower.md': 'x',
    'upper.MD': 'x',
    'mixed.Md': 'x',
  });
  const found = await walkSpecDir(root);
  assert.equal(found.length, 3);
});
