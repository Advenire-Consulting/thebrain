#!/usr/bin/env node

/**
 * Read a CC2 window's conversational content.
 *
 * Usage:
 *   node read-window.js <session-prefix> <seq> [--focus start-end]
 *   node read-window.js 5390cc74 0 --focus 51-483
 *
 * Output: user messages (full) + assistant text blocks (full, tool blocks stripped).
 * Parsing logic borrowed from conversation-explorer/index-conversations.js.
 */

const fs = require('fs');
const path = require('path');

const { loadConfig } = require('../../lib/config');
const { readWindow, compactMessages } = require('../lib/reader');
const CONV_DIRS = loadConfig().conversationDirs;

// Load archived messages for a window when JSONL is missing
function loadArchivedMessages(sessionPrefix, seq) {
  try {
    const { RecallDB, DEFAULT_RECALL_DB_PATH } = require('../lib/db');
    const db = new RecallDB(DEFAULT_RECALL_DB_PATH);
    const tableExists = db.db.prepare(
      "SELECT 1 FROM sqlite_master WHERE type='table' AND name='archived_messages'"
    ).get();
    if (!tableExists) { db.close(); return null; }

    const winRow = db.db.prepare(
      'SELECT w.id FROM windows w WHERE w.session_id LIKE ? AND w.seq = ?'
    ).get(sessionPrefix + '%', seq);
    if (!winRow) { db.close(); return null; }

    const row = db.db.prepare(
      'SELECT messages FROM archived_messages WHERE window_id = ?'
    ).get(winRow.id);
    db.close();
    if (!row) return null;
    return JSON.parse(row.messages);
  } catch {
    return null;
  }
}

// Resolve session prefix to JSONL file
function resolveFile(sessionPrefix) {
  for (const dir of CONV_DIRS) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl') && f.startsWith(sessionPrefix));
    if (files.length > 0) return path.join(dir, files[0]);
  }
  return null;
}

