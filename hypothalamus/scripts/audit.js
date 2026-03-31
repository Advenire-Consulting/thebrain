'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadAllDIR } = require('../../hippocampus/lib/dir-loader');
const { collectCodeFiles } = require('../../hippocampus/lib/file-collector');
const { loadExtractors } = require('../../hippocampus/lib/extractor-registry');
const { findOrphans, checkDependencies } = require('../lib/audit');

const EXTRACTORS_DIR = path.join(__dirname, '..', '..', 'hippocampus', 'extractors');
const registry = loadExtractors(EXTRACTORS_DIR);

const HYPOTHALAMUS_DIR = path.join(require('os').homedir(), '.claude', 'brain', 'hypothalamus');

// Get current git commit hash (full SHA)
function getCommitHash(projectRoot) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: projectRoot, encoding: 'utf-8'
    }).trim();
  } catch {
    return null;
  }
}

// Resolve the filesystem root for a project from its DIR root field
// Assumes script is at thebrain-package/hypothalamus/scripts/audit.js
// and workspace is 3 levels up (thebrain-package -> websites)
function resolveProjectRoot(dirRoot) {
  const workspace = path.resolve(__dirname, '..', '..', '..');
  return path.join(workspace, dirRoot);
}

function auditProject(dir) {
  const projectRoot = resolveProjectRoot(dir.root);
  if (!fs.existsSync(projectRoot)) {
    console.log(`Skipping ${dir.name}: root not found at ${projectRoot}`);
    return null;
  }

  const commitHash = getCommitHash(projectRoot);
  const shortHash = commitHash ? commitHash.substring(0, 7) : 'no-git';

  console.log(`Audit: ${dir.name} (${shortHash})`);

  // Collect all code files from disk
  const allFileObjs = collectCodeFiles(projectRoot, registry.allExtensions);
  const allFiles = allFileObjs.map(f => f.relative);

  // Run orphan check
  const orphanResult = findOrphans(dir, allFiles);

  // Run dependency check if package.json exists
  let depResult = null;
  const pkgPath = path.join(projectRoot, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      depResult = checkDependencies(dir, packageJson);
    } catch {
      console.log('  Warning: could not parse package.json');
    }
  }

  // Print results
  const findings = { orphans: 0, undeclared: 0, unused: 0 };

  if (orphanResult.orphans.length > 0) {
    console.log('');
    console.log('Orphaned files (no inbound imports):');
    for (const o of orphanResult.orphans) {
      const exportsStr = o.exports ? o.exports.join(', ') : '(not in DIR)';
      console.log(`  ${o.file} — exports: ${exportsStr}`);
    }
    findings.orphans = orphanResult.orphans.length;
  }

  if (depResult) {
    if (depResult.stale) {
      console.log('');
      console.log('Dependency data stale — run hippocampus scan to populate npm imports.');
    }

    if (depResult.undeclared.length > 0 || depResult.unused.length > 0) {
      console.log('');
      console.log('Dependency issues:');
      for (const u of depResult.undeclared) {
        console.log(`  undeclared: ${u.pkg} (used in ${u.files.join(', ')})`);
      }
      for (const u of depResult.unused) {
        console.log(`  unused: ${u}`);
      }
      findings.undeclared = depResult.undeclared.length;
      findings.unused = depResult.unused.length;
    }
  }

  const total = findings.orphans + findings.undeclared + findings.unused;
  if (total === 0) {
    console.log('No issues found.');
  } else {
    console.log('');
    const parts = [];
    if (findings.orphans) parts.push(`${findings.orphans} orphan${findings.orphans > 1 ? 's' : ''}`);
    if (findings.undeclared) parts.push(`${findings.undeclared} undeclared`);
    if (findings.unused) parts.push(`${findings.unused} unused`);
    console.log(`---\n${parts.join(', ')}`);
  }

  // Store audit metadata
  fs.mkdirSync(HYPOTHALAMUS_DIR, { recursive: true });
  const metaPath = path.join(HYPOTHALAMUS_DIR, `${dir.name}.audit.json`);
  const meta = {
    commit: commitHash,
    timestamp: new Date().toISOString(),
    findings,
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');

  return findings;
}

// CLI entry
const args = process.argv.slice(2);
const dirs = loadAllDIR();

if (dirs.length === 0) {
  console.error('No DIR files found. Run: node hippocampus/scripts/scan.js');
  process.exit(1);
}

if (args[0] === '--all') {
  for (const dir of dirs) {
    auditProject(dir);
    console.log('');
  }
} else {
  const projectName = args[0];
  if (!projectName) {
    console.error('Usage: node hypothalamus/scripts/audit.js <project>');
    console.error('       node hypothalamus/scripts/audit.js --all');
    process.exit(1);
  }

  const matched = dirs.find(d => d.name === projectName || d.name.includes(projectName));
  if (!matched) {
    console.error(`No project matching "${projectName}"`);
    process.exit(1);
  }

  auditProject(matched);
}
