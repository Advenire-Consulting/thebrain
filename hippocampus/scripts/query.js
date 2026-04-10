'use strict';

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { loadAllDIR, resolveAlias, getBlastRadius } = require('../lib/dir-loader');
const { TermDB } = require('../lib/term-db');

const args = process.argv.slice(2);
const command = args[0];

function flag(name) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

function printJson(obj) {
  console.log(JSON.stringify(obj, null, 2));
}

const dbPath = flag('--db');

// Resolve a file path in the term index — returns { project, path } or exits
function resolveFileInIndex(termDb, file, project) {
  // Strip project prefix if caller passed "drip/frontend/..." with --project drip
  if (project) {
    const prefix = project + '/';
    const stripped = file.startsWith(prefix) ? file.slice(prefix.length) : file;
    return { project, path: stripped };
  }
  const allFiles = termDb.getAllFiles();
  let match = allFiles.find(f =>
    f.path === file || f.path.endsWith('/' + file) || path.basename(f.path) === file
  );
  // Fallback: try stripping a project root prefix (e.g. "drip/frontend/..." → "frontend/...")
  if (!match) {
    const slash = file.indexOf('/');
    if (slash !== -1) {
      const stripped = file.slice(slash + 1);
      match = allFiles.find(f => f.path === stripped || f.path.endsWith('/' + stripped));
    }
  }
  if (!match) { console.error(`"${file}" not found in term index`); process.exit(1); }
  return { project: match.project, path: match.path };
}

// Resolve a project-relative file path to an absolute path on disk
function resolveAbsPath(resolvedProject, resolvedPath) {
  const dirData = dirs.find(d => d.name === resolvedProject);
  if (!dirData) { console.error(`Project "${resolvedProject}" not found in DIR files`); process.exit(1); }
  const { loadConfig } = require('../../lib/config');
  const cfg = loadConfig();
  for (const ws of cfg.workspaces || []) {
    const candidate = path.join(path.resolve(ws.path), dirData.root, resolvedPath);
    if (fs.existsSync(candidate)) return candidate;
  }
  console.error(`Could not resolve "${resolvedPath}" on disk`);
  process.exit(1);
}

// Term index commands don't need DIR files
if (['--find', '--structure', '--diff-symbols'].includes(command)) {
  // handled below in switch
} else {
  var dirs = loadAllDIR();
  if (dirs.length === 0) {
    console.error('No DIR files found. Run: node hippocampus/scripts/scan.js');
    process.exit(1);
  }
}

