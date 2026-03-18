#!/usr/bin/env node
'use strict';

// Surfaces files in DIR maps that have no narrative description.
// Used during wrapup so Claude can fill in descriptions for files
// it worked on while it still has session context.

const fs = require('fs');
const path = require('path');
const { DEFAULT_HIPPOCAMPUS_DIR } = require('../lib/dir-loader');

const hippocampusDir = process.env.THEBRAIN_HIPPOCAMPUS_DIR || DEFAULT_HIPPOCAMPUS_DIR;
const projectFilter = process.argv[2] || null;

const dirFiles = fs.readdirSync(hippocampusDir).filter(f => f.endsWith('.dir.json'));
let totalUndescribed = 0;

for (const file of dirFiles) {
  const dir = JSON.parse(fs.readFileSync(path.join(hippocampusDir, file), 'utf-8'));
  if (projectFilter && !dir.name.includes(projectFilter)) continue;

  const undescribed = [];
  for (const [fileName, entry] of Object.entries(dir.files || {})) {
    if (!entry.description) undescribed.push(fileName);
  }

  if (undescribed.length > 0) {
    console.log(`${dir.name}: ${undescribed.length} undescribed`);
    for (const f of undescribed) {
      console.log(`  ${f}`);
    }
    totalUndescribed += undescribed.length;
  }
}

if (totalUndescribed === 0) {
  console.log('All mapped files have descriptions.');
} else {
  console.log(`\n${totalUndescribed} total undescribed files.`);
}
