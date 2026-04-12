#!/usr/bin/env node
'use strict';

/**
 * Hypothalamus — blast radius + bash guard hook.
 *
 * Fires on Edit/Write/MultiEdit AND Bash.
 * - Edit/Write/MultiEdit: sensitivity check + blast radius (dependents)
 * - Bash: path extraction from command -> classification against hippocampus map
 *
 * Exit 0 = allow (GREEN/YELLOW/RED blast radius/AMBER/UNKNOWN — warnings on stderr)
 * Exit 2 = block (RED sensitivity — database files, secrets, project roots)
 */

const { isRegionEnabled, isFeatureEnabled } = require('../lib/config');
if (!isRegionEnabled('hypothalamus')) process.exit(0);

const fs = require('fs');
const path = require('path');
const os = require('os');

const LOGS_DIR = path.join(os.homedir(), '.claude', 'logs');
const DEBUG_LOG = path.join(LOGS_DIR, 'hypothalamus.log');

function debugLog(msg) {
  try {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
    // Truncate if over 1MB
    try {
      const stat = fs.statSync(DEBUG_LOG);
      if (stat.size > 1024 * 1024) fs.truncateSync(DEBUG_LOG, 0);
    } catch (err) {
      if (err.code !== 'ENOENT') return;
    }
    const ts = new Date().toISOString().slice(0, 23);
    fs.appendFileSync(DEBUG_LOG, `[${ts}] ${msg}\n`, { mode: 0o600 });
  } catch { /* logging must never crash the hook */ }
}

function loadState(sessionId, stateDir) {
  try {
    const filePath = path.join(stateDir, `hypothalamus_state_${sessionId}.json`);
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed);
  } catch (err) {
    if (err.code !== 'ENOENT') process.stderr.write(`[hypothalamus] State load failed: ${err.message}\n`);
    return new Set();
  }
}

