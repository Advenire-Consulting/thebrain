const fs = require('fs');
const { tokenize, filterMedium } = require('./stopwords');

const path = require('path');
const { loadConfig } = require('../../lib/config');

const EXPLORE_TOOLS = ['Read', 'Grep', 'Glob', 'Bash'];
const WRITE_TOOLS = ['Write', 'Edit'];

// Build list of workspace roots for path normalization
let _workspaceRoots = null;
function getWorkspaceRoots() {
  if (_workspaceRoots) return _workspaceRoots;
  const config = loadConfig();
  _workspaceRoots = config.workspaces.map(w => {
    const p = path.resolve(w.path);
    return p.endsWith('/') ? p : p + '/';
  });
  return _workspaceRoots;
}

function normalizePath(filePath) {
  for (const root of getWorkspaceRoots()) {
    if (filePath.startsWith(root)) return filePath.slice(root.length);
  }
  return filePath;
}

function getFilePath(block) {
  if (!block.input) return null;
  return block.input.file_path || block.input.path || null;
}

function getDirectory(filePath) {
  const normalized = normalizePath(filePath);
  const parts = normalized.split('/');
  parts.pop();
  return parts.join('/');
}

function overlaps(exploredFiles, exploredDirs, targetPath) {
  const normalized = normalizePath(targetPath);
  if (exploredFiles.has(normalized)) return true;
  const targetDir = getDirectory(targetPath);
  if (targetDir && exploredDirs.has(targetDir)) return true;
  return false;
}

function extractUserTerms(userTexts) {
  const allTerms = {};
  for (const text of userTexts) {
    const tokens = filterMedium(tokenize(text));
    for (const t of tokens) {
      allTerms[t] = (allTerms[t] || 0) + 1;
    }
  }
  return Object.entries(allTerms)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(e => e[0]);
}

function buildSummary(terms, fileAnchors) {
  const termPart = terms.slice(0, 4).join(', ');
  if (!fileAnchors || fileAnchors.length === 0) return termPart;
  const fileNames = fileAnchors.map(f => f.split('/').pop());
  const uniqueFiles = [...new Set(fileNames)];
  return termPart + ' — ' + uniqueFiles.join(', ');
}

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

function detectDecisions(filePath, startLine, endLine) {
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  const decisions = [];

  let exploredFiles = new Set();
  let exploredDirs = new Set();
  let userTexts = [];
  let blockStart = startLine;
  let hasDiscussion = false;
  let writeAnchors = [];

  for (let ln = startLine; ln <= endLine && ln < lines.length; ln++) {
    const line = lines[ln];
    if (!line.trim()) continue;

    let obj;
    try { obj = JSON.parse(line); } catch { continue; }

    if (obj.type === 'assistant' && obj.message && Array.isArray(obj.message.content)) {
      for (const block of obj.message.content) {
        if (block.type !== 'tool_use') continue;

        if (EXPLORE_TOOLS.includes(block.name)) {
          const fp = getFilePath(block);
          if (fp) {
            const normalized = normalizePath(fp);
            exploredFiles.add(normalized);
            const dir = getDirectory(fp);
            if (dir) exploredDirs.add(dir);
          }
        }

        if (WRITE_TOOLS.includes(block.name)) {
          const fp = getFilePath(block);
          if (fp && overlaps(exploredFiles, exploredDirs, fp)) {
            writeAnchors.push(normalizePath(fp));

            const terms = extractUserTerms(userTexts);
            decisions.push({
              seq: decisions.length,
              startLine: blockStart,
              endLine: ln,
              summary: buildSummary(terms, writeAnchors),
              terms,
              fileAnchors: [...writeAnchors],
              status: 'decided',
            });

            exploredFiles = new Set();
            exploredDirs = new Set();
            userTexts = [];
            writeAnchors = [];
            blockStart = ln + 1;
            hasDiscussion = false;
          } else if (fp) {
            writeAnchors.push(normalizePath(fp));
          }
        }
      }
    }

    if (obj.type === 'user' && obj.message) {
      const text = extractText(obj.message.content);
      if (text && text.length > 0) {
        const cleaned = text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim();
        if (cleaned.length > 0) {
          userTexts.push(cleaned);
          hasDiscussion = true;
        }
      }
    }
  }

  if (hasDiscussion && blockStart <= endLine) {
    const terms = extractUserTerms(userTexts);
    if (terms.length > 0) {
      decisions.push({
        seq: decisions.length,
        startLine: blockStart,
        endLine: endLine,
        summary: buildSummary(terms, writeAnchors.length > 0 ? writeAnchors : null),
        terms,
        fileAnchors: writeAnchors.length > 0 ? writeAnchors : null,
        status: writeAnchors.length > 0 ? 'decided' : 'parked',
      });
    }
  }

  return decisions;
}

module.exports = { detectDecisions, overlaps, extractUserTerms, buildSummary };