// Get window line range from windows.json
function getWindowRange(sessionPrefix, seq) {
  const { DEFAULT_WINDOWS_PATH } = require('../lib/db');
  const indexPath = DEFAULT_WINDOWS_PATH;
  if (!fs.existsSync(indexPath)) return null;
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));

  for (const [sessionId, data] of Object.entries(index)) {
    if (sessionId.startsWith(sessionPrefix) && data.windows) {
      const windows = data.windows;
      if (seq < windows.length) {
        return { start: windows[seq].startLine, end: windows[seq].endLine };
      }
    }
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('Usage: node read-window.js <session-prefix> <seq> [--focus start-end] [--full] [--digest] [--decision N [--why]]');
    process.exit(1);
  }

  const sessionPrefix = args[0];
  const seq = parseInt(args[1], 10);
  const fullMode = args.includes('--full');

  // Parse --focus
  let focusStart = null, focusEnd = null;
  const focusIdx = args.indexOf('--focus');
  if (focusIdx !== -1 && args[focusIdx + 1]) {
    const [s, e] = args[focusIdx + 1].split('-').map(Number);
    focusStart = s;
    focusEnd = e;
  }

  const digestMode = args.includes('--digest');

  // Parse --decision N [--why]
  let decisionNum = null;
  let decisionWhy = false;
  const decIdx = args.indexOf('--decision');
  if (decIdx !== -1 && args[decIdx + 1]) {
    decisionNum = parseInt(args[decIdx + 1], 10);
    decisionWhy = args.includes('--why');
  }

  // Database-only modes (digest, decision)
  if (digestMode || decisionNum != null) {
    const { RecallDB, DEFAULT_RECALL_DB_PATH } = require('../lib/db');
    const DB_PATH = DEFAULT_RECALL_DB_PATH;
    const db = new RecallDB(DB_PATH);
    const allWins = db.db.prepare("SELECT * FROM windows WHERE session_id LIKE ? AND seq = ?").all(sessionPrefix + '%', seq);
    const winRow = allWins[0];
    if (!winRow) {
      console.error('Window not found in database');
      db.close();
      process.exit(1);
    }
    const decisions = db.getDecisions(winRow.id);
    const summary = db.getSummary(winRow.id);

    if (digestMode) {
      console.log(`Session: ${winRow.session_id.slice(0, 8)}...`);
      console.log(`Window: seq ${seq} | lines ${winRow.start_line}-${winRow.end_line} | digest`);
      if (summary) {
        console.log(`Scope: ${summary.scope || 'unknown'}`);
        console.log(`Summary: ${summary.summary}`);
      }
      console.log('='.repeat(60));

      if (decisions.length === 0) {
        console.log('\nNo decisions detected for this window.');
      } else {
        for (const d of decisions) {
          const statusTag = d.status !== 'decided' ? ` (${d.status})` : '';
          const anchors = d.file_anchors ? JSON.parse(d.file_anchors) : [];
          const anchorNames = [...new Set(anchors.map(f => f.split('/').pop()))];
          const anchorStr = anchorNames.length > 0 ? ' -> ' + anchorNames.join(', ') : '';
          console.log(`\n  ${d.seq}. ${d.summary}${statusTag}${anchorStr}`);
          console.log(`     Lines: ${d.start_line}-${d.end_line}`);
        }
      }

      console.log('\n' + decisions.length + ' decisions');
      db.close();
      return;
    }

    if (decisionNum != null) {
      const target = decisions.find(d => d.seq === decisionNum);
      if (!target) {
        console.error('Decision ' + decisionNum + ' not found. This window has ' + decisions.length + ' decisions (0-' + (decisions.length - 1) + ').');
        db.close();
        process.exit(1);
      }

      let readStart = target.start_line;
      if (decisionWhy && decisionNum > 0) {
        const prev = decisions.find(d => d.seq === decisionNum - 1);
        if (prev) readStart = prev.end_line + 1;
      } else if (decisionWhy && decisionNum === 0) {
        readStart = winRow.start_line;
      }

      const decFilePath = resolveFile(sessionPrefix);
      let messages;

      if (decFilePath) {
        messages = await readWindow(decFilePath, readStart, target.end_line);
      } else {
        // JSONL missing — try archived content
        const archived = loadArchivedMessages(sessionPrefix, seq);
        if (!archived) {
          console.log('Conversation content not available for this decision (JSONL expired, no archive).');
          db.close();
          process.exit(0);
        }
        messages = archived.filter(m => m.ln >= readStart && m.ln <= target.end_line);
      }

      const mode = decisionWhy ? 'decision + reasoning' : 'decision';
      const sourceLabel = decFilePath ? '' : ' | archived';
      console.log(`Session: ${winRow.session_id.slice(0, 8)}...`);
      console.log(`Window: seq ${seq} | Decision ${decisionNum} | lines ${readStart}-${target.end_line} | ${mode}${sourceLabel}`);
      console.log(`Decision: ${target.summary}`);
      console.log('='.repeat(60));
      const output = fullMode ? messages : compactMessages(messages);

      for (const msg of output) {
        if (msg.type === 'skip') {
          console.log(`\n  [...${msg.count} Claude messages skipped — lines ${msg.startLine}-${msg.endLine}]`);
        } else {
          const role = msg.type === 'user' ? 'Human' : 'Claude';
          console.log(`\n[${role}] (line ${msg.ln})`);
          console.log(msg.text);
        }
      }

      db.close();
      return;
    }
  }

  const filePath = resolveFile(sessionPrefix);

  if (!filePath) {
    // JSONL missing — try archived content
    const range = getWindowRange(sessionPrefix, seq);
    if (!range) {
      console.error(`Window seq ${seq} not found for session ${sessionPrefix}`);
      process.exit(1);
    }

    const archived = loadArchivedMessages(sessionPrefix, seq);
    if (!archived) {
      console.log('Conversation content not available for this window (JSONL expired, no archive).');
      process.exit(0);
    }

    // Filter by focus range if specified
    let messages = archived;
    if (focusStart != null || focusEnd != null) {
      const fStart = focusStart != null ? focusStart : range.start;
      const fEnd = focusEnd != null ? focusEnd : range.end;
      messages = archived.filter(m => m.ln >= fStart && m.ln <= fEnd);
    }

    const output = fullMode ? messages : compactMessages(messages);

    console.log(`Session: ${sessionPrefix}... (archived)`);
    console.log(`Window: seq ${seq} | lines ${range.start}-${range.end} | ${fullMode ? 'full' : 'compact'} | archived`);
    console.log(`Messages: ${messages.length} total${!fullMode ? `, ${output.filter(m => m.type !== 'skip').length} shown` : ''}`);
    console.log('='.repeat(60));

    for (const msg of output) {
      if (msg.type === 'skip') {
        let label = `${msg.count} Claude messages skipped`;
        if (msg.activities && msg.activities.length > 0) {
          const skills = [...new Set(msg.activities.filter(a => a.kind === 'skill').map(a => a.name))];
          const agents = msg.activities.filter(a => a.kind === 'agent').map(a => a.name);
          const parts = [];
          if (skills.length) parts.push(skills.join(', '));
          if (agents.length) parts.push(agents.join(', '));
          label += ` (${parts.join(' → ')})`;
        }
        console.log(`\n  [...${label} — lines ${msg.startLine}-${msg.endLine}]`);
      } else {
        const role = msg.type === 'user' ? 'Human' : 'Claude';
        console.log(`\n[${role}] (line ${msg.ln})`);
        console.log(msg.text);
      }
    }
    return;
  }

  // Get window range from index, then optionally narrow by focus
  const range = getWindowRange(sessionPrefix, seq);
  if (!range) {
    console.error(`Window seq ${seq} not found for session ${sessionPrefix}`);
    process.exit(1);
  }

  const startLine = focusStart != null ? Math.max(focusStart, range.start) : range.start;
  const endLine = focusEnd != null ? Math.min(focusEnd, range.end) : range.end;

  const messages = await readWindow(filePath, startLine, endLine);
  const output = fullMode ? messages : compactMessages(messages);

  // Output
  const sessionFile = path.basename(filePath);
  const mode = fullMode ? 'full' : 'compact';
  console.log(`Session: ${sessionFile.replace('.jsonl', '')}`);
  console.log(`Window: seq ${seq} | lines ${startLine}-${endLine} | ${mode}`);
  console.log(`Messages: ${messages.length} total${!fullMode ? `, ${output.filter(m => m.type !== 'skip').length} shown` : ''}`);
  console.log('='.repeat(60));

  for (const msg of output) {
    if (msg.type === 'skip') {
      let label = `${msg.count} Claude messages skipped`;
      if (msg.activities.length > 0) {
        const skills = [...new Set(msg.activities.filter(a => a.kind === 'skill').map(a => a.name))];
        const agents = msg.activities.filter(a => a.kind === 'agent').map(a => a.name);
        const parts = [];
        if (skills.length) parts.push(skills.join(', '));
        if (agents.length) parts.push(agents.join(', '));
        label += ` (${parts.join(' → ')})`;
      }
      console.log(`\n  [...${label} — lines ${msg.startLine}-${msg.endLine}]`);
    } else {
      const role = msg.type === 'user' ? 'Human' : 'Claude';
      console.log(`\n[${role}] (line ${msg.ln})`);
      console.log(msg.text);
    }
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