function atomicWrite(filePath, data) {
  const tmpPath = filePath + '.tmp.' + process.pid;
  fs.writeFileSync(tmpPath, data, { mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
}

function saveState(sessionId, shown, stateDir) {
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    const filePath = path.join(stateDir, `hypothalamus_state_${sessionId}.json`);
    atomicWrite(filePath, JSON.stringify([...shown]));
  } catch (err) {
    process.stderr.write(`[hypothalamus] State save failed: ${err.message}\n`);
  }
}

function formatRedWarning(classification) {
  let warning = `HYPOTHALAMUS — RED: ${classification.reason}\n`;
  if (classification.tables) {
    warning += `Tables at risk: ${classification.tables.join(', ')}\n`;
  }
  if (classification.suggestion) {
    warning += `\n${classification.suggestion}\n`;
  }
  warning += `\nDo NOT proceed without explicit user confirmation. Inform them of what this command targets.`;
  return warning;
}

function main() {
  let inputData;
  try {
    inputData = JSON.parse(fs.readFileSync(0, 'utf-8'));
  } catch {
    process.exit(0);
  }

  const sessionId = inputData.session_id || 'default';
  const cwd = inputData.cwd || process.cwd();
  const toolName = inputData.tool_name || '';
  const toolInput = inputData.tool_input || {};

  const { loadConfig } = require('../hypothalamus/lib/config');
  const config = loadConfig();

  if (config.disabled) process.exit(0);

  const hippocampusDir = process.env.HYPOTHALAMUS_TEST_HIPPOCAMPUS_DIR || undefined;
  const { loadAllDIR } = require('../hippocampus/lib/dir-loader');
  const dirs = loadAllDIR(hippocampusDir);

  if (dirs.length === 0) process.exit(0);

  const websitesRoot = cwd;
  const stateDir = path.join(require('os').homedir(), '.claude', 'brain', 'hypothalamus', 'state');

  if (toolName === 'Bash') {
    handleBash(toolInput, dirs, websitesRoot, config, sessionId, stateDir);
  } else if (['Edit', 'Write', 'MultiEdit'].includes(toolName)) {
    handleEdit(toolInput, dirs, websitesRoot, config, sessionId, stateDir);
  } else {
    process.exit(0);
  }
}

function handleBash(toolInput, dirs, websitesRoot, config, sessionId, stateDir) {
  const command = toolInput.command || '';
  if (!command) process.exit(0);

  const { extractPaths } = require('../hypothalamus/lib/path-extractor');
  const { classifyPath } = require('../hypothalamus/lib/classifier');

  const extracted = extractPaths(command, websitesRoot);

  const classifications = extracted.paths.map(p => ({
    path: p,
    ...classifyPath(p, dirs, websitesRoot, config),
  }));

  const levelPriority = { RED: 4, UNKNOWN: 3, YELLOW: 2, GREEN: 1 };
  classifications.sort((a, b) => (levelPriority[b.level] || 0) - (levelPriority[a.level] || 0));

  const worst = classifications[0];

  // Handle unparseable commands (check before GREEN exit — unparseable with no paths still needs AMBER)
  if (extracted.unparseable && config.warn_on_unparseable) {
    // Session dedup for unparseable
    const shown = loadState(sessionId, stateDir);
    const warningKey = `bash-unparseable-${command.slice(0, 60)}`;
    if (shown.has(warningKey)) process.exit(0);
    shown.add(warningKey);
    saveState(sessionId, shown, stateDir);

    if (worst && worst.level === 'RED') {
      fs.writeSync(2, formatRedWarning(worst));
      debugLog(`RED+AMBER: ${command.slice(0, 80)}`);
      process.exit(2);
    }

    let warning = `HYPOTHALAMUS — AMBER: This command contains patterns that cannot be fully analyzed.\n`;
    warning += `Command: ${command.slice(0, 120)}${command.length > 120 ? '...' : ''}\n`;
    if (extracted.paths.length > 0) {
      warning += `Detected paths: ${extracted.paths.map(p => path.basename(p)).join(', ')}\n`;
    }
    warning += `\nBreak this down for the user and confirm before running.`;

    fs.writeSync(2, warning);
    debugLog(`AMBER: ${command.slice(0, 80)}`);
    process.exit(0);
  }

  if (!worst || worst.level === 'GREEN') process.exit(0);

  // Session dedup — check before any warning to avoid repeat alerts
  const shown = loadState(sessionId, stateDir);
  const warningKey = `bash-${worst.path}`;
  if (shown.has(warningKey)) process.exit(0);
  shown.add(warningKey);
  saveState(sessionId, shown, stateDir);

  if (worst.level === 'RED') {
    fs.writeSync(2, formatRedWarning(worst));
    debugLog(`RED: ${command.slice(0, 80)} -> ${worst.reason}`);
    process.exit(2);
  }

  if (worst.level === 'YELLOW') {
    let warning = `HYPOTHALAMUS — YELLOW: ${worst.reason}\n`;
    warning += `Note these connections when running this command.\n`;
    fs.writeSync(2, warning);
    debugLog(`YELLOW: ${command.slice(0, 80)}`);
    process.exit(0);
  }

  if (worst.level === 'UNKNOWN') {
    let warning = `HYPOTHALAMUS — UNKNOWN: ${worst.reason}\n`;
    warning += `This targets a location outside known projects. Confirm with the user.\n`;
    fs.writeSync(2, warning);
    debugLog(`UNKNOWN: ${command.slice(0, 80)}`);
    process.exit(0);
  }

  process.exit(0);
}

function handleEdit(toolInput, dirs, websitesRoot, config, sessionId, stateDir) {
  const filePath = toolInput.file_path || '';
  if (!filePath) process.exit(0);

  const { classifyPath } = require('../hypothalamus/lib/classifier');
  const classification = classifyPath(filePath, dirs, websitesRoot, config);

  if (classification.level === 'RED') {
    const shown = loadState(sessionId, stateDir);
    const warningKey = `edit-${filePath}`;
    if (!shown.has(warningKey)) {
      shown.add(warningKey);
      saveState(sessionId, shown, stateDir);
      fs.writeSync(2, `HYPOTHALAMUS — RED: ${classification.reason}\n${classification.suggestion || ''}\n`);
      process.exit(2);
    }
    process.exit(0);
  }

  // Blast radius for non-sensitive files
  if (!isFeatureEnabled('hypothalamus', 'blast-radius')) process.exit(0);
  const relativePath = path.relative(websitesRoot, filePath);
  const { getBlastRadius } = require('../hippocampus/lib/dir-loader');

  let matchedDir = null;
  let projectRelative = null;
  for (const dir of dirs) {
    if (relativePath.startsWith(dir.root)) {
      matchedDir = dir;
      projectRelative = relativePath.slice(dir.root.length);
      break;
    }
  }

  if (!matchedDir) process.exit(0);

  const blastRadius = getBlastRadius(dirs, projectRelative, matchedDir.name);
  const importedBy = blastRadius.importedBy;
  if (importedBy.length === 0) process.exit(0);

  const shown = loadState(sessionId, stateDir);
  const warningKey = `edit-${filePath}-${matchedDir.name}`;
  if (shown.has(warningKey)) process.exit(0);
  shown.add(warningKey);
  saveState(sessionId, shown, stateDir);

  if (importedBy.length >= 5) {
    let warning = `HYPOTHALAMUS — RED: ${path.basename(filePath)} has ${importedBy.length} dependents in ${matchedDir.name}\n`;
    warning += `Changes here cascade to:\n`;
    importedBy.slice(0, 8).forEach(f => { warning += `  - ${f}\n`; });
    if (importedBy.length > 8) warning += `  ... and ${importedBy.length - 8} more\n`;
    warning += `\nInform the user of this blast radius and confirm before proceeding.`;
    fs.writeSync(2, warning);
    process.exit(0);
  }

  let warning = `HYPOTHALAMUS — YELLOW: ${path.basename(filePath)} has ${importedBy.length} dependent(s) in ${matchedDir.name}\n`;
  warning += `Connected to:\n`;
  importedBy.forEach(f => { warning += `  - ${f}\n`; });
  warning += `\nNote these connections when making changes.`;
  fs.writeSync(2, warning);
  process.exit(0);
}

main();
