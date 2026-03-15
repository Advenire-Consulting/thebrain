#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { TermDB } = require('../hippocampus/lib/term-db');
const { scanSingleFile } = require('../hippocampus/lib/term-scanner');
const { loadExtractors } = require('../hippocampus/lib/extractor-registry');
const extractorRegistry = loadExtractors(path.join(__dirname, '../hippocampus/extractors'));
const { loadAllDIR } = require('../hippocampus/lib/dir-loader');

/**
 * Update term index for a single file after edit.
 */
function updateSingleFile(db, absolutePath, projectName, projectDir) {
  let stat;
  try {
    stat = fs.statSync(absolutePath);
  } catch {
    const relativePath = path.relative(projectDir, absolutePath);
    const meta = db.getFileMeta(projectName, relativePath);
    if (meta) db.removeFile(meta.id);
    return;
  }

  const content = fs.readFileSync(absolutePath, 'utf-8');
  const relativePath = path.relative(projectDir, absolutePath);
  scanSingleFile(db, absolutePath, relativePath, projectName, content, stat);
}

/**
 * Update a single file's entry in the project's DIR file.
 */
function updateDIREntry(absolutePath, projectDir, projectName, hippocampusDir) {
  const dirFilePath = path.join(hippocampusDir, `${projectName}.dir.json`);
  if (!fs.existsSync(dirFilePath)) return;

  let dir;
  try { dir = JSON.parse(fs.readFileSync(dirFilePath, 'utf-8')); }
  catch { return; }

  const relativePath = path.relative(projectDir, absolutePath);

  if (!fs.existsSync(absolutePath)) {
    delete dir.files[relativePath];
    fs.writeFileSync(dirFilePath, JSON.stringify(dir, null, 2) + '\n');
    return;
  }

  const content = fs.readFileSync(absolutePath, 'utf-8');
  const ext = path.extname(absolutePath);
  const extractor = extractorRegistry.byExtension.get(ext);
  const imports = extractor ? extractor.extractImports(relativePath, content) : [];
  const exports_ = extractor ? extractor.extractExports(relativePath, content) : [];
  const routes = extractor ? extractor.extractRoutes(relativePath, content) : [];

  const entry = { purpose: (dir.files[relativePath] || {}).purpose || '' };
  if (imports.length > 0) entry.imports = imports;
  if (exports_.length > 0) entry.exports = exports_;
  if (routes.length > 0) entry.routes = routes;

  const dbRefs = content.match(/['"]([^'"]+\.(?:db|sqlite))['"]/g);
  if (dbRefs) {
    entry.db = [...new Set(dbRefs.map(r => r.replace(/['"]/g, '')))];
  }
  if (entry.db && entry.db.length > 0) entry.sensitivity = 'data';

  // Preserve manually-set sensitivity
  if (dir.files[relativePath] && dir.files[relativePath].sensitivity && !entry.sensitivity) {
    entry.sensitivity = dir.files[relativePath].sensitivity;
  }

  dir.files[relativePath] = entry;
  dir.generated_at = new Date().toISOString();
  fs.writeFileSync(dirFilePath, JSON.stringify(dir, null, 2) + '\n');
}

/**
 * Reset hypothalamus warning state for a file so it can re-warn
 * based on updated blast radius data.
 */
function resetHypothalamusWarning(sessionId, filePath) {
  const stateFile = path.join(require('os').homedir(), '.claude', `hypothalamus_state_${sessionId}.json`);
  try {
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
    const filtered = state.filter(key => !key.includes(filePath));
    if (filtered.length !== state.length) {
      fs.writeFileSync(stateFile, JSON.stringify(filtered));
    }
  } catch { /* no state file — nothing to reset */ }
}

// CLI entry point — called by hooks.json PostToolUse
if (require.main === module) {
  let inputData;
  try { inputData = JSON.parse(fs.readFileSync(0, 'utf-8')); }
  catch { process.exit(0); }

  const toolName = inputData.tool_name || '';
  const toolInput = inputData.tool_input || {};
  const sessionId = inputData.session_id || 'default';

  if (!['Edit', 'Write', 'MultiEdit'].includes(toolName)) process.exit(0);

  const filePath = toolInput.file_path || '';
  if (!filePath) process.exit(0);

  const ext = path.extname(filePath);
  if (!extractorRegistry.allExtensions.has(ext)) process.exit(0);

  const cwd = inputData.cwd || process.cwd();
  const hippocampusDir = path.join(require('os').homedir(), '.claude/brain/hippocampus');

  const dirs = loadAllDIR(hippocampusDir);
  const relativeToCwd = path.relative(cwd, filePath);

  let matchedProject = null;
  let projectDir = null;
  for (const dir of dirs) {
    if (relativeToCwd.startsWith(dir.root)) {
      matchedProject = dir.name;
      projectDir = path.join(cwd, dir.root);
      break;
    }
  }

  if (!matchedProject) process.exit(0);

  const db = new TermDB();
  try { updateSingleFile(db, filePath, matchedProject, projectDir); }
  finally { db.close(); }

  updateDIREntry(filePath, projectDir, matchedProject, hippocampusDir);
  resetHypothalamusWarning(sessionId, filePath);

  process.exit(0);
}

module.exports = { updateSingleFile, updateDIREntry, resetHypothalamusWarning };
