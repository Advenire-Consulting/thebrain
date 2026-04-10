'use strict';

const path = require('path');
const fs = require('fs');
const { TermDB } = require('../lib/term-db');
const { termScanProject } = require('../lib/term-scanner');
const { loadAllDIR } = require('../lib/dir-loader');

const WEBSITES_DIR = path.resolve(__dirname, '../../..');

// Derive project list from DIR files — no hardcoded list to fall out of sync
const dirs = loadAllDIR();
const PROJECTS = dirs.map(d => ({
  dir: d.root.replace(/\/$/, ''),
  name: d.name,
}));

const forceFlag = process.argv.includes('--force');

const db = new TermDB();

console.log(`Term index scan (${forceFlag ? 'full' : 'incremental'})...`);

let totalScanned = 0, totalSkipped = 0, totalRemoved = 0;

for (const proj of PROJECTS) {
  const projectDir = path.join(WEBSITES_DIR, proj.dir);
  if (!fs.existsSync(projectDir)) {
    console.log(`  SKIP ${proj.name} -- not found`);
    continue;
  }

  if (forceFlag) {
    const files = db.getProjectFiles(proj.name);
    for (const f of files) db.removeFile(f.id);
  }

  const result = termScanProject(db, projectDir, proj.name);
  totalScanned += result.scanned;
  totalSkipped += result.skipped;
  totalRemoved += result.removed;

  if (result.scanned > 0 || result.removed > 0) {
    console.log(`  ${proj.name}: ${result.scanned} scanned, ${result.skipped} skipped, ${result.removed} removed`);
  }
}

db.close();
console.log(`Done. ${totalScanned} scanned, ${totalSkipped} skipped, ${totalRemoved} removed.`);
