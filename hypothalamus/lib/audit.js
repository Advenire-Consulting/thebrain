'use strict';

const path = require('path');
const fs = require('fs');

// ── Entry Point Detection ───────────────────────────────────────────────────

// Directory patterns — files in these dirs are entry points by convention
const DEFAULT_DIR_PATTERNS = [
  'hooks/', 'scripts/', 'extractors/', 'test/', 'tests/',
  'public/', 'migrations/', '_archived/',
];

// Filename patterns — these are entry points regardless of directory
const DEFAULT_FILE_PATTERNS = [
  'routes.js', 'public-routes.js', 'server.js', 'index.js',
  'ecosystem.config.js', 'ecosystem.config.cjs',
];

function isEntryPoint(filePath, dirPatterns, filePatterns) {
  // Check directory patterns (e.g., 'hooks/' matches both 'hooks/foo.js' and 'dlpfc/hooks/foo.js')
  for (const pattern of dirPatterns) {
    if (filePath.includes('/' + pattern) || filePath.startsWith(pattern)) {
      return true;
    }
  }
  // Check filename patterns
  const basename = path.posix.basename(filePath);
  for (const pattern of filePatterns) {
    if (basename === pattern) return true;
  }
  // Check package.json main field if provided via options
  return false;
}

// ── Import Resolution ───────────────────────────────────────────────────────

// Resolve an import path relative to the importing file, return project-relative path
// Returns null if the resolved path escapes the project root
function resolveImport(importPath, importerFile) {
  const importerDir = path.posix.dirname(importerFile);
  const resolved = path.posix.join(importerDir, importPath);

  if (resolved.startsWith('../') || resolved.startsWith('/')) return null;

  return resolved;
}

// Build set of all files that have at least one inbound import
function buildInboundSet(dirData, allFilesSet) {
  const inbound = new Set();

  for (const [fileName, entry] of Object.entries(dirData.files || {})) {
    const imports = entry.imports || [];
    for (const imp of imports) {
      if (!imp.startsWith('.') && !imp.startsWith('/')) continue;

      const resolved = resolveImport(imp, fileName);
      if (!resolved) continue;

      if (allFilesSet.has(resolved)) {
        inbound.add(resolved);
      } else if (allFilesSet.has(resolved + '.js')) {
        inbound.add(resolved + '.js');
      }
    }
  }

  return inbound;
}

// ── Orphan Detection ────────────────────────────────────────────────────────

function findOrphans(dirData, allFiles, options) {
  const dirPatterns = (options && options.entryPatterns) || DEFAULT_DIR_PATTERNS;
  const filePatterns = (options && options.filePatterns) || DEFAULT_FILE_PATTERNS;
  const allFilesSet = new Set(allFiles);
  const inbound = buildInboundSet(dirData, allFilesSet);

  // Detect library projects — if no file imports any other file in the project,
  // the entire project is consumed externally (like _shared/).
  // Only triggers when there are multiple files and zero inbound references.
  const hasAnyInternalImport = inbound.size > 0;
  const dirFileCount = Object.keys(dirData.files || {}).length;
  if (!hasAnyInternalImport && allFiles.length > 1 && dirFileCount > 0) {
    const anyImports = Object.values(dirData.files || {}).some(
      e => (e.imports || []).some(imp => imp.startsWith('.') || imp.startsWith('/'))
    );
    if (!anyImports) {
      return { orphans: [], library: true };
    }
  }

  const orphans = [];
  for (const file of allFiles) {
    if (isEntryPoint(file, dirPatterns, filePatterns)) continue;
    if (inbound.has(file)) continue;

    const dirEntry = (dirData.files || {})[file];
    orphans.push({
      file,
      exports: dirEntry && dirEntry.exports ? dirEntry.exports : null,
    });
  }

  return { orphans, library: false };
}

// ── Dependency Coherence ────────────────────────────────────────────────────

const NODE_BUILTINS = new Set([
  'fs', 'path', 'http', 'https', 'url', 'crypto', 'stream', 'events',
  'util', 'os', 'child_process', 'readline', 'net', 'tls', 'dns',
  'assert', 'buffer', 'cluster', 'console', 'dgram', 'domain',
  'module', 'perf_hooks', 'querystring', 'string_decoder',
  'timers', 'tty', 'v8', 'vm', 'worker_threads', 'zlib',
]);

// Check if a module is a Node builtin (handles subpath imports like fs/promises)
function isBuiltin(mod) {
  if (NODE_BUILTINS.has(mod) || mod.startsWith('node:')) return true;
  const base = mod.split('/')[0];
  return NODE_BUILTINS.has(base);
}

function checkDependencies(dirData, packageJson) {
  const declared = new Set([
    ...Object.keys(packageJson.dependencies || {}),
    ...Object.keys(packageJson.devDependencies || {}),
  ]);

  const usedBy = {};
  let stale = false;

  for (const [fileName, entry] of Object.entries(dirData.files || {})) {
    if (!entry.npmImports) {
      stale = true;
      continue;
    }
    for (const pkg of entry.npmImports) {
      if (isBuiltin(pkg)) continue;
      if (!usedBy[pkg]) usedBy[pkg] = [];
      usedBy[pkg].push(fileName);
    }
  }

  for (const pkg of Object.keys(usedBy)) {
    usedBy[pkg].sort();
  }

  const undeclared = Object.entries(usedBy)
    .filter(([pkg]) => !declared.has(pkg))
    .map(([pkg, files]) => ({ pkg, files }))
    .sort((a, b) => a.pkg.localeCompare(b.pkg));

  const usedPkgs = new Set(Object.keys(usedBy));
  const unused = [...declared]
    .filter(pkg => !usedPkgs.has(pkg))
    .sort();

  return { undeclared, unused, stale };
}

module.exports = { findOrphans, checkDependencies };
