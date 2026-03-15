'use strict';

const fs = require('fs');
const path = require('path');

const os = require('os');
const DEFAULT_HIPPOCAMPUS_DIR = process.env.THEBRAIN_HIPPOCAMPUS_DIR || path.join(os.homedir(), '.claude', 'brain', 'hippocampus');

/**
 * Load all .dir.json files from the hippocampus directory.
 * Returns array of parsed DIR objects. Skips malformed files.
 */
function loadAllDIR(dirPath) {
  const resolved = dirPath || DEFAULT_HIPPOCAMPUS_DIR;
  if (!fs.existsSync(resolved)) return [];

  const files = fs.readdirSync(resolved).filter(f => f.endsWith('.dir.json'));
  const dirs = [];

  for (const f of files) {
    const filePath = path.join(resolved, f);
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed.name && parsed.root) {
        dirs.push(parsed);
      }
    } catch {
      // Skip malformed files
    }
  }

  return dirs;
}

/**
 * Resolve a conversational alias to a file path + project.
 * Case-insensitive, supports substring matching.
 * Returns { path, project } or null.
 */
function resolveAlias(dirs, query) {
  const lower = query.toLowerCase();
  const candidates = [];

  for (const dir of dirs) {
    for (const [alias, filePath] of Object.entries(dir.aliases || {})) {
      const aliasLower = alias.toLowerCase();
      if (lower.includes(aliasLower) || aliasLower.includes(lower)) {
        candidates.push({ alias, path: filePath, project: dir.name, len: alias.length });
      }
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.len - a.len);
  return { path: candidates[0].path, project: candidates[0].project };
}

/**
 * Build a KNOWN_SCOPES-compatible array from DIR files.
 * Used by parser.js to replace hardcoded scopes.
 */
function buildScopeRegistry(dirs) {
  return dirs.map(dir => ({
    name: dir.name,
    aliases: Object.keys(dir.aliases || {}),
    pathDomains: [dir.root],
    pathPatterns: [],
    fallback: false,
  }));
}

/**
 * Get blast radius for a file — what it imports and what imports it.
 */
function getBlastRadius(dirs, fileName, projectName) {
  const dir = dirs.find(d => d.name === projectName);
  if (!dir || !dir.files) return { imports: [], importedBy: [] };

  const fileEntry = dir.files[fileName];
  const imports = fileEntry ? (fileEntry.imports || []) : [];

  const importedBy = [];
  for (const [name, entry] of Object.entries(dir.files)) {
    if (name === fileName) continue;
    if ((entry.imports || []).some(imp => imp.includes(fileName) || fileName.includes(path.basename(imp)))) {
      importedBy.push(name);
    }
  }

  return { imports, importedBy };
}

/**
 * Compute file freshness score by comparing file mtime to chunk timestamp.
 * Security: uses path.resolve to prevent traversal.
 *
 * Returns:
 *   1.0 — file exists, not modified since chunk time
 *   0.7 — file exists, modified after chunk time
 *   0.2 — file does not exist
 */
function getFileFreshness(filePath, chunkTimestampMs) {
  const resolved = path.resolve(filePath);
  try {
    const stat = fs.statSync(resolved);
    if (stat.mtimeMs <= chunkTimestampMs) {
      return 1.0;
    }
    return 0.7;
  } catch {
    return 0.2;
  }
}

/**
 * Compute temporal proximity score.
 * Bidirectional decay from anchor point.
 * Formula: 1.0 / (1 + 0.05 * abs(days_from_anchor))
 *
 * 0 days = 1.0, 7 days ~0.74, 30 days ~0.40, 90 days ~0.18
 */
function computeTemporalProximity(chunkTimestampMs, anchorMs) {
  const anchor = anchorMs ?? Date.now();
  const daysDiff = Math.abs(anchor - chunkTimestampMs) / (24 * 60 * 60 * 1000);
  const score = 1.0 / (1 + 0.05 * daysDiff);
  return Math.round(score * 100) / 100;
}

module.exports = {
  loadAllDIR,
  resolveAlias,
  buildScopeRegistry,
  getBlastRadius,
  getFileFreshness,
  computeTemporalProximity,
  DEFAULT_HIPPOCAMPUS_DIR,
};
