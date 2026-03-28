#!/usr/bin/env node
'use strict';

/**
 * Returns the current session ID (first 8 chars of the most recent JSONL filename).
 * Used during wrapup to tag PFC entries to conversation windows.
 *
 * Usage: node scripts/session-id.js
 * Output: 8-character session ID (e.g., "be8a702a")
 */

const fs = require('fs');
const path = require('path');

const BRAIN_DIR = process.env.BRAIN_DIR || path.join(require('os').homedir(), '.claude', 'brain');
const configPath = path.join(BRAIN_DIR, 'config.json');

if (!fs.existsSync(configPath)) {
  console.error('No config.json found at ' + configPath);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const dirs = config.conversationDirs || config.conversation_dirs || [];

let newestMtime = 0;
let sessionId = '';

for (const rawDir of dirs) {
  // Expand ~ to home directory
  const dir = rawDir.replace(/^~/, require('os').homedir());

  let files;
  try {
    files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
  } catch (_) {
    continue;
  }

  for (const file of files) {
    try {
      const stat = fs.statSync(path.join(dir, file));
      if (stat.mtimeMs > newestMtime) {
        newestMtime = stat.mtimeMs;
        sessionId = file.replace('.jsonl', '').slice(0, 8);
      }
    } catch (_) {
      continue;
    }
  }
}

if (!sessionId) {
  console.error('No JSONL conversation files found');
  process.exit(1);
}

console.log(sessionId);
