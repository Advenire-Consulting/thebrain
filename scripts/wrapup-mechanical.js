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
  const { isRegionEnabled, isFeatureEnabled } = require(path.join(THEBRAIN_DIR, 'lib', 'config'));

  // 0a. Re-scan hippocampus DIR files
  if (isRegionEnabled('hippocampus')) {
    runStep('Scanning hippocampus...', path.join(THEBRAIN_DIR, 'hippocampus', 'scripts', 'scan.js'));
  }

  // 0b. Incremental term index scan
  if (isRegionEnabled('hippocampus')) {
    runStep('Updating term index...', path.join(THEBRAIN_DIR, 'hippocampus', 'scripts', 'term-scan-cli.js'));
  }

  // 0b-flow. Flow graph scan + cross-project resolution
  if (isFeatureEnabled('hippocampus', 'flow-graph')) {
    const flowScanPath = path.join(THEBRAIN_DIR, 'hippocampus', 'scripts', 'flow-scan.js');
    const flowResolvePath = path.join(THEBRAIN_DIR, 'hippocampus', 'scripts', 'flow-resolve.js');
    if (fs.existsSync(flowScanPath)) {
      console.log('Updating flow graph...');
      try {
        execFileSync('node', [flowScanPath], { stdio: 'inherit', timeout: 30000 });
      } catch (err) {
        console.error(`  Warning: flow-scan failed: ${err.message}`);
      }
    }
    if (fs.existsSync(flowResolvePath)) {
      console.log('Resolving cross-project references...');
      try {
        execFileSync('node', [flowResolvePath], { stdio: 'inherit', timeout: 30000 });
      } catch (err) {
        console.error(`  Warning: flow-resolve failed: ${err.message}`);
      }
    }
  }

  // 0c. CC2 window scan + metadata extraction + archival
  if (isRegionEnabled('cerebral-cortex-v2')) {
    runStep('Scanning CC2 windows...', path.join(THEBRAIN_DIR, 'cerebral-cortex-v2', 'scripts', 'scan.js'));
    runStep('Extracting CC2 metadata...', path.join(THEBRAIN_DIR, 'cerebral-cortex-v2', 'scripts', 'extract.js'));
    runStep('Archiving old conversations...', path.join(THEBRAIN_DIR, 'cerebral-cortex-v2', 'scripts', 'archive.js'));
  }

  // 0d. dlPFC working memory — decay, reconcile references, generate output
  if (isRegionEnabled('dlpfc')) {
    runStep('Updating working memory (dlPFC)...', path.join(THEBRAIN_DIR, 'dlpfc', 'scripts', 'wrapup-step.js'));
  }

  // 0e. One-time PFC summary recovery (backfills lost summaries into CC2)
  const pfcRecoveryFlag = path.join(BRAIN_DIR, '.pfc-recovery-done');
  if (!fs.existsSync(pfcRecoveryFlag)) {
    runStep('Recovering PFC summaries...', path.join(THEBRAIN_DIR, 'scripts', 'migrate-pfc-summaries.js'));
  }

  // 1. Trim PFC entries and migrate overflow to CC2 recall.db
  if (isRegionEnabled('prefrontal')) {
    runStep('Trimming PFC...', path.join(THEBRAIN_DIR, 'cerebral-cortex-v2', 'scripts', 'pfc-trim.js'));
  }

  // 2. Regenerate prefrontal decision gates from signals.db
  if (isRegionEnabled('prefrontal')) {
    runStep('Regenerating prefrontal...', path.join(THEBRAIN_DIR, 'scripts', 'generate-prefrontal.js'));
  }

  // 3. Clean up stale git briefing state files (older than 24 hours)
  const claudeDir = path.join(HOME, '.claude');
  const now = Date.now();
  try {
    for (const f of fs.readdirSync(claudeDir)) {
      if (f.startsWith('git_briefing_state_') && f.endsWith('.json')) {
        const fp = path.join(claudeDir, f);
        try {
          const stat = fs.statSync(fp);
          if (now - stat.mtimeMs > 86400000) fs.unlinkSync(fp);
        } catch {}
      }
    }
  } catch {}

  // 4. Update PFC size marker
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
