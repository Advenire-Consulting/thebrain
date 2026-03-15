'use strict';

const path = require('path');
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

// Term index commands don't need DIR files
if (['--find', '--structure'].includes(command)) {
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
        const results = termDb.getStructure(project, file);
        if (results.length === 0) {
          console.log(`No structure found for "${file}" in ${project}`);
          process.exit(1);
        }
        printJson(results);
      } else {
        const allFiles = termDb.getAllFiles();
        const matches = allFiles.filter(f =>
          f.path === file || f.path.endsWith('/' + file) || path.basename(f.path) === file
        );
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

  default:
    console.log(`Hippocampus Query — codebase spatial map

Usage: node hippocampus/scripts/query.js <command> [args]

Commands:
  --resolve <alias>                    Resolve conversational alias to file path
  --blast-radius <file> [--project p]  Show what imports/depends on a file
  --lookup <file>                      Show file entry (exports, routes, db, sensitivity)
  --list-projects                      List all mapped projects with counts
  --list-aliases [--project p]         List conversational aliases
  --schema [--project p]               Show database schemas
  --find <identifier> [--project p]    Find every occurrence across all projects
  --structure <file> [--project p]     Show function/class/CSS definitions with line numbers

Examples:
  --resolve "portal auth"
  --blast-radius db.js --project advenire-portal
  --lookup bookingPublic.js
  --list-aliases --project advenire
  --find escapeHtml
  --structure server-utils.js`);
    break;
}
