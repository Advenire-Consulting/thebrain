#!/usr/bin/env node
'use strict';

// Archive CC2 conversation content from JSONL files older than 25 days.
// Stores rendered messages in recall.db so read-window.js can fall back
// to them after Claude Code deletes the JSONL files (~30 day expiry).

const fs = require('fs');
const path = require('path');
const { readWindow } = require('../lib/reader');
const { RecallDB, DEFAULT_RECALL_DB_PATH } = require('../lib/db');
const { loadConfig } = require('../../lib/config');

const AGE_THRESHOLD_DAYS = 25;
const MS_PER_DAY = 86400000;

// Resolve JSONL file for a session ID across configured conversation dirs
function resolveJsonlFile(sessionId, convDirs) {
  for (const dir of convDirs) {
    const filePath = path.join(dir, sessionId + '.jsonl');
    if (fs.existsSync(filePath)) return filePath;
  }
  return null;
}

// Check if a file is older than the threshold
function isOldEnough(filePath) {
  const stat = fs.statSync(filePath);
  const ageMs = Date.now() - stat.mtimeMs;
  return ageMs > AGE_THRESHOLD_DAYS * MS_PER_DAY;
}

async function main() {
  const config = loadConfig();
  const convDirs = config.conversationDirs;
  if (!convDirs || convDirs.length === 0) {
    console.log('No conversation directories configured — skipping archival.');
    return;
  }

  const db = new RecallDB(DEFAULT_RECALL_DB_PATH);

  // Check if archived_messages table exists (migration may not have run yet)
  const tableExists = db.db.prepare(
    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='archived_messages'"
  ).get();
  if (!tableExists) {
    console.log('archived_messages table not found — run migration first.');
    db.close();
    return;
  }

  // Get all windows grouped by session
  const allWindows = db.db.prepare(
    'SELECT id, session_id, seq, start_line, end_line FROM windows ORDER BY session_id, seq'
  ).all();

  // Group by session_id
  const sessionMap = new Map();
  for (const w of allWindows) {
    if (!sessionMap.has(w.session_id)) sessionMap.set(w.session_id, []);
    sessionMap.get(w.session_id).push(w);
  }

  // Check which windows are already archived
  const archivedSet = new Set(
    db.db.prepare('SELECT window_id FROM archived_messages').all().map(r => r.window_id)
  );

  let archivedWindows = 0;
  let archivedSessions = 0;

  const insertStmt = db.db.prepare(
    'INSERT OR IGNORE INTO archived_messages (window_id, messages) VALUES (?, ?)'
  );

  for (const [sessionId, windows] of sessionMap) {
    // Skip if all windows already archived
    const needsArchival = windows.some(w => !archivedSet.has(w.id));
    if (!needsArchival) continue;

    // Resolve JSONL file
    const jsonlPath = resolveJsonlFile(sessionId, convDirs);
    if (!jsonlPath) continue; // already expired — black hole

    // Check age
    if (!isOldEnough(jsonlPath)) continue;

    // Archive unarchived windows in this session
    let sessionArchived = 0;
    for (const w of windows) {
      if (archivedSet.has(w.id)) continue;
      try {
        const messages = await readWindow(jsonlPath, w.start_line, w.end_line);
        if (messages.length > 0) {
          insertStmt.run(w.id, JSON.stringify(messages));
          sessionArchived++;
        }
      } catch (err) {
        process.stderr.write(`  Warning: failed to archive window ${sessionId.slice(0, 8)} seq ${w.seq}: ${err.message}\n`);
      }
    }

    if (sessionArchived > 0) {
      archivedWindows += sessionArchived;
      archivedSessions++;
    }
  }

  db.close();

  if (archivedWindows > 0) {
    console.log(`Archived ${archivedWindows} windows from ${archivedSessions} sessions.`);
  } else {
    console.log('No conversations needed archiving.');
  }
}

main().catch(err => {
  console.error('Archive error:', err.message);
  process.exit(1);
});
