'use strict';

const path = require('path');

const DEFAULT_ENTRY_PATTERNS = [
  'hooks/', 'scripts/', 'extractors/', 'test/', 'public/', 'migrations/',
];

// Check if a file path matches any entry point pattern
// Patterns like 'hooks/' match both top-level and nested (e.g., 'dlpfc/hooks/')
function isEntryPoint(filePath, patterns) {
  for (const pattern of patterns) {
    if (filePath.includes('/' + pattern) || filePath.startsWith(pattern)) {
      return true;
    }
  }
  return false;
}

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

function findOrphans(dirData, allFiles, options) {
  const patterns = (options && options.entryPatterns) || DEFAULT_ENTRY_PATTERNS;
  const allFilesSet = new Set(allFiles);
  const inbound = buildInboundSet(dirData, allFilesSet);

  const orphans = [];
  for (const file of allFiles) {
    if (isEntryPoint(file, patterns)) continue;
    if (inbound.has(file)) continue;

    const dirEntry = (dirData.files || {})[file];
    orphans.push({
      file,
      exports: dirEntry && dirEntry.exports ? dirEntry.exports : null,
    });
  }

  return { orphans };
}

// ── Dependency Coherence ────────────────────────────────────────────────────

const NODE_BUILTINS = new Set([
  'fs', 'path', 'http', 'https', 'url', 'crypto', 'stream', 'events',
  'util', 'os', 'child_process', 'readline', 'net', 'tls', 'dns',
  'assert', 'buffer', 'cluster', 'console', 'dgram', 'domain',
  'module', 'perf_hooks', 'querystring', 'string_decoder',
  'timers', 'tty', 'v8', 'vm', 'worker_threads', 'zlib',
]);

function isBuiltin(mod) {
  return NODE_BUILTINS.has(mod) || mod.startsWith('node:');
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
