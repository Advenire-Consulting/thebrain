'use strict';

// Project-aware grep — searches all files in known project directories
// Returns matches with surrounding context, grouped by project
// Uses DIR files for project names/roots, workspace config for base path

const fs = require('fs');
const path = require('path');
const { loadAllDIR } = require('../lib/dir-loader');
const { loadConfig } = require('../../lib/config');

const args = process.argv.slice(2);

// Parse arguments
function flag(name) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

const pattern = args.find(a => !a.startsWith('--'));
const contextLines = parseInt(flag('--context') || flag('-C') || '3', 10);
const projectFilter = flag('--project');
const maxPerFile = parseInt(flag('--max-per-file') || '20', 10);

if (!pattern) {
  console.log(`Usage: node hippocampus/scripts/grep.js <pattern> [options]

Options:
  --context N, -C N       Lines of context around each match (default: 3)
  --project <name>        Filter to one project (substring match)
  --max-per-file N        Max matches shown per file (default: 20)

Examples:
  node hippocampus/scripts/grep.js "/runtime/"
  node hippocampus/scripts/grep.js "apiBase" --project sonder-runtime
  node hippocampus/scripts/grep.js "fetch.*booking" --context 5`);
  process.exit(1);
}

// Directories to always skip
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '.cache',
  'coverage', '.nyc_output', '__pycache__', '.venv', 'vendor',
]);

// File extensions to search (text files)
const TEXT_EXTENSIONS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
  '.html', '.htm', '.css', '.scss', '.less',
  '.json', '.md', '.txt', '.yml', '.yaml', '.toml',
  '.sql', '.sh', '.bash', '.zsh',
  '.py', '.rb', '.go', '.rs', '.java', '.c', '.h', '.cpp',
  '.env', '.example', '.conf', '.cfg',
  '.xml', '.svg', '.ejs', '.hbs', '.pug',
]);

// Collect all searchable files in a directory tree
function collectFiles(dirPath) {
  const results = [];

  function walk(current) {
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;

      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) {
          walk(path.join(current, entry.name));
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        // Include extensionless files if they're small (likely scripts/configs)
        if (TEXT_EXTENSIONS.has(ext) || (ext === '' && entry.name !== 'LICENSE')) {
          results.push(path.join(current, entry.name));
        }
      }
    }
  }

  walk(dirPath);
  return results;
}

// Search a single file, return match objects with context
function searchFile(filePath, regex, ctx) {
  let content;
  try { content = fs.readFileSync(filePath, 'utf-8'); }
  catch { return []; }

  // Skip binary-looking files
  if (content.includes('\0')) return [];

  const lines = content.split('\n');
  const matches = [];
  const usedLines = new Set();

  for (let i = 0; i < lines.length; i++) {
    if (regex.test(lines[i])) {
      // Compute context window, merging with adjacent matches
      const start = Math.max(0, i - ctx);
      const end = Math.min(lines.length - 1, i + ctx);

      // Check if this overlaps with previous match context
      if (matches.length > 0) {
        const prev = matches[matches.length - 1];
        if (start <= prev.end + 1) {
          // Merge: extend previous match
          prev.end = end;
          prev.matchLines.push(i + 1);
          for (let j = prev.end + 1; j <= end; j++) usedLines.add(j);
          continue;
        }
      }

      matches.push({ start, end, matchLines: [i + 1] });
      for (let j = start; j <= end; j++) usedLines.add(j);
    }
  }

  // Build output snippets
  return matches.map(m => {
    const snippet = [];
    for (let j = m.start; j <= m.end; j++) {
      const lineNum = j + 1;
      const marker = m.matchLines.includes(lineNum) ? '>' : ' ';
      snippet.push(
        marker + ' ' + String(lineNum).padStart(4) + '  ' + lines[j]
      );
    }
    return { matchLines: m.matchLines, snippet: snippet.join('\n') };
  });
}

// Main
const dirs = loadAllDIR();
if (dirs.length === 0) {
  console.error('No DIR files found. Run: node hippocampus/scripts/scan.js');
  process.exit(1);
}

const config = loadConfig();
const workspace = (config.workspaces && config.workspaces[0]) ? config.workspaces[0].path : null;
if (!workspace) {
  console.error('No workspace configured in brain config');
  process.exit(1);
}

// Filter projects
const projects = projectFilter
  ? dirs.filter(d => d.name.toLowerCase().includes(projectFilter.toLowerCase()))
  : dirs;

if (projects.length === 0) {
  console.error('No project matching "' + projectFilter + '"');
  process.exit(1);
}

let regex;
try { regex = new RegExp(pattern); }
catch (err) {
  console.error('Invalid regex: ' + err.message);
  process.exit(1);
}

let totalMatches = 0;
let totalFiles = 0;
const output = [];

for (const project of projects) {
  const projectRoot = path.join(workspace, project.root);
  if (!fs.existsSync(projectRoot)) continue;

  const files = collectFiles(projectRoot);
  const projectMatches = [];

  for (const filePath of files) {
    const results = searchFile(filePath, regex, contextLines);
    if (results.length === 0) continue;

    const relPath = path.relative(projectRoot, filePath);
    const capped = results.slice(0, maxPerFile);
    const matchCount = capped.reduce((sum, r) => sum + r.matchLines.length, 0);

    projectMatches.push({
      file: relPath,
      matchCount,
      snippets: capped,
      truncated: results.length > maxPerFile,
    });

    totalMatches += matchCount;
    totalFiles++;
  }

  if (projectMatches.length > 0) {
    output.push({ project: project.name, matches: projectMatches });
  }
}

// Print results
if (output.length === 0) {
  console.log('No matches for /' + pattern + '/ across ' + projects.length + ' projects');
  process.exit(0);
}

console.log('/' + pattern + '/ — ' + totalMatches + ' matches in ' + totalFiles + ' files\n');

for (const proj of output) {
  const fileCount = proj.matches.length;
  const matchCount = proj.matches.reduce((s, m) => s + m.matchCount, 0);
  console.log('━━ ' + proj.project + ' (' + matchCount + ' matches in ' + fileCount + ' files) ━━\n');

  for (const file of proj.matches) {
    console.log('  ' + file.file);
    for (const snippet of file.snippets) {
      console.log('  ┌─');
      // Indent each snippet line
      for (const line of snippet.snippet.split('\n')) {
        console.log('  │' + line);
      }
      console.log('  └─');
    }
    if (file.truncated) {
      console.log('  ... (truncated, --max-per-file ' + maxPerFile + ')');
    }
    console.log('');
  }
}

console.log('─── ' + totalMatches + ' total matches across ' + output.length + ' projects ───');
