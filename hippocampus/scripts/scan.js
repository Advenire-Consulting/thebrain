'use strict';

const fs = require('fs');
const path = require('path');

const { DEFAULT_HIPPOCAMPUS_DIR } = require('../lib/dir-loader');
const { loadExtractors } = require('../lib/extractor-registry');
const { collectCodeFiles, shouldSkipDir } = require('../lib/file-collector');

const EXTRACTORS_DIR = path.join(__dirname, '..', 'extractors');
const registry = loadExtractors(EXTRACTORS_DIR);

/**
 * Snapshot database schemas using better-sqlite3.
 * Security: opens DB in readonly mode, only reads schema metadata.
 */
function snapshotSchemas(projectDir) {
  const resolvedRoot = path.resolve(projectDir);
  const schemas = {};

  function walk(dir) {
    const resolvedDir = path.resolve(dir);
    if (!resolvedDir.startsWith(resolvedRoot)) return;

    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (shouldSkipDir(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && (entry.name.endsWith('.db') || entry.name.endsWith('.sqlite'))) {
        try {
          const Database = require('better-sqlite3');
          const db = new Database(fullPath, { readonly: true });
          const tables = db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
          ).all();

          const tableMap = {};
          for (const t of tables) {
            const cols = db.prepare(`PRAGMA table_info("${t.name.replace(/"/g, '')}")`).all();
            tableMap[t.name] = cols.map(c => c.name).join(', ');
          }

          if (Object.keys(tableMap).length > 0) {
            const relative = path.relative(projectDir, fullPath);
            schemas[entry.name] = { path: relative, tables: tableMap };
          }

          db.close();
        } catch {
          // Skip unreadable DB files
        }
      }
    }
  }

  walk(projectDir);
  return schemas;
}

/**
 * Scan a project directory and produce a DIR file structure.
 * Preserves existing aliases and _dismissed from previous DIR file.
 */
