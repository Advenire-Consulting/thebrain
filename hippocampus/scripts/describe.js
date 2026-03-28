#!/usr/bin/env node
'use strict';

/**
 * Add or update a description on a DIR file entry.
 *
 * Usage: node hippocampus/scripts/describe.js <project> <file-path> "description text"
 *
 * The DIR file is an object with files keyed by relative path:
 *   { "files": { "lib/registry.js": { "imports": [...], "description": "..." } } }
 *
 * This script sets or overwrites the "description" field on the matching entry.
 */

const fs = require('fs');
const path = require('path');

const BRAIN_DIR = process.env.BRAIN_DIR || path.join(require('os').homedir(), '.claude', 'brain');
const HIPPOCAMPUS_DIR = path.join(BRAIN_DIR, 'hippocampus');

const args = process.argv.slice(2);
if (args.length < 3) {
  console.error('Usage: describe.js <project> <file-path> "description"');
  console.error('Example: describe.js sonder-runtime lib/registry.js "Tool discovery and manifest validation"');
  process.exit(1);
}

const project = args[0];
const filePath = args[1];
const description = args.slice(2).join(' ');

const dirFile = path.join(HIPPOCAMPUS_DIR, project + '.dir.json');

if (!fs.existsSync(dirFile)) {
  console.error('DIR file not found: ' + dirFile);
  console.error('Available projects:');
  try {
    const files = fs.readdirSync(HIPPOCAMPUS_DIR).filter(f => f.endsWith('.dir.json'));
    for (const f of files) {
      console.error('  ' + f.replace('.dir.json', ''));
    }
  } catch (_) {}
  process.exit(1);
}

const dir = JSON.parse(fs.readFileSync(dirFile, 'utf8'));

if (!dir.files || typeof dir.files !== 'object') {
  console.error('DIR file has no files object');
  process.exit(1);
}

if (!dir.files[filePath]) {
  console.error('File not found in DIR: ' + filePath);
  console.error('Available files (first 20):');
  const keys = Object.keys(dir.files);
  for (let i = 0; i < Math.min(20, keys.length); i++) {
    console.error('  ' + keys[i]);
  }
  if (keys.length > 20) console.error('  ... and ' + (keys.length - 20) + ' more');
  process.exit(1);
}

dir.files[filePath].description = description;
fs.writeFileSync(dirFile, JSON.stringify(dir, null, 2));
console.log('Updated ' + project + '/' + filePath + ': ' + description);
