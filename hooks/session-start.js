#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const PLUGIN_ROOT = path.resolve(__dirname, '..');
const HOME = os.homedir();
const BRAIN_DIR = path.join(HOME, '.claude', 'brain');
const SIGNALS_DB = path.join(BRAIN_DIR, 'signals.db');
const PFC_FILE = path.join(BRAIN_DIR, 'prefrontal-live.md');
const PFC_CORTEX = path.join(BRAIN_DIR, 'prefrontal-cortex.md');
const PFC_SIZE_FILE = path.join(BRAIN_DIR, '.pfc-loaded-size');

function escapeForJson(s) {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

function outputJson(content) {
  const escaped = escapeForJson(content);
  console.log(JSON.stringify({
    additional_context: content,
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: content,
    },
  }));
}

function main() {
  // Check Node.js version
  const nodeMajor = parseInt(process.versions.node.split('.')[0], 10);
  if (nodeMajor < 18) {
    outputJson(`<!-- brain-loaded -->\n\n**TheBrain plugin error:** Node.js 18+ is required but found version ${process.version}. Please upgrade Node.js to use TheBrain.\n\n<!-- /brain-loaded -->`);
    return;
  }

  // Check better-sqlite3 native module
  try {
    require(path.join(PLUGIN_ROOT, 'node_modules', 'better-sqlite3'));
  } catch {
    outputJson(`<!-- brain-loaded -->\n\n**TheBrain plugin error:** The better-sqlite3 native module needs rebuilding for your current Node.js version. Run:\n\n\`\`\`\ncd ${PLUGIN_ROOT} && npm rebuild better-sqlite3\n\`\`\`\n\nThen restart Claude.\n\n<!-- /brain-loaded -->`);
    return;
  }

  // Run pending database migrations
  if (fs.existsSync(BRAIN_DIR)) {
    try {
      const { migrate } = require(path.join(PLUGIN_ROOT, 'lib', 'migrator'));
      const Database = require(path.join(PLUGIN_ROOT, 'node_modules', 'better-sqlite3'));

      if (fs.existsSync(SIGNALS_DB)) {
        const sdb = new Database(SIGNALS_DB);
        sdb.pragma('journal_mode = WAL');
        migrate(sdb, path.join(PLUGIN_ROOT, 'migrations', 'signals'), { quiet: true });
        sdb.close();
      }

      const recallDbPath = path.join(BRAIN_DIR, 'recall.db');
      if (fs.existsSync(recallDbPath)) {
        const rdb = new Database(recallDbPath);
        rdb.pragma('journal_mode = WAL');
        migrate(rdb, path.join(PLUGIN_ROOT, 'migrations', 'recall'), { quiet: true });
        rdb.close();
      }
    } catch (err) {
      process.stderr.write(`TheBrain: migration failed — ${err.message}\n`);
    }
  }

  // Regenerate prefrontal if stale or missing
  if (fs.existsSync(SIGNALS_DB)) {
    let shouldRegenerate = !fs.existsSync(PFC_FILE);
    if (!shouldRegenerate) {
      const dbMtime = fs.statSync(SIGNALS_DB).mtimeMs;
      const pfcMtime = fs.statSync(PFC_FILE).mtimeMs;
      shouldRegenerate = dbMtime > pfcMtime;
    }
    if (shouldRegenerate) {
      try {
        execFileSync('node', [path.join(PLUGIN_ROOT, 'scripts', 'generate-prefrontal.js')], { stdio: 'ignore' });
      } catch { /* ignore */ }
    }
  }

  // Record PFC file size
  if (fs.existsSync(BRAIN_DIR)) {
    try {
      if (fs.existsSync(PFC_CORTEX)) {
        const size = fs.statSync(PFC_CORTEX).size;
        fs.writeFileSync(PFC_SIZE_FILE, String(size));
      } else {
        fs.writeFileSync(PFC_SIZE_FILE, '0');
      }
    } catch { /* ignore */ }
  }

  // Build brain context
  const parts = ['<!-- brain-loaded -->', ''];

  const configPath = path.join(BRAIN_DIR, 'config.json');

  if (!fs.existsSync(configPath)) {
    // Setup mode — inline setup instructions
    const setupFile = path.join(PLUGIN_ROOT, 'setup', 'SETUP.md');
    parts.push('<EXTREMELY_IMPORTANT>');
    parts.push('# TheBrain Plugin — Setup Required');
    parts.push('');
    parts.push('TheBrain is a cognitive layer plugin for Claude Code that provides code navigation, conversation recall, safety hooks, and behavioral learning. It is installed but not yet configured.');
    parts.push('');
    parts.push("IMPORTANT: When the user starts a session, inform them: 'I see TheBrain is installed but needs initial setup. Would you like me to set it up now? It takes about 2 minutes.'");
    parts.push('');
    parts.push(`When the user agrees to setup, read the full setup instructions from: ${setupFile}`);
    parts.push('');
    parts.push('Key paths for setup:');
    parts.push(`- Plugin root: ${PLUGIN_ROOT}`);
    parts.push(`- Brain data directory: ${BRAIN_DIR}/`);
    parts.push(`- Setup instructions: ${setupFile}`);
    parts.push(`- Seed script: node ${path.join(PLUGIN_ROOT, 'scripts', 'seed-signals.js')}`);
    parts.push(`- Hippocampus scan: node ${path.join(PLUGIN_ROOT, 'hippocampus', 'scripts', 'scan.js')}`);
    parts.push(`- CC2 scan: node ${path.join(PLUGIN_ROOT, 'cerebral-cortex-v2', 'scripts', 'scan.js')}`);
    parts.push(`- Prefrontal generator: node ${path.join(PLUGIN_ROOT, 'scripts', 'generate-prefrontal.js')}`);
    parts.push('');
    parts.push('Do NOT attempt to build thebrain from scratch. It is already installed as a plugin. You are configuring it, not creating it.');
    parts.push('</EXTREMELY_IMPORTANT>');
    parts.push('');
  } else {
    // Normal mode — load prefrontal + tool index

    // New user reminder — show commands for first 5 sessions
    const sessionCountFile = path.join(BRAIN_DIR, '.session-count');
    let sessionCount = 0;
    try { sessionCount = parseInt(fs.readFileSync(sessionCountFile, 'utf-8').trim(), 10) || 0; } catch { /* first session */ }
    sessionCount++;
    try { fs.writeFileSync(sessionCountFile, String(sessionCount)); } catch { /* ignore */ }

    if (sessionCount <= 5) {
      parts.push('> **Brain commands available:** `/hello` (session greeting) | `/continue` (restore context) | `/wrapup` (save session state) | `/dopamine` (flag behavioral moments) | `/oxytocin` (flag relational dynamics). Use `/wrapup` at the end of each session to build recall.');
      parts.push('');
    }

    parts.push('# Prefrontal — Decision Gates');
    parts.push('');

    if (fs.existsSync(PFC_FILE)) {
      parts.push(fs.readFileSync(PFC_FILE, 'utf-8').trimEnd());
    } else {
      parts.push('*No prefrontal-live.md found. Run setup to populate.*');
    }

    // Tool index with $PLUGIN_ROOT substitution
    const toolIndexPath = path.join(PLUGIN_ROOT, 'docs', 'tool-index.md');
    if (fs.existsSync(toolIndexPath)) {
      let toolContent = fs.readFileSync(toolIndexPath, 'utf-8');
      toolContent = toolContent.replace(/\$PLUGIN_ROOT/g, PLUGIN_ROOT);
      parts.push('');
      parts.push('<EXTREMELY_IMPORTANT>');
      parts.push(toolContent.trimEnd());
      parts.push('</EXTREMELY_IMPORTANT>');
    }
  }

  parts.push('');
  parts.push('<!-- /brain-loaded -->');

  outputJson(parts.join('\n'));
}

main();
