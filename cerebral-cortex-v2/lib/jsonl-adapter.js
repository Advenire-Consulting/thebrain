'use strict';

/**
 * Adapter for Claude Code's JSONL conversation format.
 *
 * All JSONL format assumptions live here. When the format changes,
 * update this file — scanner, extractor, and reader stay untouched.
 *
 * Current format (as of Claude Code ~2026-03):
 * - Each line is a JSON object with `type`, optional `subtype`, and `timestamp`
 * - User messages: { type: 'user', message: { content: string | block[] }, timestamp }
 * - Assistant messages: { type: 'assistant', message: { content: block[] }, timestamp }
 * - Text blocks: { type: 'text', text: string }
 * - Tool use blocks: { type: 'tool_use', name: string, input: { file_path?, path? } }
 * - Compact boundaries: { type: 'system', subtype: 'compact_boundary', timestamp }
 */

/**
 * Classify a parsed JSONL line into a normalized record type.
 * @param {object} obj - Parsed JSON object from a JSONL line
 * @returns {{ kind: string, timestamp: string|null, text: string, toolFiles: Array<{filePath: string, tool: string}> }}
 */
function classify(obj) {
  const timestamp = obj.timestamp || null;

  // Compact boundary — window delimiter
  if (obj.type === 'system' && obj.subtype === 'compact_boundary') {
    return { kind: 'boundary', timestamp, text: '', toolFiles: [] };
  }

  // User message
  if (obj.type === 'user' && obj.message) {
    return {
      kind: 'user',
      timestamp,
      text: extractText(obj.message.content),
      toolFiles: [],
    };
  }

  // Assistant message
  if (obj.type === 'assistant' && obj.message && obj.message.content) {
    return {
      kind: 'assistant',
      timestamp,
      text: extractText(obj.message.content),
      toolFiles: extractToolFiles(obj.message.content),
    };
  }

  // Everything else (system prompts, file snapshots, etc.)
  return { kind: 'other', timestamp, text: '', toolFiles: [] };
}

/**
 * Extract plain text from a message content field.
 * Handles both string content and block arrays.
 */
function extractText(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join(' ');
  }
  return '';
}

/**
 * Extract file paths from tool_use blocks in assistant content.
 */
function extractToolFiles(content) {
  if (!Array.isArray(content)) return [];
  const results = [];
  for (const block of content) {
    if (block.type === 'tool_use' && block.input) {
      const fp = block.input.file_path || block.input.path;
      if (fp && typeof fp === 'string') {
        results.push({ filePath: fp, tool: block.name });
      }
    }
  }
  return results;
}

module.exports = { classify, extractText, extractToolFiles };
