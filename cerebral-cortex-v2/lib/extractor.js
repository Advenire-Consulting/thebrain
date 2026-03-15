const readline = require('readline');
const fs = require('fs');
const path = require('path');
const { tokenize, filterLight, filterMedium, filterHeavy } = require('./stopwords');

const { loadConfig } = require('../../lib/config');

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

let _projectRoots = null;
function getProjectRoots() {
  if (_projectRoots) return _projectRoots;
  try {
    const { loadAllDIR } = require(path.join(__dirname, '..', '..', 'hippocampus', 'lib', 'dir-loader'));
    _projectRoots = loadAllDIR().map(d => ({ name: d.name, root: d.root }));
  } catch {
    _projectRoots = [];
  }
  return _projectRoots;
}

function fileToProject(filePath) {
  const rel = normalizePath(filePath);
  for (const { name, root } of getProjectRoots()) {
    if (rel.startsWith(root)) return name;
  }
  return null;
}

function getFilter(level) {
  if (level === 'light') return filterLight;
  if (level === 'heavy') return filterHeavy;
  return filterMedium;
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

async function extractWindow(filePath, startLine, endLine, filterLevel) {
  const filter = getFilter(filterLevel || 'medium');
  const userTerms = Object.create(null);
  const assistantTerms = Object.create(null);
  const fileMap = Object.create(null);
  const projectCounts = Object.create(null);

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  let lineNum = 0;
  for await (const line of rl) {
    if (lineNum < startLine) { lineNum++; continue; }
    if (lineNum > endLine) break;

    let obj;
    try { obj = JSON.parse(line); } catch { lineNum++; continue; }

    if (obj.type === 'user' && obj.message) {
      const text = extractText(obj.message.content);
      const tokens = filter(tokenize(text));
      for (const t of tokens) {
        if (!userTerms[t]) userTerms[t] = { count: 0, lines: [] };
        userTerms[t].count++;
        if (!userTerms[t].lines.includes(lineNum)) userTerms[t].lines.push(lineNum);
      }
    }

    if (obj.type === 'assistant' && obj.message && obj.message.content) {
      const text = extractText(obj.message.content);
      if (text) {
        const tokens = filter(tokenize(text));
        for (const t of tokens) {
          if (!assistantTerms[t]) assistantTerms[t] = { count: 0, lines: [] };
          assistantTerms[t].count++;
          if (!assistantTerms[t].lines.includes(lineNum)) assistantTerms[t].lines.push(lineNum);
        }
      }

      const toolFiles = extractToolFiles(obj.message.content);
      for (const { filePath: fp, tool } of toolFiles) {
        if (!fileMap[fp]) fileMap[fp] = { lines: [], tools: new Set() };
        if (!fileMap[fp].lines.includes(lineNum)) fileMap[fp].lines.push(lineNum);
        fileMap[fp].tools.add(tool);

        const project = fileToProject(fp);
        if (project) {
          projectCounts[project] = (projectCounts[project] || 0) + 1;
        }
      }
    }

    lineNum++;
  }

  const files = Object.entries(fileMap).map(([fp, data]) => ({
    filePath: normalizePath(fp),
    lines: data.lines,
    tool: [...data.tools].join(','),
  }));

  return { userTerms, assistantTerms, files, projects: projectCounts };
}

module.exports = { extractWindow, fileToProject, extractText, extractToolFiles };
