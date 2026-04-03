'use strict';

// Pattern classifier — categorize files by which variant of a pattern they use
// Takes a JSON config of named patterns, scans all project files, reports which
// files match which variant. Designed for migration audits and convention checks.
//
// Usage:
//   node hippocampus/scripts/classify.js <config-file> [--project name] [--context N]
//   node hippocampus/scripts/classify.js --inline "label1=pattern1" "label2=pattern2" [--project name]
//
// Config file format (JSON):
//   {
//     "name": "Runtime URL patterns",
//     "variants": {
//       "relative (correct)": "getContextRoot\\(\\).*api/runtime/",
//       "absolute with slug": "/runtime/[a-z0-9-]+/api/",
//       "absolute no slug (BROKEN)": "/runtime/api/"
//     },
//     "exclude": ["tests/", "docs/"]
//   }

const fs = require('fs');
const path = require('path');
const { loadAllDIR } = require('../lib/dir-loader');
const { loadConfig } = require('../../lib/config');

const args = process.argv.slice(2);

// Parse flags
function flag(name) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

function hasFlag(name) {
  return args.includes(name);
}

const projectFilter = flag('--project');
const contextLines = parseInt(flag('--context') || flag('-C') || '1', 10);
const isInline = hasFlag('--inline');

// Parse config — either from file or inline args
let config;

if (isInline) {
  // Collect all label=pattern args after --inline
  const inlineIdx = args.indexOf('--inline');
  const variants = {};
  for (let i = inlineIdx + 1; i < args.length; i++) {
    if (args[i].startsWith('--')) break;
    const eq = args[i].indexOf('=');
    if (eq === -1) {
      console.error('Inline variant must be label=pattern: ' + args[i]);
      process.exit(1);
    }
    variants[args[i].slice(0, eq)] = args[i].slice(eq + 1);
  }
  if (Object.keys(variants).length === 0) {
    console.error('No variants provided. Use: --inline "label1=pattern1" "label2=pattern2"');
    process.exit(1);
  }
  config = { name: 'Inline classification', variants, exclude: [] };
} else {
  // Config file mode
  const configFile = args.find(a => !a.startsWith('--'));
  if (!configFile) {
    console.log(`Usage:
  node hippocampus/scripts/classify.js <config.json> [--project name] [--context N]
  node hippocampus/scripts/classify.js --inline "label=pattern" ... [--project name]

Config file format:
  {
    "name": "Description",
    "variants": {
      "label1": "regex1",
      "label2": "regex2"
    },
    "exclude": ["tests/", "docs/"]
  }

Inline example:
  node hippocampus/scripts/classify.js --inline \\
    "relative=getContextRoot.*api/" \\
    "absolute with slug=/runtime/[a-z0-9-]+/api/" \\
    "broken=/runtime/api/"

Options:
  --project <name>    Filter to one project
  --context N, -C N   Lines of context per match (default: 1)
  --no-snippets       Summary only, no code snippets`);
    process.exit(1);
  }

  try {
    config = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
  } catch (err) {
    console.error('Failed to read config: ' + err.message);
    process.exit(1);
  }
}

const showSnippets = !hasFlag('--no-snippets');
const excludePatterns = (config.exclude || []).map(p => new RegExp(p));

// Compile variant regexes
const variants = {};
for (const [label, pat] of Object.entries(config.variants)) {
  try {
    variants[label] = new RegExp(pat);
  } catch (err) {
    console.error('Invalid regex for "' + label + '": ' + err.message);
    process.exit(1);
  }
}

// Reuse file collection from grep.js
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '.cache',
  'coverage', '.nyc_output', '__pycache__', '.venv', 'vendor',
]);

const TEXT_EXTENSIONS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
  '.html', '.htm', '.css', '.scss', '.less',
  '.json', '.md', '.txt', '.yml', '.yaml', '.toml',
  '.sql', '.sh', '.bash', '.zsh',
  '.py', '.rb', '.go', '.rs', '.java', '.c', '.h', '.cpp',
  '.env', '.example', '.conf', '.cfg',
  '.xml', '.svg', '.ejs', '.hbs', '.pug',
]);

function collectFiles(dirPath) {
  const results = [];
  function walk(current) {
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); }
    catch { return; }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(path.join(current, entry.name));
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (TEXT_EXTENSIONS.has(ext) || (ext === '' && entry.name !== 'LICENSE')) {
          results.push(path.join(current, entry.name));
        }
      }
    }
  }
  walk(dirPath);
  return results;
}

