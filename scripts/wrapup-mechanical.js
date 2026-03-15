#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const HOME = os.homedir();
const BRAIN_DIR = path.join(HOME, '.claude', 'brain');
const PFC_CORTEX = path.join(BRAIN_DIR, 'prefrontal-cortex.md');
const PFC_SIZE_FILE = path.join(BRAIN_DIR, '.pfc-loaded-size');
const THEBRAIN_DIR = path.resolve(__dirname, '..');

function runStep(label, scriptPath) {
  if (!fs.existsSync(scriptPath)) return;
  console.log(label);
  try {
    execFileSync('node', [scriptPath], { stdio: 'inherit' });
  } catch (err) {
    console.error(`  Warning: ${path.basename(scriptPath)} failed: ${err.message}`);
  }
}

function main() {
  // 0a. Re-scan hippocampus DIR files
  runStep('Scanning hippocampus...', path.join(THEBRAIN_DIR, 'hippocampus', 'scripts', 'scan.js'));

  // 0b. Incremental term index scan
  runStep('Updating term index...', path.join(THEBRAIN_DIR, 'hippocampus', 'scripts', 'term-scan-cli.js'));

  // 0c. CC2 window scan + metadata extraction
  runStep('Scanning CC2 windows...', path.join(THEBRAIN_DIR, 'cerebral-cortex-v2', 'scripts', 'scan.js'));
  runStep('Extracting CC2 metadata...', path.join(THEBRAIN_DIR, 'cerebral-cortex-v2', 'scripts', 'extract.js'));

  // 1. Trim PFC entries and migrate overflow to CC2 recall.db
  runStep('Trimming PFC...', path.join(THEBRAIN_DIR, 'cerebral-cortex-v2', 'scripts', 'pfc-trim.js'));

  // 2. Regenerate prefrontal decision gates from signals.db
  runStep('Regenerating prefrontal...', path.join(THEBRAIN_DIR, 'scripts', 'generate-prefrontal.js'));

  // 3. Update PFC size marker
  try {
    if (fs.existsSync(PFC_CORTEX)) {
      const size = fs.statSync(PFC_CORTEX).size;
      fs.writeFileSync(PFC_SIZE_FILE, String(size));
    } else {
      fs.writeFileSync(PFC_SIZE_FILE, '0');
    }
    console.log(`Done. Size marker: ${fs.readFileSync(PFC_SIZE_FILE, 'utf-8').trim()} bytes`);
  } catch (err) {
    console.error(`Warning: PFC size marker update failed: ${err.message}`);
  }
}

main();
