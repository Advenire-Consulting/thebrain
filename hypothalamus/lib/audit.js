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

module.exports = { findOrphans };
