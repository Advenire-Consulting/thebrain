'use strict';

const fs = require('fs');
const path = require('path');

const SKIP_DIRS_EXACT = new Set([
  'node_modules', '.git', '.worktrees', 'marked-for-deletion',
  // Build output
  'bin', 'obj', 'target', 'build', 'dist', 'out',
  // Vendored dependencies
  'vendor',
  // IDE metadata
  '.vs', '.idea', '.gradle',
]);

function shouldSkipDir(name) {
  if (SKIP_DIRS_EXACT.has(name)) return true;
  const lower = name.toLowerCase();
  if (lower === 'archived' || lower === 'archive' || lower.startsWith('archived-')) return true;
  return false;
}

/**
 * Recursively collect code files in a project directory.
 * Filters by extension set. Skips node_modules, .git, Archived, etc.
 * Security: validates path stays within projectDir via path.resolve + startsWith.
 *
 * @param {string} projectDir - Root directory to scan
 * @param {Set<string>} extensionSet - Extensions to include (e.g., new Set(['.js', '.py']))
 * @returns {Array<{absolute: string, relative: string}>}
 */
function collectCodeFiles(projectDir, extensionSet) {
  const resolvedRoot = path.resolve(projectDir);
  const files = [];

  function walk(dir) {
    const resolvedDir = path.resolve(dir);
    if (!resolvedDir.startsWith(resolvedRoot)) return;

    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch (err) {
      if (err.code !== 'ENOENT' && err.code !== 'EACCES') {
        process.stderr.write(`[file-collector] Error reading ${dir}: ${err.message}\n`);
      }
      return;
    }

    for (const entry of entries) {
      if (shouldSkipDir(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && extensionSet.has(path.extname(entry.name))) {
        const relative = path.relative(projectDir, fullPath);
        files.push({ absolute: fullPath, relative });
      }
    }
  }

  walk(projectDir);
  return files;
}

module.exports = { collectCodeFiles, shouldSkipDir, SKIP_DIRS_EXACT };