switch (command) {
  case '--resolve': {
    const query = args.slice(1).join(' ');
    if (!query) { console.error('Usage: --resolve <alias>'); process.exit(1); }
    const result = resolveAlias(dirs, query);
    if (result) {
      printJson(result);
    } else {
      console.log(`No match for "${query}"`);
      process.exit(1);
    }
    break;
  }

  case '--blast-radius': {
    const file = args[1];
    const project = flag('--project');
    if (!file) { console.error('Usage: --blast-radius <file> [--project name]'); process.exit(1); }

    if (project) {
      const result = getBlastRadius(dirs, file, project);
      printJson({ file, project, ...result });
    } else {
      // Search all projects for the file
      const results = [];
      for (const dir of dirs) {
        const match = Object.keys(dir.files || {}).find(f =>
          f === file || f.endsWith('/' + file) || path.basename(f) === file
        );
        if (match) {
          const result = getBlastRadius(dirs, match, dir.name);
          results.push({ file: match, project: dir.name, ...result });
        }
      }
      if (results.length === 0) {
        console.log(`"${file}" not found in any project`);
        process.exit(1);
      }
      printJson(results.length === 1 ? results[0] : results);
    }
    break;
  }

  case '--lookup': {
    const file = args[1];
    if (!file) { console.error('Usage: --lookup <file>'); process.exit(1); }

    const results = [];
    for (const dir of dirs) {
      for (const [name, entry] of Object.entries(dir.files || {})) {
        if (name === file || name.endsWith('/' + file) || path.basename(name) === file) {
          results.push({ file: name, project: dir.name, ...entry });
        }
      }
    }
    if (results.length === 0) {
      console.log(`"${file}" not found in any project`);
      process.exit(1);
    }
    printJson(results.length === 1 ? results[0] : results);
    break;
  }

  case '--list-projects': {
    const summary = dirs.map(d => ({
      name: d.name,
      root: d.root,
      files: Object.keys(d.files || {}).length,
      aliases: Object.keys(d.aliases || {}).length,
      schemas: Object.keys(d.schemas || {}).length,
    }));
    printJson(summary);
    break;
  }

  case '--list-aliases': {
    const project = flag('--project');
    const filtered = project ? dirs.filter(d => d.name.includes(project)) : dirs;
    const output = {};
    for (const dir of filtered) {
      const aliases = dir.aliases || {};
      if (Object.keys(aliases).length > 0) {
        output[dir.name] = aliases;
      }
    }
    printJson(output);
    break;
  }

  case '--map': {
    const project = args[1] || flag('--project');
    if (!project) { console.error('Usage: --map <project> [path-filter]'); process.exit(1); }
    const matched = dirs.filter(d => d.name.includes(project));
    if (matched.length === 0) {
      console.log(`No project matching "${project}"`);
      process.exit(1);
    }
    // Optional path filter for subtree
    const pathFilter = args[2] && !args[2].startsWith('--') ? args[2] : null;
    for (const dir of matched) {
      const output = { project: dir.name, root: dir.root, files: {} };
      for (const [fileName, entry] of Object.entries(dir.files || {})) {
        if (pathFilter && !fileName.startsWith(pathFilter)) continue;
        const fileInfo = { purpose: entry.purpose || '' };
        if (entry.description) fileInfo.description = entry.description;
        output.files[fileName] = fileInfo;
      }
      // Audit status from hypothalamus
      const hypothalamusDir = path.join(
        require('os').homedir(), '.claude', 'brain', 'hypothalamus'
      );
      const auditPath = path.join(hypothalamusDir, dir.name + '.audit.json');
      try {
        const auditMeta = JSON.parse(fs.readFileSync(auditPath, 'utf-8'));
        const auditDate = auditMeta.timestamp.split('T')[0];
        const f = auditMeta.findings;
        const total = (f.orphans || 0) + (f.undeclared || 0) + (f.unused || 0);

        const audit = { date: auditDate, status: 'clean' };
        if (total > 0) {
          const parts = [];
          if (f.orphans) parts.push(`${f.orphans} orphan${f.orphans > 1 ? 's' : ''}`);
          if (f.undeclared) parts.push(`${f.undeclared} undeclared`);
          if (f.unused) parts.push(`${f.unused} unused`);
          audit.status = parts.join(', ');
        }

        // Compute delta — files changed since last audit
        if (auditMeta.commit) {
          try {
            const { loadConfig } = require('../../lib/config');
            const cfg = loadConfig();
            for (const ws of cfg.workspaces || []) {
              const wsPath = path.resolve(ws.path);
              if (fs.existsSync(path.join(wsPath, dir.root))) {
                const delta = execFileSync('git', [
                  'diff', '--name-only', auditMeta.commit, 'HEAD', '--', dir.root
                ], { encoding: 'utf-8', cwd: wsPath }).trim();
                audit.delta = delta ? delta.split('\n').length : 0;
                break;
              }
            }
          } catch {
            // git not available or commit not found
          }
        }

        output.audit = audit;
      } catch {
        output.audit = 'never';
      }

      printJson(output);
    }
    break;
  }

  case '--schema': {
    const project = flag('--project');
    const filtered = project ? dirs.filter(d => d.name.includes(project)) : dirs;
    const output = {};
    for (const dir of filtered) {
      const schemas = dir.schemas || {};
      if (Object.keys(schemas).length > 0) {
        output[dir.name] = schemas;
      }
    }
    if (Object.keys(output).length === 0) {
      console.log('No schemas found');
      process.exit(1);
    }
    printJson(output);
    break;
  }

  case '--find': {
    const term = args[1];
    if (!term) { console.error('Usage: --find <identifier> [--project p] [--db path]'); process.exit(1); }
    const project = flag('--project');
    const termDb = new TermDB(dbPath || undefined);
    try {
      const results = termDb.findTerm(term, project || undefined);
      if (results.length === 0) {
        console.log(`No occurrences of "${term}" found`);
        process.exit(1);
      }
      printJson(results);
    } finally {
      termDb.close();
    }
    break;
  }

  case '--structure': {
    const file = args[1];
    if (!file) { console.error('Usage: --structure <file> [--project p] [--db path]'); process.exit(1); }
    const project = flag('--project');
    const termDb = new TermDB(dbPath || undefined);
    try {
      if (project) {
        // Strip project prefix if caller passed "drip/frontend/..." with --project drip
        const prefix = project + '/';
        const lookupFile = file.startsWith(prefix) ? file.slice(prefix.length) : file;
        const results = termDb.getStructure(project, lookupFile);
        if (results.length === 0) {
          console.log(`No structure found for "${lookupFile}" in ${project}`);
          process.exit(1);
        }
        printJson(results);
      } else {
        const allFiles = termDb.getAllFiles();
        let matches = allFiles.filter(f =>
          f.path === file || f.path.endsWith('/' + file) || path.basename(f.path) === file
        );
        // Fallback: strip project root prefix (e.g. "drip/frontend/..." → "frontend/...")
        if (matches.length === 0) {
          const slash = file.indexOf('/');
          if (slash !== -1) {
            const stripped = file.slice(slash + 1);
            matches = allFiles.filter(f => f.path === stripped || f.path.endsWith('/' + stripped));
          }
        }
        if (matches.length === 0) {
          console.log(`"${file}" not found in term index`);
          process.exit(1);
        }
        const results = [];
        for (const m of matches) {
          const defs = termDb.getStructure(m.project, m.path);
          if (defs.length > 0) {
            results.push({ file: m.path, project: m.project, definitions: defs });
          }
        }
        printJson(results.length === 1 ? results[0] : results);
      }
    } finally {
      termDb.close();
    }
    break;
  }

  case '--body': {
    // Extract a named function/definition body from source using term index line numbers
    const file = args[1];
    const name = args[2];
    if (!file || !name) { console.error('Usage: --body <file> <name> [--project p]'); process.exit(1); }
    const project = flag('--project');
    const termDb = new TermDB(dbPath || undefined);
    try {
      const resolved = resolveFileInIndex(termDb, file, project);
      const defs = termDb.getStructure(resolved.project, resolved.path);

      const target = defs.find(d => d.name === name);
      if (!target) { console.error(`"${name}" not found in ${resolved.path}`); process.exit(1); }

      const absPath = resolveAbsPath(resolved.project, resolved.path);
      const source = fs.readFileSync(absPath, 'utf-8').split('\n');

      // Find end line — next definition's start, or end of script section, or EOF
      const nextDef = defs.filter(d => d.line > target.line).sort((a, b) => a.line - b.line)[0];
      let endLine;
      if (nextDef) {
        endLine = nextDef.line - 1;
      } else if (absPath.endsWith('.svelte')) {
        // Last definition in script block — find </script>
        endLine = source.length;
        for (let i = target.line; i < source.length; i++) {
          if (/^\s*<\/script>/.test(source[i])) { endLine = i; break; }
        }
      } else {
        endLine = source.length;
      }
      // Trim trailing blank lines
      while (endLine > target.line && source[endLine - 1].trim() === '') endLine--;

      console.log(source.slice(target.line - 1, endLine).join('\n'));
    } finally {
      termDb.close();
    }
    break;
  }

  case '--section': {
    // Extract a named section (script, template, style) from a Svelte file
    const file = args[1];
    const section = args[2];
    if (!file || !section || !['script', 'template', 'style'].includes(section)) {
      console.error('Usage: --section <file> script|template|style [--project p]');
      process.exit(1);
    }
    const project = flag('--project');

    const termDb = new TermDB(dbPath || undefined);
    let resolved;
    try {
      resolved = resolveFileInIndex(termDb, file, project);
    } finally {
      termDb.close();
    }

    if (!resolved.path.endsWith('.svelte')) {
      console.error('--section only works with .svelte files');
      process.exit(1);
    }

    const absPath = resolveAbsPath(resolved.project, resolved.path);
    const source = fs.readFileSync(absPath, 'utf-8').split('\n');

    // Find section boundaries
    let scriptStart = -1, scriptEnd = -1, styleStart = -1, styleEnd = -1;
    for (let i = 0; i < source.length; i++) {
      if (/^<script[\s>]/.test(source[i]) && scriptStart === -1) scriptStart = i;
      if (/^<\/script>/.test(source[i]) && scriptStart !== -1) scriptEnd = i;
      if (/^<style[\s>]/.test(source[i]) && styleStart === -1) styleStart = i;
      if (/^<\/style>/.test(source[i]) && styleStart !== -1) styleEnd = i;
    }

    let start, end;
    if (section === 'script') {
      if (scriptStart === -1) { console.error('No <script> block found'); process.exit(1); }
      start = scriptStart;
      end = scriptEnd >= 0 ? scriptEnd + 1 : source.length;
    } else if (section === 'style') {
      if (styleStart === -1) { console.error('No <style> block found'); process.exit(1); }
      start = styleStart;
      end = styleEnd >= 0 ? styleEnd + 1 : source.length;
    } else {
      // Template = everything between </script> and <style> (or EOF if no style)
      start = scriptEnd >= 0 ? scriptEnd + 1 : 0;
      end = styleStart >= 0 ? styleStart : source.length;
      // Trim leading/trailing blank lines from template section
      while (start < end && source[start].trim() === '') start++;
      while (end > start && source[end - 1].trim() === '') end--;
    }

    // Output with 1-indexed line numbers for easy reference
    const lines = source.slice(start, end);
    console.log(`Lines ${start + 1}-${end} of ${resolved.path}:`);
    console.log(lines.join('\n'));
    break;
  }

  case '--diff-symbols': {
    // Compare definitions between two files — shows what's in A only, B only, or both
    const fileA = args[1];
    const fileB = args[2];
    if (!fileA || !fileB) { console.error('Usage: --diff-symbols <file-a> <file-b> [--project p]'); process.exit(1); }
    const project = flag('--project');
    const termDb = new TermDB(dbPath || undefined);
    try {
      const a = resolveFileInIndex(termDb, fileA, project);
      const b = resolveFileInIndex(termDb, fileB, project);
      const defsA = termDb.getStructure(a.project, a.path);
      const defsB = termDb.getStructure(b.project, b.path);

      // Build name→type maps
      const mapA = new Map(defsA.map(d => [d.name, d.type]));
      const mapB = new Map(defsB.map(d => [d.name, d.type]));

      const onlyA = defsA.filter(d => !mapB.has(d.name)).map(d => ({ name: d.name, type: d.type, line: d.line }));
      const onlyB = defsB.filter(d => !mapA.has(d.name)).map(d => ({ name: d.name, type: d.type, line: d.line }));
      const both = defsA.filter(d => mapB.has(d.name)).map(d => ({
        name: d.name,
        typeA: d.type, lineA: d.line,
        typeB: mapB.get(d.name), lineB: defsB.find(x => x.name === d.name).line,
      }));

      printJson({
        fileA: a.path,
        fileB: b.path,
        onlyInA: onlyA,
        onlyInB: onlyB,
        inBoth: both,
      });
    } finally {
      termDb.close();
    }
    break;
  }

  default:
    console.log(`Hippocampus Query — codebase spatial map

Usage: node hippocampus/scripts/query.js <command> [args]

Commands:
  --resolve <alias>                    Resolve conversational alias to file path
  --blast-radius <file> [--project p]  Show what imports/depends on a file
  --lookup <file>                      Show file entry (exports, routes, db, sensitivity)
  --map <project> [path-filter]        Project directory map — what each file does
  --list-projects                      List all mapped projects with counts
  --list-aliases [--project p]         List conversational aliases
  --schema [--project p]               Show database schemas
  --find <identifier> [--project p]    Find every occurrence across all projects
  --structure <file> [--project p]     Show function/class/CSS definitions with line numbers
  --body <file> <name> [--project p]   Extract a function/definition body from source
  --section <file> script|template|style [--project p]  Extract Svelte file section
  --diff-symbols <file-a> <file-b> [--project p]        Compare definitions between two files

Examples:
  --resolve "portal auth"
  --blast-radius db.js --project advenire-portal
  --lookup bookingPublic.js
  --map signal-assistant
  --map advenire-portal server/
  --list-aliases --project advenire
  --find escapeHtml
  --structure server-utils.js
  --body ThreadPanel.svelte handleSend --project drip
  --section ThreadPanel.svelte script --project drip
  --diff-symbols ThreadPanel.svelte ThreadConversation.svelte --project drip`);
    break;
}