// Direction detection — examines the match line and nearby lines to determine
// whether this code is making a request, defining a route, setting config, or just a reference
const DIRECTION_PATTERNS = {
  client: [
    /\bfetch\s*\(/, /\.get\s*\(/, /\.post\s*\(/, /\.put\s*\(/, /\.patch\s*\(/, /\.delete\s*\(/,
    /XMLHttpRequest/, /\$\.ajax/, /\$\.get/, /\$\.post/,
    /\bimport\s*\(/, /window\.location/, /location\.href/,
    /\.href\s*=/, /\.src\s*=/,
  ],
  server: [
    /\bapp\.(get|post|put|patch|delete|use)\s*\(/, /\brouter\.(get|post|put|patch|delete|use)\s*\(/,
    /\bres\.redirect/, /\bres\.json/, /\bres\.send/, /\bres\.status/,
    /\.prepare\s*\(/, /\.exec\s*\(/,
  ],
  config: [
    /apiBase\s*[:=]/, /baseUrl\s*[:=]/, /baseURL\s*[:=]/, /endpoint\s*[:=]/,
    /href\s*=\s*["']/, /src\s*=\s*["']/, /action\s*=\s*["']/,
    /const\s+\w*[Uu][Rr][Ll]\s*=/, /var\s+\w*[Uu][Rr][Ll]\s*=/, /let\s+\w*[Uu][Rr][Ll]\s*=/,
    /var\s+API\s*=/, /const\s+API\s*=/, /let\s+API\s*=/,
    /https?:\/\//, /ics:\s*['"]/, /url:\s*['"]/, /apiBase\s*:/,
  ],
  reference: [
    /^\s*\/\//, /^\s*\/?\*/, /^\s*#/, /^\s*<!--/,
    /\.test\s*\(/, /\.get\s*\(\s*['"]\//, /supertest/,
    /assert/, /expect\s*\(/, /describe\s*\(/, /it\s*\(/,
    /console\.log\s*\(.*`/, /process\.exit/,
  ],
};

// Detect direction from the match line and surrounding context
function detectDirection(lines, matchIdx, ctx) {
  const start = Math.max(0, matchIdx - ctx);
  const end = Math.min(lines.length - 1, matchIdx + ctx);

  // Collect the window of lines to check
  const window = [];
  for (let j = start; j <= end; j++) window.push(lines[j]);
  const matchLine = lines[matchIdx];

  // Check match line first, then surrounding context
  // Priority: reference > client > server > config (check most specific first)

  // Reference — comments and test assertions
  if (DIRECTION_PATTERNS.reference.some(p => p.test(matchLine))) return 'reference';

  // Client — outgoing requests
  if (DIRECTION_PATTERNS.client.some(p => p.test(matchLine))) return 'client';
  if (window.some(line => DIRECTION_PATTERNS.client.some(p => p.test(line)))) return 'client';

  // Server — route definitions and responses
  if (DIRECTION_PATTERNS.server.some(p => p.test(matchLine))) return 'server';
  if (window.some(line => DIRECTION_PATTERNS.server.some(p => p.test(line)))) return 'server';

  // Config — URL assignments and templates
  if (DIRECTION_PATTERNS.config.some(p => p.test(matchLine))) return 'config';

  return 'unknown';
}

// Classify a single file — returns hits with variant, direction, line number, and context
function classifyFile(filePath, ctx) {
  let content;
  try { content = fs.readFileSync(filePath, 'utf-8'); }
  catch { return []; }
  if (content.includes('\0')) return [];

  const lines = content.split('\n');
  const hits = [];

  for (let i = 0; i < lines.length; i++) {
    for (const [label, regex] of Object.entries(variants)) {
      if (regex.test(lines[i])) {
        const start = Math.max(0, i - ctx);
        const end = Math.min(lines.length - 1, i + ctx);
        const contextSnippet = [];
        for (let j = start; j <= end; j++) {
          const marker = j === i ? '>' : ' ';
          contextSnippet.push(marker + ' ' + String(j + 1).padStart(4) + '  ' + lines[j]);
        }

        const direction = detectDirection(lines, i, 2);

        hits.push({
          variant: label,
          direction,
          lineNum: i + 1,
          context: contextSnippet.join('\n'),
        });
      }
    }
  }

  return hits;
}

// Main
const dirs = loadAllDIR();
if (dirs.length === 0) {
  console.error('No DIR files found. Run: node hippocampus/scripts/scan.js');
  process.exit(1);
}

const brainConfig = loadConfig();
const workspace = (brainConfig.workspaces && brainConfig.workspaces[0]) ? brainConfig.workspaces[0].path : null;
if (!workspace) {
  console.error('No workspace configured in brain config');
  process.exit(1);
}

const projects = projectFilter
  ? dirs.filter(d => d.name.toLowerCase().includes(projectFilter.toLowerCase()))
  : dirs;

if (projects.length === 0) {
  console.error('No project matching "' + projectFilter + '"');
  process.exit(1);
}

// Collect all results grouped by variant
const byVariant = {};
for (const label of Object.keys(variants)) {
  byVariant[label] = []; // { project, file, hits: [{ lineNum, context }] }
}
const unmatched = []; // files that match ANY variant's broader pattern but none of the specific ones

let filesScanned = 0;

for (const project of projects) {
  const projectRoot = path.join(workspace, project.root);
  if (!fs.existsSync(projectRoot)) continue;

  const files = collectFiles(projectRoot);

  for (const filePath of files) {
    const relPath = path.relative(projectRoot, filePath);

    // Apply exclude patterns
    if (excludePatterns.some(p => p.test(relPath))) continue;

    filesScanned++;
    const hits = classifyFile(filePath, contextLines);
    if (hits.length === 0) continue;

    // Group hits by variant for this file
    const fileByVariant = {};
    for (const hit of hits) {
      if (!fileByVariant[hit.variant]) fileByVariant[hit.variant] = [];
      fileByVariant[hit.variant].push(hit);
    }

    for (const [label, fileHits] of Object.entries(fileByVariant)) {
      byVariant[label].push({
        project: project.name,
        file: relPath,
        hits: fileHits,
      });
    }
  }
}

// Print results
console.log('━━ ' + (config.name || 'Classification') + ' ━━');
console.log(filesScanned + ' files scanned across ' + projects.length + ' projects\n');

let totalFiles = 0;
let totalHits = 0;

for (const [label, entries] of Object.entries(byVariant)) {
  const hitCount = entries.reduce((s, e) => s + e.hits.length, 0);
  const fileCount = entries.length;
  totalFiles += fileCount;
  totalHits += hitCount;

  const bar = hitCount === 0 ? '  ' : '██';
  console.log(bar + ' ' + label + ' — ' + hitCount + ' hits in ' + fileCount + ' files');

  if (showSnippets && entries.length > 0) {
    // Group by project
    const byProject = {};
    for (const entry of entries) {
      if (!byProject[entry.project]) byProject[entry.project] = [];
      byProject[entry.project].push(entry);
    }

    for (const [projName, projEntries] of Object.entries(byProject)) {
      console.log('   ' + projName + '/');
      for (const entry of projEntries) {
        for (const hit of entry.hits) {
          const dirTag = hit.direction ? ' [' + hit.direction + ']' : '';
          console.log('     ' + entry.file + ':' + hit.lineNum + dirTag);
          // Indent context
          for (const line of hit.context.split('\n')) {
            console.log('     │' + line);
          }
        }
      }
    }
  }
  console.log('');
}

// Summary bar
console.log('─── Summary ───');
for (const [label, entries] of Object.entries(byVariant)) {
  const hitCount = entries.reduce((s, e) => s + e.hits.length, 0);
  const pct = totalHits > 0 ? Math.round((hitCount / totalHits) * 100) : 0;
  const barLen = Math.max(1, Math.round(pct / 2));
  const bar = '█'.repeat(barLen);
  console.log('  ' + bar + ' ' + pct + '% ' + label + ' (' + hitCount + ')');
}
console.log('  ' + totalHits + ' total hits in ' + totalFiles + ' files');

// Direction breakdown
const allHits = [];
for (const entries of Object.values(byVariant)) {
  for (const entry of entries) {
    for (const hit of entry.hits) allHits.push(hit);
  }
}
const dirCounts = {};
for (const hit of allHits) {
  dirCounts[hit.direction] = (dirCounts[hit.direction] || 0) + 1;
}
if (Object.keys(dirCounts).length > 0) {
  console.log('\n─── By Direction ───');
  const dirLabels = { client: '→ client (outgoing)', server: '← server (route/handler)', config: '⚙ config (URL definition)', reference: '📎 reference (comment/test)', unknown: '? unknown' };
  for (const [dir, count] of Object.entries(dirCounts).sort((a, b) => b[1] - a[1])) {
    const pct = Math.round((count / allHits.length) * 100);
    console.log('  ' + (dirLabels[dir] || dir) + ': ' + count + ' (' + pct + '%)');
  }
}
