'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Auto-discover flow extractors from subdirectories.
 * Each subdirectory must have an index.js exporting { extensions: string[], extract: fn }.
 * Returns Map<extension, extractor>.
 */
function loadFlowExtractors(extractorsDir) {
  const byExtension = new Map();

  let entries;
  try {
    entries = fs.readdirSync(extractorsDir, { withFileTypes: true });
  } catch (err) {
    if (err.code !== 'ENOENT') {
      process.stderr.write(`[flow-extractor-registry] Error reading ${extractorsDir}: ${err.message}\n`);
    }
    return byExtension;
  }

  for (const entry of entries) {
    // Only process directories
    if (!entry.isDirectory()) continue;

    const indexPath = path.join(extractorsDir, entry.name, 'index.js');
    if (!fs.existsSync(indexPath)) continue;

    let mod;
    try {
      mod = require(indexPath);
    } catch (err) {
      process.stderr.write(`[flow-extractor-registry] Failed to load ${entry.name}: ${err.message}\n`);
      continue;
    }

    // Validate interface: must have extensions array and extract function
    if (!mod.extensions || !Array.isArray(mod.extensions) || mod.extensions.length === 0) {
      process.stderr.write(`[flow-extractor-registry] ${entry.name} missing extensions array — skipped\n`);
      continue;
    }
    if (typeof mod.extract !== 'function') {
      process.stderr.write(`[flow-extractor-registry] ${entry.name} missing extract() method — skipped\n`);
      continue;
    }

    // Map each extension to this extractor
    for (const ext of mod.extensions) {
      if (byExtension.has(ext)) {
        process.stderr.write(`[flow-extractor-registry] Extension ${ext} claimed by multiple extractors — ${entry.name} ignored\n`);
        continue;
      }
      byExtension.set(ext, mod);
    }
  }

  return byExtension;
}

module.exports = { loadFlowExtractors };
