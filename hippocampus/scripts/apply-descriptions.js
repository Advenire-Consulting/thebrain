#!/usr/bin/env node
'use strict';

// One-time utility: applies descriptions from a JSON file to DIR files.
// Input: JSON file with { "project-name": { "file/path.js": "description" } }
// Reads each DIR file, adds description fields, writes back.

const fs = require('fs');
const path = require('path');
const { DEFAULT_HIPPOCAMPUS_DIR } = require('../lib/dir-loader');

const hippocampusDir = process.env.THEBRAIN_HIPPOCAMPUS_DIR || DEFAULT_HIPPOCAMPUS_DIR;
const inputFile = process.argv[2];

if (!inputFile) {
  console.error('Usage: apply-descriptions.js <descriptions.json>');
  process.exit(1);
}

const descriptions = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
let applied = 0;
let skipped = 0;

for (const [projectName, fileDescriptions] of Object.entries(descriptions)) {
  const dirPath = path.join(hippocampusDir, `${projectName}.dir.json`);
  if (!fs.existsSync(dirPath)) {
    console.log(`  Skipping ${projectName} — DIR file not found`);
    continue;
  }

  const dir = JSON.parse(fs.readFileSync(dirPath, 'utf-8'));

  for (const [fileName, description] of Object.entries(fileDescriptions)) {
    if (dir.files && dir.files[fileName]) {
      dir.files[fileName].description = description;
      applied++;
    } else {
      console.log(`  ${projectName}: ${fileName} not in files map, skipping`);
      skipped++;
    }
  }

  fs.writeFileSync(dirPath, JSON.stringify(dir, null, 2) + '\n');
  fs.chmodSync(dirPath, 0o600);
  console.log(`${projectName}: ${Object.keys(fileDescriptions).length} descriptions applied`);
}

console.log(`\nDone. ${applied} applied, ${skipped} skipped.`);
