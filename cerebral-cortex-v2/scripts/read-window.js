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
const readline = require('readline');

const { loadConfig } = require('../../lib/config');
const CONV_DIRS = loadConfig().conversationDirs;

// From conversation-explorer: strip XML noise from user messages
function cleanUserText(content) {
  let text = '';
  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');
  }
  text = text.replace(/<command-message>[\s\S]*?<\/command-message>\s*/g, '');
  text = text.replace(/<command-name>[\s\S]*?<\/command-name>\s*/g, '');
  text = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>\s*/g, '');
  text = text.replace(/<local-command-caveat>[\s\S]*?<\/local-command-caveat>\s*/g, '');
  text = text.replace(/<local-command-stdout>[\s\S]*?<\/local-command-stdout>\s*/g, '');
  text = text.replace(/<command-args>[\s\S]*?<\/command-args>\s*/g, '');
  return text.trim();
}

// From conversation-explorer: extract only text blocks from assistant content
function extractAssistantText(contentArray) {
  if (!Array.isArray(contentArray)) return '';
  return contentArray
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim();
}

// Skip non-conversational user messages
function isConversational(text) {
  if (!text || text.length === 0) return false;
  if (text === '[Request interrupted by user for tool use]') return false;
  if (text === '[Request interrupted by user]') return false;
  const skipPrefixes = [
    'Start-of-session greeting',
    'End-of-session goodnight',
    'End-of-work wrap up',
    'Resume a project or workspace',
    'Base directory for this skill:',
    'Implement the following plan:',
    'This session is being continued from a previous conversation',
  ];
  for (const prefix of skipPrefixes) {
    if (text.startsWith(prefix)) return false;
  }
  return true;
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

async function readWindow(filePath, startLine, endLine) {
  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  const rawMessages = [];
  let lineNumber = 0;

  for await (const line of rl) {
    const ln = lineNumber++;
    if (ln < startLine) continue;
    if (ln > endLine) break;
    if (!line.trim()) continue;

    let obj;
    try { obj = JSON.parse(line); } catch { continue; }

    const type = obj.type;
    if (type === 'user') {
      const content = obj.message?.content;
      const text = cleanUserText(content);
      const timestamp = obj.timestamp;
      if (isConversational(text)) {
        rawMessages.push({ ln, type: 'user', text, timestamp });
      }
    } else if (type === 'assistant') {
      const content = obj.message?.content;
      const text = extractAssistantText(content || []);
      const timestamp = obj.timestamp;
      const requestId = obj.requestId || obj.uuid;

      // Detect Skill and Agent tool_use blocks for activity labeling
      const activities = [];
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'tool_use' && block.name === 'Skill') {
            activities.push({ kind: 'skill', name: block.input?.skill || '?' });
          } else if (block.type === 'tool_use' && block.name === 'Agent') {
            activities.push({ kind: 'agent', name: block.input?.description || '?' });
          }
        }
      }

      if (text || activities.length > 0) {
        rawMessages.push({ ln, type: 'assistant', text: text || '', timestamp, requestId, activities });
      }
    }
  }

  // Merge assistant chunks by requestId (same as conversation-explorer)
  const merged = new Map();
  for (const msg of rawMessages) {
    if (msg.type === 'assistant' && msg.requestId) {
      if (merged.has(msg.requestId)) {
        const existing = merged.get(msg.requestId);
        if (msg.text) {
          existing.text = existing.text ? existing.text + '\n\n' + msg.text : msg.text;
        }
        if (msg.activities?.length) {
          existing.activities = (existing.activities || []).concat(msg.activities);
        }
        existing.ln = msg.ln;
      } else {
        merged.set(msg.requestId, { ...msg });
      }
    }
  }

  // Build final ordered list
  const seen = new Set();
  const messages = [];
  for (const msg of rawMessages) {
    if (msg.type === 'user') {
      messages.push(msg);
    } else if (msg.type === 'assistant' && msg.requestId && !seen.has(msg.requestId)) {
      seen.add(msg.requestId);
      const m = merged.get(msg.requestId);
      if (m && m.text) messages.push(m);
    }
  }

  return messages;
}

// Compact mode: user messages full, first Claude response after each user kept,
// consecutive Claude messages collapsed with skip indicator + line range for drill-down.
function compactMessages(messages) {
  const output = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];

    if (msg.type === 'user') {
      output.push(msg);
      i++;
      // Include the first assistant response after this user message
      if (i < messages.length && messages[i].type === 'assistant') {
        output.push(messages[i]);
        i++;
        // Collapse any consecutive assistant messages, collecting activity labels
        let skippedCount = 0;
        let firstSkippedLine = null;
        let lastSkippedLine = null;
        const activities = [];
        while (i < messages.length && messages[i].type === 'assistant') {
          if (firstSkippedLine === null) firstSkippedLine = messages[i].ln;
          lastSkippedLine = messages[i].ln;
          if (messages[i].activities) {
            for (const a of messages[i].activities) activities.push(a);
          }
          skippedCount++;
          i++;
        }
        if (skippedCount > 0) {
          output.push({
            type: 'skip',
            count: skippedCount,
            startLine: firstSkippedLine,
            endLine: lastSkippedLine,
            activities,
          });
        }
      }
    } else if (msg.type === 'assistant') {
      // Assistant message with no preceding user message (start of window)
      output.push(msg);
      i++;
      // Collapse followups
      let skippedCount = 0;
      let firstSkippedLine = null;
      let lastSkippedLine = null;
      const activities = [];
      while (i < messages.length && messages[i].type === 'assistant') {
        if (firstSkippedLine === null) firstSkippedLine = messages[i].ln;
        lastSkippedLine = messages[i].ln;
        if (messages[i].activities) {
          for (const a of messages[i].activities) activities.push(a);
        }
        skippedCount++;
        i++;
      }
      if (skippedCount > 0) {
        output.push({
          type: 'skip',
          count: skippedCount,
          startLine: firstSkippedLine,
          endLine: lastSkippedLine,
          activities,
        });
      }
    } else {
      i++;
    }
  }

  return output;
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
      if (!decFilePath) {
        console.error('No JSONL file found');
        db.close();
        process.exit(1);
      }

      const mode = decisionWhy ? 'decision + reasoning' : 'decision';
      console.log(`Session: ${winRow.session_id.slice(0, 8)}...`);
      console.log(`Window: seq ${seq} | Decision ${decisionNum} | lines ${readStart}-${target.end_line} | ${mode}`);
      console.log(`Decision: ${target.summary}`);
      console.log('='.repeat(60));

      const messages = await readWindow(decFilePath, readStart, target.end_line);
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
    console.error(`No JSONL file found for session prefix: ${sessionPrefix}`);
    process.exit(1);
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
        // Group by kind and deduplicate
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