function scanProject(projectDir, name, root, outputDir) {
  const hippocampusDir = outputDir || DEFAULT_HIPPOCAMPUS_DIR;

  // Load existing aliases, _dismissed, and descriptions from previous DIR file
  let existingAliases = {};
  let existingDismissed = [];
  let existingDescriptions = {};
  const existingPath = path.join(hippocampusDir, `${name}.dir.json`);
  if (fs.existsSync(existingPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(existingPath, 'utf-8'));
      existingAliases = existing.aliases || {};
      existingDismissed = existing._dismissed || [];
      // Preserve narrative descriptions across re-scans
      for (const [fileName, entry] of Object.entries(existing.files || {})) {
        if (entry.description) existingDescriptions[fileName] = entry.description;
      }
    } catch {
      // Ignore malformed existing file
    }
  }

  const codeFiles = collectCodeFiles(projectDir, registry.allExtensions);

  // Build per-file metadata — read each file once
  const fileData = {};
  for (const f of codeFiles) {
    let content;
    try { content = fs.readFileSync(f.absolute, 'utf-8'); }
    catch { continue; }

    const ext = path.extname(f.relative);
    const extractor = registry.byExtension.get(ext);

    fileData[f.relative] = {
      imports: extractor ? extractor.extractImports(f.relative, content) : [],
      npmImports: extractor && extractor.extractNpmImports ? extractor.extractNpmImports(f.relative, content) : [],
      exports: extractor ? extractor.extractExports(f.relative, content) : [],
      routes: extractor ? extractor.extractRoutes(f.relative, content) : [],
      content,
      absolute: f.absolute,
    };
  }

  // Build namespace-to-files map for namespace-based languages (C#, Java)
  const namespaceMap = {};
  for (const [fileName, data] of Object.entries(fileData)) {
    const ext = path.extname(fileName);
    const extractor = registry.byExtension.get(ext);
    if (extractor && typeof extractor.extractNamespace === 'function') {
      const ns = extractor.extractNamespace(fileName, data.content);
      if (ns) {
        if (!namespaceMap[ns]) namespaceMap[ns] = [];
        namespaceMap[ns].push(fileName);
        data.namespace = ns;
      }
    }
  }

  // Compute connection counts
  const connectionCount = {};
  for (const [fileName, data] of Object.entries(fileData)) {
    const localImports = data.imports.filter(imp => imp.startsWith('.'));
    connectionCount[fileName] = (connectionCount[fileName] || 0) + localImports.length;

    for (const imp of localImports) {
      const importerDir = path.dirname(path.join(projectDir, fileName));
      let resolved = path.relative(projectDir, path.resolve(importerDir, imp));
      // Try adding known extensions if bare import
      if (!fileData[resolved]) {
        for (const tryExt of registry.allExtensions) {
          if (fileData[resolved + tryExt]) { resolved = resolved + tryExt; break; }
        }
      }
      if (fileData[resolved]) {
        connectionCount[resolved] = (connectionCount[resolved] || 0) + 1;
      }
    }

    // Resolve namespace-based imports (C#, Java, etc.)
    // Each resolved import counts as 1 connection for the importer and 1 for the target.
    const nonLocalImports = data.imports.filter(imp => !imp.startsWith('.'));
    for (const imp of nonLocalImports) {
      // Direct namespace match: "using Foo.Bar" -> files in namespace "Foo.Bar"
      if (namespaceMap[imp]) {
        for (const target of namespaceMap[imp]) {
          if (target !== fileName) {
            connectionCount[fileName] = (connectionCount[fileName] || 0) + 1;
            connectionCount[target] = (connectionCount[target] || 0) + 1;
          }
        }
        continue;
      }

      // Prefix + type match: "import com.foo.bar.ClassName"
      const lastDot = imp.lastIndexOf('.');
      if (lastDot <= 0) continue;

      const nsPrefix = imp.substring(0, lastDot);
      const typeName = imp.substring(lastDot + 1);
      let matched = false;

      if (namespaceMap[nsPrefix]) {
        for (const target of namespaceMap[nsPrefix]) {
          if (target !== fileName && fileData[target].exports.includes(typeName)) {
            connectionCount[fileName] = (connectionCount[fileName] || 0) + 1;
            connectionCount[target] = (connectionCount[target] || 0) + 1;
            matched = true;
          }
        }
      }

      // Second-level fallback for static imports: "com.foo.Bar.method" -> try "com.foo" + "Bar"
      if (!matched && lastDot > 0) {
        const secondDot = nsPrefix.lastIndexOf('.');
        if (secondDot > 0) {
          const nsPrefix2 = nsPrefix.substring(0, secondDot);
          const typeName2 = nsPrefix.substring(secondDot + 1);
          if (namespaceMap[nsPrefix2]) {
            for (const target of namespaceMap[nsPrefix2]) {
              if (target !== fileName && fileData[target].exports.includes(typeName2)) {
                connectionCount[fileName] = (connectionCount[fileName] || 0) + 1;
                connectionCount[target] = (connectionCount[target] || 0) + 1;
              }
            }
          }
        }
      }
    }
  }

  // Build files map — 2+ connections OR has conversational alias
  const aliasedPaths = new Set(Object.values(existingAliases));
  const filesMap = {};

  for (const [fileName, data] of Object.entries(fileData)) {
    const connections = connectionCount[fileName] || 0;
    const isAliased = aliasedPaths.has(`${root}${fileName}`) || aliasedPaths.has(fileName);

    if (connections >= 2 || isAliased) {
      const entry = {};
      if (data.imports.length > 0) entry.imports = data.imports;
      // Always write npmImports (even empty) so audit can distinguish "scanned" from "pre-update"
      if (data.npmImports) entry.npmImports = data.npmImports;
      if (data.exports.length > 0) entry.exports = data.exports;
      if (data.routes.length > 0) entry.routes = data.routes;

      // DB reference detection (language-agnostic — uses already-read content)
      const dbRefs = data.content.match(/['"]([^'"]+\.(?:db|sqlite))['"]/g);
      if (dbRefs) {
        entry.db = [...new Set(dbRefs.map(r => r.replace(/['"]/g, '')))];
      }
      if (entry.db && entry.db.length > 0) {
        entry.sensitivity = 'data';
      }

      // Auto-generate mechanical summary from extracted metadata
      const parts = [];
      if (data.exports.length > 0) parts.push('Exports: ' + data.exports.join(', '));
      if (data.routes.length > 0) parts.push(data.routes.length + ' route' + (data.routes.length > 1 ? 's' : ''));
      if (entry.db) parts.push('DB: ' + entry.db.join(', '));
      const localImports = (data.imports || []).filter(imp => imp.startsWith('.'));
      if (localImports.length > 0) parts.push(localImports.length + ' local import' + (localImports.length > 1 ? 's' : ''));
      entry.purpose = parts.join(' | ') || '';

      // Preserve narrative description from previous scan if it exists
      if (existingDescriptions[fileName]) {
        entry.description = existingDescriptions[fileName];
      }

      filesMap[fileName] = entry;
    }
  }

  // Build outbound references (_shared/ imports)
  const outbound = new Set();
  for (const [, data] of Object.entries(fileData)) {
    for (const imp of data.imports) {
      const sharedMatch = imp.match(/_shared\/[\w.-]+/);
      if (sharedMatch) outbound.add(sharedMatch[0]);
    }
  }

  const schemas = snapshotSchemas(projectDir);

  return {
    name,
    root,
    generated_at: new Date().toISOString(),
    aliases: existingAliases,
    _dismissed: existingDismissed,
    files: filesMap,
    schemas,
    references: {
      outbound: [...outbound].sort(),
      inbound: [],
    },
  };
}

// ─── Auto-discovery ──────────────────────────────────────────────────────────
// Directories in /websites/ that are NOT projects. Everything else gets scanned.
const SKIP_DIRS_DISCOVERY = new Set([
  'node_modules', '.git', '.worktrees', 'marked-for-deletion',
  'Archived', 'Claudes', 'docs', 'schemas', 'snippets',
  'SonderPlugins',  // scanned as nested projects below
]);

// Nested project parents — scan their children as individual projects.
const NESTED_PARENTS = ['SonderPlugins'];

// Existing DIR files may use names that don't match directory names.
const NAME_OVERRIDES = {
  'advenire.consulting': 'advenire-portal',
  'michaelortegon.com': 'michaelortegon',
  'sonderos.org': 'sonderos',
  '_shared': 'shared-library',
  'SonderPlugins/thebrain': 'thebrain',
  'SonderPlugins/sloppy': 'sloppy',
};

function deriveName(dirRelative) {
  if (NAME_OVERRIDES[dirRelative]) return NAME_OVERRIDES[dirRelative];
  const base = path.basename(dirRelative);
  return base.toLowerCase().replace(/[._]/g, '-').replace(/--+/g, '-');
}

function discoverProjects(websitesDir) {
  const projects = [];

  const topEntries = fs.readdirSync(websitesDir, { withFileTypes: true });
  for (const entry of topEntries) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS_DISCOVERY.has(entry.name)) continue;
    if (entry.name.startsWith('.')) continue;

    const fullPath = path.join(websitesDir, entry.name);
    const hasCode = collectCodeFiles(fullPath, registry.allExtensions).length > 0;
    if (!hasCode) continue;

    const dirRelative = entry.name;
    projects.push({
      dir: dirRelative,
      name: deriveName(dirRelative),
      root: dirRelative + '/',
    });
  }

  for (const parent of NESTED_PARENTS) {
    const parentPath = path.join(websitesDir, parent);
    if (!fs.existsSync(parentPath)) continue;

    const children = fs.readdirSync(parentPath, { withFileTypes: true });
    for (const child of children) {
      if (!child.isDirectory()) continue;
      if (SKIP_DIRS_DISCOVERY.has(child.name)) continue;
      if (child.name.startsWith('.')) continue;

      const fullPath = path.join(parentPath, child.name);
      const hasCode = collectCodeFiles(fullPath, registry.allExtensions).length > 0;
      if (!hasCode) continue;

      const dirRelative = parent + '/' + child.name;
      projects.push({
        dir: dirRelative,
        name: deriveName(dirRelative),
        root: dirRelative + '/',
      });
    }
  }

  return projects;
}

// ─── Alias Triage ────────────────────────────────────────────────────────────

const KEY_DIRS = new Set(['lib/', 'routes/', 'admin/', 'scripts/', 'middleware/', 'extractors/']);

function countConnections(filesMap) {
  const counts = {};
  for (const [fileName, entry] of Object.entries(filesMap)) {
    const localImports = (entry.imports || []).filter(imp => imp.startsWith('.'));
    counts[fileName] = (counts[fileName] || 0) + localImports.length;
    // Count importedBy — compare basenames to avoid substring false positives
    const fileBase = path.basename(fileName, path.extname(fileName));
    for (const otherFile of Object.keys(filesMap)) {
      if (otherFile === fileName) continue;
      const otherImports = (filesMap[otherFile].imports || []);
      if (otherImports.some(imp => path.basename(imp, path.extname(imp)) === fileBase)) {
        counts[fileName] = (counts[fileName] || 0) + 1;
      }
    }
  }
  return counts;
}

function getTriageItems(dir) {
  const items = [];
  const aliasTargets = new Set(Object.values(dir.aliases || {}));
  const dismissed = dir._dismissed || [];
  const connections = countConnections(dir.files);

  for (const [fileName, entry] of Object.entries(dir.files)) {
    // Already aliased?
    let isAliased = false;
    for (const target of aliasTargets) {
      if (target.endsWith('/' + fileName) || target === fileName) { isAliased = true; break; }
    }
    if (isAliased) continue;

    // Already dismissed?
    if (dismissed.includes(fileName)) continue;

    const conn = connections[fileName] || 0;
    const inKeyDir = [...KEY_DIRS].some(d => fileName.startsWith(d));
    const hasRoutes = entry.routes && entry.routes.length > 0;

    if (conn >= 3 || inKeyDir || hasRoutes) {
      const reasons = [];
      if (conn >= 3) reasons.push(conn + ' connections');
      if (hasRoutes) reasons.push('has routes');
      if (inKeyDir && conn < 3 && !hasRoutes) reasons.push('key directory');
      items.push({ file: fileName, reason: reasons.join(', ') });
    }
  }

  return items;
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

if (require.main === module) {
  const { loadConfig } = require('../../lib/config');
  const config = loadConfig();
  const hippocampusDir = process.env.THEBRAIN_HIPPOCAMPUS_DIR || DEFAULT_HIPPOCAMPUS_DIR;

  fs.mkdirSync(hippocampusDir, { recursive: true });

  const args = process.argv.slice(2);

  // Handle --dismiss / --undismiss
  if (args[0] === '--dismiss' || args[0] === '--undismiss') {
    const action = args[0];
    const projectName = args[1];
    const filePath = args[2];
    if (!projectName || !filePath) {
      console.error('Usage: scan.js ' + action + ' <project-name> <file-path>');
      process.exit(1);
    }
    const dirFilePath = path.join(hippocampusDir, projectName + '.dir.json');
    if (!fs.existsSync(dirFilePath)) {
      console.error('DIR file not found: ' + dirFilePath);
      process.exit(1);
    }
    const dir = JSON.parse(fs.readFileSync(dirFilePath, 'utf-8'));
    dir._dismissed = dir._dismissed || [];

    if (action === '--dismiss') {
      if (!dir._dismissed.includes(filePath)) {
        dir._dismissed.push(filePath);
        console.log('Dismissed: ' + filePath + ' in ' + projectName);
      } else {
        console.log('Already dismissed: ' + filePath);
      }
    } else {
      dir._dismissed = dir._dismissed.filter(p => p !== filePath);
      console.log('Undismissed: ' + filePath + ' in ' + projectName);
    }

    fs.writeFileSync(dirFilePath, JSON.stringify(dir, null, 2) + '\n');
    fs.chmodSync(dirFilePath, 0o600);
    process.exit(0);
  }

  // Normal scan — iterate all registered workspaces
  if (config.workspaces.length === 0) {
    console.error('No workspaces configured. Run setup or edit ~/.claude/brain/config.json');
    process.exit(1);
  }

  const newProjects = [];
  const allTriageItems = {};

  for (const workspace of config.workspaces) {
    const wsPath = path.resolve(workspace.path);
    if (!fs.existsSync(wsPath)) {
      console.log(`Warning: workspace ${workspace.name} (${wsPath}) not found, skipping`);
      continue;
    }

    console.log(`\nScanning workspace: ${workspace.name} (${wsPath})`);
    const projects = discoverProjects(wsPath);
    console.log(`  Discovered ${projects.length} projects...`);

    for (const proj of projects) {
      const projectDir = path.join(wsPath, proj.dir);
      const existingPath = path.join(hippocampusDir, `${proj.name}.dir.json`);
      const isNew = !fs.existsSync(existingPath);

      const dir = scanProject(projectDir, proj.name, proj.root, hippocampusDir);
      const outputPath = path.join(hippocampusDir, `${proj.name}.dir.json`);
      fs.writeFileSync(outputPath, JSON.stringify(dir, null, 2) + '\n');
      fs.chmodSync(outputPath, 0o600);
      const fileCount = Object.keys(dir.files).length;
      const schemaCount = Object.keys(dir.schemas).length;
      const tag = isNew ? ' [NEW]' : '';
      console.log(`    ${proj.name}: ${fileCount} mapped files, ${schemaCount} schemas${tag}`);

      if (isNew) newProjects.push(proj.name);

      const triageItems = getTriageItems(dir);
      if (triageItems.length > 0) allTriageItems[proj.name] = triageItems;
    }
  }

  if (newProjects.length > 0) {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  NEW PROJECTS DETECTED — aliases needed:                    ║');
    for (const name of newProjects) {
      const padded = name.padEnd(52);
      console.log(`║    ${padded}║`);
    }
    console.log('║                                                              ║');
    console.log('║  Add aliases to ~/.claude/brain/hippocampus/<name>.dir.json  ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
  }

  if (Object.keys(allTriageItems).length > 0) {
    console.log('');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  FILES NEEDING ALIASES — review and assign or dismiss:       ║');
    for (const [projName, items] of Object.entries(allTriageItems)) {
      console.log('║    ' + projName + ':' + ' '.repeat(Math.max(1, 53 - projName.length)) + '║');
      for (const item of items) {
        const label = '      ' + item.file;
        const reasonStr = '(' + item.reason + ')';
        const line = label + ' '.repeat(Math.max(1, 50 - label.length - reasonStr.length)) + reasonStr;
        console.log('║  ' + line.padEnd(56) + '║');
      }
    }
    console.log('║                                                              ║');
    console.log('║  Dismiss: scan.js --dismiss <project> <file>                 ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
  }

  console.log('Done.');
}

module.exports = { scanProject, registry };
