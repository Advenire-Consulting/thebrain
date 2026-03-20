'use strict';

const fs = require('fs');
const path = require('path');

const REQUIRED_METHODS = [
  'extractImports', 'extractExports', 'extractRoutes',
  'extractIdentifiers', 'extractDefinitions',
];

/**
 * Auto-load all extractor files from a directory.
 * Each file must export { extensions: string[], ...methods }.
 * Validates shape; skips invalid files with a warning.
 *
 * @param {string} extractorsDir - Path to extractors/ directory
 * @returns {{ byExtension: Map, allExtensions: Set, extractors: Array }}
 */
function loadExtractors(extractorsDir) {
  const byExtension = new Map();
  const allExtensions = new Set();
  const extractors = [];

  let files;
  try {
    files = fs.readdirSync(extractorsDir).filter(f => f.endsWith('.js'));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      process.stderr.write(`[extractor-registry] Error reading ${extractorsDir}: ${err.message}\n`);
    }
    return { byExtension, allExtensions, extractors };
  }

  for (const file of files) {
    const filePath = path.resolve(extractorsDir, file);
    let mod;
    try {
      mod = require(filePath);
    } catch (err) {
      console.warn('[extractor-registry] Failed to load ' + file + ': ' + err.message);
      continue;
    }

    if (!mod.extensions || !Array.isArray(mod.extensions) || mod.extensions.length === 0) {
      continue;
    }

    const missing = REQUIRED_METHODS.filter(m => typeof mod[m] !== 'function');
    if (missing.length > 0) {
      console.warn('[extractor-registry] ' + file + ' missing methods: ' + missing.join(', ') + ' — skipped');
      continue;
    }

    extractors.push(mod);

    for (const ext of mod.extensions) {
      if (byExtension.has(ext)) {
        console.warn('[extractor-registry] Extension ' + ext + ' claimed by multiple extractors — ' + file + ' ignored for ' + ext);
        continue;
      }
      byExtension.set(ext, mod);
      allExtensions.add(ext);
    }
  }

  return { byExtension, allExtensions, extractors };
}

module.exports = { loadExtractors };
