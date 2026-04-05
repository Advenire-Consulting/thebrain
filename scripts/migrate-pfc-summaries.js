#!/usr/bin/env node
'use strict';

/**
 * One-time migration: recover lost PFC session summaries from conversation
 * history and backfill them into CC2's recall.db. Replaces mechanical
 * auto-generated summaries with the richer hand-written PFC versions.
 *
 * Flags: --dry-run (preview without DB changes), --force (ignore flag file)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const BRAIN_DIR = path.join(os.homedir(), '.claude', 'brain');
const FLAG_FILE = path.join(BRAIN_DIR, '.pfc-recovery-done');
const THEBRAIN_DIR = path.resolve(__dirname, '..');

// Bail early if already run
if (fs.existsSync(FLAG_FILE) && !process.argv.includes('--force')) {
  process.exit(0);
}

const { RecallDB, DEFAULT_RECALL_DB_PATH } = require(path.join(THEBRAIN_DIR, 'cerebral-cortex-v2', 'lib', 'db'));
const { loadConfig } = require(path.join(THEBRAIN_DIR, 'lib', 'config'));

const DRY_RUN = process.argv.includes('--dry-run');

// PFC entry regex — supports all three format variants:
//   ## YYYY-MM-DD HH:MM — scope [session_id]       (current format)
//   ## HH:MM — scope [session_id]                   (old, no date)
//   ## HH:MM — scope [non-hex-tag]                  (old, no session id)
const PFC_ENTRY_RE = /## (?:(\d{4}-\d{2}-\d{2}) )?(\d{2}:\d{2}) — (.+?)(?:\s+\[([^\]]+)\])?\nFiles: (.+)\nSummary: (.+?)(?:\nNext: (.+))?(?:\n|$)/g;

// Hex-only pattern to distinguish real session ID prefixes from tags
const HEX_RE = /^[a-f0-9]+$/;

/**
 * Scan a single JSONL file for PFC entries written via Edit/Write tool calls.
 */
function scanConversation(jsonlPath) {
  var content = fs.readFileSync(jsonlPath, 'utf8');
  var lines = content.trim().split('\n');
  var sessionUuid = path.basename(jsonlPath, '.jsonl');
  var entries = [];
  var lastTimestamp = null;

  for (var i = 0; i < lines.length; i++) {
    var msg;
    try { msg = JSON.parse(lines[i]); } catch (e) { continue; }

    // Track timestamps from any message type for date derivation
    if (msg.timestamp) lastTimestamp = msg.timestamp;

    if (msg.type !== 'assistant' || !msg.message || !msg.message.content) continue;

    for (var j = 0; j < msg.message.content.length; j++) {
      var block = msg.message.content[j];
      if (block.type !== 'tool_use') continue;
      var inp = block.input || {};
      var fp = inp.file_path || '';
      if (!fp.includes('prefrontal-cortex')) continue;

      // Extract text written to the PFC file
      var text = inp.content || inp.new_string || '';
      if (!text) continue;

      var m;
      PFC_ENTRY_RE.lastIndex = 0;
      while ((m = PFC_ENTRY_RE.exec(text)) !== null) {
        var rawId = m[4] || null;
        // Real session IDs are hex strings; tags like CURRENT or feat/... are not
        var sessionId = (rawId && HEX_RE.test(rawId)) ? rawId : sessionUuid;

        entries.push({
          date: m[1] || null,
          time: m[2],
          scope: m[3],
          sessionId: sessionId,
          files: m[5],
          summary: m[6],
          next: m[7] || null,
          msgTimestamp: lastTimestamp,
        });
      }
    }
  }

  return entries;
}

/**
 * Derive YYYY-MM-DD date from the nearest message timestamp (local time).
 */
function deriveDate(entry) {
  if (entry.date) return entry.date;
  if (!entry.msgTimestamp) return null;

  var d = new Date(entry.msgTimestamp);
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var day = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + day;
}

/**
 * Deduplicate entries by sessionId+scope. Keeps the most complete version:
 * prefer entries with 'next', then with a date, then later timestamps.
 */
function deduplicateEntries(entries) {
  var byKey = new Map();
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var key = entry.sessionId + '::' + entry.scope;
    var existing = byKey.get(key);
    if (!existing) { byKey.set(key, entry); continue; }

    // Prefer entry with next field
    if (entry.next && !existing.next) { byKey.set(key, entry); continue; }
    if (!entry.next && existing.next) continue;
    // Prefer entry with date
    if (entry.date && !existing.date) { byKey.set(key, entry); continue; }
    if (!entry.date && existing.date) continue;
    // Prefer later entry
    if (entry.msgTimestamp > existing.msgTimestamp) byKey.set(key, entry);
  }
  return Array.from(byKey.values());
}

function main() {
  var config = loadConfig();
  var conversationDirs = config.conversationDirs;

  if (conversationDirs.length === 0) {
    console.log('PFC Recovery: no conversation dirs configured. Skipping.');
    return;
  }

  console.log('PFC Summary Recovery — scanning conversations...');

  // Phase 1: Scan all conversations for PFC entries
  var allEntries = [];
  for (var d = 0; d < conversationDirs.length; d++) {
    var dir = conversationDirs[d];
    if (!fs.existsSync(dir)) continue;
    var jsonls = fs.readdirSync(dir).filter(function(f) { return f.endsWith('.jsonl'); });
    for (var f = 0; f < jsonls.length; f++) {
      var entries = scanConversation(path.join(dir, jsonls[f]));
      allEntries = allEntries.concat(entries);
    }
  }

  console.log('  Found ' + allEntries.length + ' PFC entries across all conversations.');

  // Phase 2: Derive dates for entries that lack them
  for (var i = 0; i < allEntries.length; i++) {
    if (!allEntries[i].date) {
      allEntries[i].date = deriveDate(allEntries[i]);
    }
  }

  // Phase 3: Deduplicate
  var unique = deduplicateEntries(allEntries);
  console.log('  ' + unique.length + ' unique entries after deduplication.');

  // Phase 4: Match to CC2 windows and overwrite mechanical summaries
  var db = new RecallDB(DEFAULT_RECALL_DB_PATH);
  var matched = 0;
  var overwritten = 0;
  var skippedGood = 0;
  var noMatch = 0;

  for (var u = 0; u < unique.length; u++) {
    var entry = unique[u];
    var win = db.findWindowBySessionAndTime(entry.sessionId, entry.time, entry.date);
    if (!win) {
      noMatch++;
      continue;
    }
    matched++;

    var existing = db.getSummary(win.id);
    // Skip if existing summary was already PFC-sourced (has 'next' field)
    if (existing && existing.next) {
      skippedGood++;
      continue;
    }

    if (DRY_RUN) {
      console.log('  [dry-run] Would overwrite ' + entry.sessionId.slice(0, 8) + ' — ' + entry.scope);
      overwritten++;
      continue;
    }

    // PFC summary always wins; sentinel value marks it as migrated
    db.insertSummary(win.id, {
      scope: entry.scope,
      summary: entry.summary,
      files: entry.files,
      next: entry.next || 'migrated-from-pfc',
    });
    overwritten++;
  }

  db.close();

  console.log('  Matched: ' + matched + ' | Overwritten: ' + overwritten + ' | Already good: ' + skippedGood + ' | No match: ' + noMatch);

  // Write flag file on success
  if (!DRY_RUN) {
    fs.writeFileSync(FLAG_FILE, new Date().toISOString() + '\n');
    console.log('  Recovery complete. Flag written to ' + FLAG_FILE);
  } else {
    console.log('  Dry run complete. No changes made.');
  }
}

main();
