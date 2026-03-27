#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { WorkingMemoryDB } = require('../lib/db');
const { bumpFile, decayAndCluster } = require('../lib/tracker');
const { writeToFile } = require('../lib/generator');
const { loadAllDIR } = require('../../hippocampus/lib/dir-loader');

const BRAIN_DIR = path.join(os.homedir(), '.claude', 'brain');
const HIPPOCAMPUS_DIR = path.join(BRAIN_DIR, 'hippocampus');
const OUTPUT_PATH = path.join(BRAIN_DIR, 'dlpfc-live.md');

function main() {
  // Resolve session ID: CLI arg > CC2 latest > null
  const sessionArg = process.argv.find(a => a.startsWith('--session='));
  let sessionId = sessionArg ? sessionArg.split('=')[1] : resolveLatestSession();

  const db = new WorkingMemoryDB();

  try {
    // Step 1: Touch reconciliation — cross-ref CC2 window_files
    reconcileFromCC2(db, sessionId);

    // Step 2: Decay + cluster (always runs with resolved session for cluster detection)
    decayAndCluster(db, sessionId || 'unknown');

    // Step 3: Generate dlpfc-live.md
    writeToFile(db, OUTPUT_PATH);

    const activeProjects = db.getActiveProjects(1.0);
    if (activeProjects.length > 0) {
      console.log(`  dlPFC: ${activeProjects.length} active project(s), output written`);
    } else {
      console.log('  dlPFC: no active files, output cleared');
    }
  } finally {
    db.close();
  }
}

// Derive session ID from most recent CC2 window
function resolveLatestSession() {
  const recallDbPath = path.join(BRAIN_DIR, 'recall.db');
  if (!fs.existsSync(recallDbPath)) return null;
  try {
    const RecallDB = require('../../cerebral-cortex-v2/lib/db').RecallDB;
    const recallDb = new RecallDB(recallDbPath);
    try {
      const latest = recallDb.db.prepare(
        'SELECT session_id FROM windows ORDER BY end_time DESC LIMIT 1'
      ).get();
      return latest ? latest.session_id : null;
    } finally {
      recallDb.close();
    }
  } catch { return null; }
}

// Cross-reference CC2's window_files for referenced but untouched files
function reconcileFromCC2(db, sessionId) {
  const recallDbPath = path.join(BRAIN_DIR, 'recall.db');
  if (!fs.existsSync(recallDbPath)) return;
  if (!fs.existsSync(HIPPOCAMPUS_DIR)) return;
  if (!sessionId) return;

  let RecallDB;
  try { RecallDB = require('../../cerebral-cortex-v2/lib/db').RecallDB; }
  catch { return; }

  const recallDb = new RecallDB(recallDbPath);
  try {
    // Get all files from this session's windows
    const windowFiles = recallDb.db.prepare(`
      SELECT DISTINCT wf.file_path, wf.tool
      FROM window_files wf
      JOIN windows w ON w.id = wf.window_id
      WHERE w.session_id = ?
    `).all(sessionId);

    if (windowFiles.length === 0) return;

    const dirs = loadAllDIR(HIPPOCAMPUS_DIR);

    for (const wf of windowFiles) {
      // Skip files already touched this session via hooks
      const existing = findExistingEntry(db, dirs, wf.file_path);
      if (existing && existing.last_session === sessionId) continue;

      // Resolve project
      let matchedProject = null;
      let relPath = wf.file_path;
      for (const dir of dirs) {
        if (wf.file_path.startsWith(dir.root)) {
          matchedProject = dir.name;
          relPath = wf.file_path.slice(dir.root.length);
          if (relPath.startsWith('/')) relPath = relPath.slice(1);
          break;
        }
      }

      if (!matchedProject) continue;
      bumpFile(db, matchedProject, relPath, 'reference', sessionId);
    }
  } finally {
    recallDb.close();
  }
}

function findExistingEntry(db, dirs, cc2FilePath) {
  for (const dir of dirs) {
    if (cc2FilePath.startsWith(dir.root)) {
      let relPath = cc2FilePath.slice(dir.root.length);
      if (relPath.startsWith('/')) relPath = relPath.slice(1);
      const entry = db.getFileHeat(dir.name, relPath);
      if (entry) return entry;
    }
  }
  return null;
}

if (require.main === module) main();
module.exports = { main, reconcileFromCC2 };
