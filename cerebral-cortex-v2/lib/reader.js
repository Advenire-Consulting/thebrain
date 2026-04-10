'use strict';

// Shared reader functions for CC2 conversation content.
// Extracted from read-window.js so archive.js can reuse them.

const fs = require('fs');
const readline = require('readline');

// Strip system-injected XML noise from user messages
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

// Extract only text blocks from assistant content arrays
function extractAssistantText(contentArray) {
  if (!Array.isArray(contentArray)) return '';
  return contentArray
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim();
}

// Filter out non-conversational user messages (skill invocations, interrupts)
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

// Read a JSONL window and return merged, deduplicated message array
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

  // Merge assistant chunks by requestId
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

// Compact mode: keep first Claude response per user message, collapse consecutive
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

module.exports = { readWindow, compactMessages, cleanUserText, extractAssistantText, isConversational };
