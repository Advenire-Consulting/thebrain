// Recursive .md file walker used by spec-check to discover spec/plan docs in a folder.
// Symlink-safe (does not follow), skips hidden dirs and node_modules, sorts deterministically.

const fs = require('fs/promises');
const path = require('path');

// Walk rootPath recursively and return a sorted list of .md file paths.
async function walkSpecDir(rootPath) {
  const stat = await fs.lstat(rootPath).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`walkSpecDir: not a directory: ${rootPath}`);
  }
  const out = [];
  await walkInto(rootPath, out);
  out.sort();
  return out;
}

// Recursive helper — pushes matching files into `out`.
async function walkInto(dir, out) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;          // skip hidden
    if (entry.name === 'node_modules') continue;        // skip deps
    const full = path.join(dir, entry.name);
    const lstat = await fs.lstat(full);
    if (lstat.isSymbolicLink()) continue;               // no symlink follow
    if (lstat.isDirectory()) {
      await walkInto(full, out);
    } else if (lstat.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      out.push(full);
    }
  }
}

module.exports = { walkSpecDir };
