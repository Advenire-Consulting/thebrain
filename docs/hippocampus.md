# Hippocampus

Spatial map of the codebase. Knows where every significant file lives, what it imports, what imports it, which databases it touches, and how to refer to it conversationally. Also maintains a persistent term index of every identifier across all projects.

## What It Does

1. **Scans** project directories and produces `.dir.json` files (DIR files) — one per project
2. **Maps** file imports/exports, route definitions, and database references
3. **Resolves aliases** — "portal auth" maps to a specific file path
4. **Calculates blast radius** — how many files depend on a given file
5. **Indexes identifiers** — every function, class, variable, CSS selector across all projects with line numbers
6. **Provides spatial data** to the hypothalamus for safety checks and to CC2 for project resolution

## Key Files

| File | Purpose |
|------|---------|
| `lib/dir-loader.js` | Loads DIR files, resolves aliases, computes blast radius |
| `lib/term-db.js` | SQLite term index — files, terms, occurrences, definitions |
| `lib/extractor.js` | Thin dispatcher — delegates to extractor registry for backward compat |
| `lib/extractor-registry.js` | Auto-loads language extractors from `extractors/` directory |
| `lib/file-collector.js` | Shared file discovery — collects code files by extension set |
| `lib/term-scanner.js` | Incremental scanner — size/mtime/hash skip logic |
| `extractors/*.js` | Per-language extraction adapters (JS, TS, Python, Shell, CSS) |
| `scripts/scan.js` | Filesystem scanner — produces DIR files, auto-discovers projects |
| `scripts/query.js` | CLI — resolve, blast-radius, lookup, find, structure, schema |
| `scripts/term-scan-cli.js` | Incremental term index scan across all projects |
| `~/.claude/brain/hippocampus/*.dir.json` | Output — one DIR file per project |
| `~/.claude/brain/hippocampus/terms.db` | Term index database |

## CLI

```
node $PLUGIN_ROOT/hippocampus/scripts/query.js <command>
```

| Command | What it does |
|---------|-------------|
| `--resolve <alias>` | Conversational name → file path |
| `--blast-radius <file> [--project p]` | What imports it, what it imports |
| `--lookup <file>` | Exports, routes, db refs, sensitivity |
| `--find <identifier> [--project p]` | Every occurrence across all projects with line numbers |
| `--structure <file> [--project p]` | Function/class/CSS definitions with line numbers |
| `--list-projects` | List all mapped projects with file counts |
| `--list-aliases [--project p]` | Browse conversational aliases |
| `--schema [--project p]` | Database table structures |

## DIR File Shape

```json
{
  "name": "advenire-portal",
  "root": "advenire.consulting/",
  "generated_at": "2026-03-07T23:59:12Z",
  "aliases": {
    "portal auth": "advenire.consulting/calendar-server/middleware/clientAuth.js"
  },
  "files": {
    "calendar-server/database/db.js": {
      "exports": ["getDb", "closeDb"],
      "db": ["unified.db"],
      "sensitivity": "data"
    }
  },
  "schemas": {
    "unified.db": {
      "tables": { "companies": "id, name, slug, ..." }
    }
  }
}
```

## File Inclusion Rules

A file appears in the `files` map if it has 2+ connections (imports + imported-by count) or has a conversational alias.

## Term Index

Persistent SQLite database (`terms.db`) with every identifier across all 9 projects. Schema: `files`, `terms`, `occurrences`, `definitions` tables. ~793 files indexed.

- **Incremental scanning:** size/mtime/hash skip logic. The PostToolUse hook catches Claude's edits in real-time. Wrapup catches user's manual edits.
- **`--find`** queries the term index. **`--structure`** queries it for definitions only.

## Sensitivity Field

Files with database references (`db` field) are automatically annotated with `sensitivity: 'data'` at scan time. The hypothalamus uses this for threat classification.

## Extractor Architecture

Language-specific extraction is handled by pluggable adapters in `extractors/`. Each extractor file exports:

```js
module.exports = {
  extensions: ['.js', '.mjs', '.cjs'],
  extractImports(filePath, content) {},     // DIR file: dependency graph
  extractExports(filePath, content) {},     // DIR file: public API
  extractRoutes(filePath, content) {},      // DIR file: HTTP endpoints
  extractIdentifiers(line, lineNumber) {},  // Term index: searchable identifiers
  extractDefinitions(content) {},           // Term index: function/class/type definitions
};
```

**Current extractors:** JavaScript (`.js`, `.mjs`, `.cjs`), TypeScript (`.ts`, `.tsx`), Python (`.py`), Shell (`.sh`, `.bash`), CSS (`.css`)

**Adding a new language:** Create `extractors/<language>.js` with the interface above. The registry auto-discovers it on next scan. No other files need editing.

## Scanner

Run manually: `node $PLUGIN_ROOT/hippocampus/scripts/scan.js`

**Auto-discovery:** Scans all directories in `/websites/` that contain code files. New projects are automatically detected — no registration needed. Projects with names that don't match their directory (e.g., `advenire.consulting` → `advenire-portal`) use `NAME_OVERRIDES` in scan.js.

Preserves existing aliases and `_dismissed` lists across re-scans.

## Alias Triage

After each scan, the scanner surfaces files that may need conversational aliases. Only files meeting one of these criteria are flagged:
- 3+ connections (imports + importedBy)
- Located in key directories: `lib/`, `routes/`, `admin/`, `scripts/`, `middleware/`, `extractors/`
- Has route definitions

Files already aliased or dismissed are skipped.

```bash
# Dismiss a file (won't surface again)
node $PLUGIN_ROOT/hippocampus/scripts/scan.js --dismiss <project> <file>

# Undismiss (will surface again)
node $PLUGIN_ROOT/hippocampus/scripts/scan.js --undismiss <project> <file>
```

Dismissed files are stored in the DIR file's `_dismissed` array (underscore prefix — consumers ignore it).
