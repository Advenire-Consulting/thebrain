# Hippocampus

Spatial map of the codebase. Knows where every significant file lives, what it imports, what imports it, which databases it touches, and how to refer to it conversationally. Also maintains a persistent term index of every identifier across all projects.

## What It Does

1. **Scans** project directories and produces `.dir.json` files (DIR files) — one per project
2. **Maps** file imports/exports, route definitions, and database references
3. **Resolves aliases** — "portal auth" maps to a specific file path
4. **Calculates blast radius** — how many files depend on a given file
5. **Indexes identifiers** — every function, class, variable, CSS selector across all projects with line numbers
6. **Searches content** — project-aware grep with context, and pattern variant classification with direction detection
7. **Cross-checks specs and plans** for collisions (file overlaps, schema conflicts, dependency order) before planning
8. **Dispatches plan chunks** as self-contained assignments for executor sessions
9. **Provides spatial data** to the hypothalamus for safety checks and to CC2 for project resolution

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
| `scripts/query.js` | CLI — map, resolve, blast-radius, lookup, find, structure, schema |
| `scripts/grep.js` | Project-aware content search — regex across all projects with context |
| `scripts/classify.js` | Pattern variant classifier — categorize files by URL/convention variants with direction detection |
| `scripts/spec-check.js` | Spec/plan cross-checker and chunk dispatcher for plan execution |
| `lib/spec-check/` | Spec-check internals — frontmatter parsing, collision detection, chunk extraction, report formatting |
| `scripts/term-scan-cli.js` | Incremental term index scan across all projects |
| `~/.claude/brain/hippocampus/*.dir.json` | Output — one DIR file per project |
| `~/.claude/brain/hippocampus/terms.db` | Term index database |

## CLI

```
node $PLUGIN_ROOT/hippocampus/scripts/query.js <command>
```

| Command | What it does |
|---------|-------------|
| `--map <project> [path-filter]` | **Check first** — project directory map (what each file does) |
| `--resolve <alias>` | Conversational name → file path |
| `--blast-radius <file> [--project p]` | What imports it, what it imports |
| `--lookup <file>` | Exports, routes, db refs, sensitivity |
| `--find <identifier> [--project p]` | Every occurrence across all projects with line numbers |
| `--structure <file> [--project p]` | Function/class/CSS definitions with line numbers |
| `--body <file> <name> [--project p]` | Extract a named function body from source |
| `--section <file> script\|template\|style [--project p]` | Extract a Svelte file section |
| `--diff-symbols <file-a> <file-b> [--project p]` | Compare definitions between two files |
| `--list-projects` | List all mapped projects with file counts |
| `--list-aliases [--project p]` | Browse conversational aliases |
| `--schema [--project p]` | Database table structures |

## Content Search

Live content search across project files. Uses DIR files for project boundaries but searches file content at query time (not cached).

### grep.js — Project-aware content search

```
node $PLUGIN_ROOT/hippocampus/scripts/grep.js <pattern> [--project name] [--context N] [--max-per-file N]
```

Walks all files in known project directories, searches for a regex, returns matches with surrounding context grouped by project. Skips node_modules, .git, build artifacts, binaries. Default 3 lines of context.

Use cases: hardcoded URL patterns, config key usage, security audits (innerHTML, eval), API endpoint references, migration tracking. Replaces multi-round Grep+Read cycles with one command.

### classify.js — Pattern variant classifier

```
node $PLUGIN_ROOT/hippocampus/scripts/classify.js --inline "label=regex" "label=regex" [--project name] [--context N] [--no-snippets]
node $PLUGIN_ROOT/hippocampus/scripts/classify.js <config.json> [--project name]
```

Takes multiple named regex variants, scans all project files, reports which files match which variant. Each hit is tagged with a **direction**: `[client]` (fetch, XHR), `[server]` (route definition), `[config]` (URL assignment), or `[reference]` (comment, test). Shows percentage breakdown by variant and by direction.

Config files (JSON) support `exclude` patterns and a `name` field. Useful for reusable audits.

Use cases: migration audits ("how much code uses old pattern vs new?"), convention enforcement, routing analysis across Caddy/Express/frontend boundaries.

## Spec / Plan Cross-Check + Chunk Dispatch

Two capabilities in one tool: collision detection across design docs, and chunk extraction for dispatching plan work to executor sessions.

### Cross-Check — Collision Detection

```
node $PLUGIN_ROOT/hippocampus/scripts/spec-check.js --dir <path> [--dir <path>...]
```

Scans a folder recursively for spec and plan markdown files with YAML frontmatter. Detects:
- **File collisions** — multiple specs/plans touching the same file
- **Schema collisions** — overlapping database table definitions
- **Dangling subscribes** — event listeners with no matching emitter
- **Double emits** — same file emitting the same event twice
- **Dependency order issues** — plans depending on unfinished specs

Produces a two-section report: human-readable summary + Claude-readable index with line-range references.

Use `--strict` to exit non-zero if any headerless (no frontmatter) docs are found — useful for enforcing the frontmatter convention.

### Frontmatter Templates

```
node $PLUGIN_ROOT/hippocampus/scripts/spec-check.js --template spec
node $PLUGIN_ROOT/hippocampus/scripts/spec-check.js --template plan
```

Prints a ready-to-fill YAML frontmatter block. Every spec and plan must have frontmatter — the template is the canonical schema reference.

### Chunk Extraction — Plan Dispatch

Plans are structured as `## Chunk N — <name>` sections, each self-contained enough for an independent executor session. The chunk extractor assembles everything an executor needs into a single file:

1. **Standing-rules preamble** — no restarts, no commits, respect touched files list
2. **Plan header** — everything above the first chunk (goal, architecture decisions, tech stack)
3. **Prior agent observations** — from the sibling `<plan-stem>.observations.md` file
4. **Chunk body** — the specific `## Chunk N` section verbatim

```
node $PLUGIN_ROOT/hippocampus/scripts/spec-check.js --list-chunks <plan>
node $PLUGIN_ROOT/hippocampus/scripts/spec-check.js --chunk-content <plan> <n>
node $PLUGIN_ROOT/hippocampus/scripts/spec-check.js --dispatch <plan>
```

| Command | What it does |
|---------|-------------|
| `--list-chunks <plan>` | List chunks with line ranges and line counts |
| `--chunk-range <plan> <n>` | Print `L<start>-L<end>` for one chunk |
| `--chunk-content <plan> <n>` | Print full assembled assignment for chunk n to stdout |
| `--dispatch <plan>` | Write all chunk assignments to `<plan-dir>/chunks/` and append read instructions to `~/claude/command-log.txt` |

`--dispatch` is the primary surface. It creates the `chunks/` sibling directory, writes one file per chunk (`<plan-stem>-chunk-<N>.md`), and appends one-line read instructions to the command log for easy copy-paste into executor sessions.

### Chunk Lifecycle

When an executor finishes a chunk, two things happen automatically (enforced by the standing-rules preamble):

1. **Observations** — the executor appends a `## Chunk N` section to `<plan-stem>.observations.md` noting things seen but NOT fixed (out of scope). The next chunk's executor sees them via `--chunk-content`.
2. **Completion** — the executor moves its chunk file into `chunks/completed/` (creating the subfolder if needed). This gives a clear visual signal of progress: remaining work is in `chunks/`, finished work is in `chunks/completed/`.

### Key Lib Files

| File | Purpose |
|------|---------|
| `lib/spec-check/frontmatter-parser.js` | YAML frontmatter extraction and validation |
| `lib/spec-check/collision-detector.js` | File, schema, event, and dependency collision detection |
| `lib/spec-check/chunk-extractor.js` | Chunk listing, assignment assembly, dispatch payload generation |
| `lib/spec-check/report-formatter.js` | Human summary + Claude index report rendering |
| `lib/spec-check/schema.js` | Frontmatter schema definitions and template rendering |
| `lib/spec-check/walker.js` | Recursive directory walker for spec/plan discovery |
| `lib/spec-check/yaml-parser.js` | Lightweight YAML parser (no external dependencies) |

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
      "purpose": "Exports: getDb, closeDb | DB: unified.db",
      "description": "SQLite connection manager — opens per-company DBs and the shared unified.db",
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

### File Description Fields

Each file entry has two description layers:

- **`purpose`** (auto-generated) — Mechanical summary built from extracted metadata: exports, route count, DB refs, import count. Regenerated on every scan. No judgment required.
- **`description`** (narrative, optional) — Plain-English explanation of what the file does and why it matters. Written by Claude during sessions when files are worked on. Preserved across re-scans.

When `--map` is queried, both are shown. The `description` gives quick orientation; `purpose` gives structural facts. Together they replace the need to read files just to understand a project's layout.

**Enriching descriptions during sessions:** When you edit a file that has no `description`, add one to the DIR file before the session ends. One sentence, written for someone with zero context. The wrapup re-scan preserves it.

## File Inclusion Rules

A file appears in the `files` map if it has 2+ connections (imports + imported-by count) or has a conversational alias.

### Connection Resolution Strategies

**Relative-path languages** (JS, TS, Python, CSS, Shell): Imports start with `.` or are bare specifiers. `scan.js` resolves the relative path to a file in the project. This is the original mechanism.

**Namespace-based languages** (C#, Java): Imports are namespace/package strings (e.g., `using MyApp.Models`, `import com.foo.bar.MyClass`). `scan.js` builds a namespace-to-files map from `extractNamespace()` and resolves imports against it. Three resolution levels:

1. **Direct namespace match** — `using Foo.Bar` matches all files in namespace `Foo.Bar`
2. **Prefix + type match** — `import com.foo.bar.MyClass` splits into namespace `com.foo.bar` + type `MyClass`, matches files exporting that type
3. **Static import fallback** — `import static com.foo.Bar.method` tries one level up: namespace `com.foo` + type `Bar`

External dependency imports (NuGet, Maven, etc.) silently produce 0 connections — correct behavior since they're not project files.

**Known gaps** (Go, Rust): Go uses directory-based packages; Rust derives module paths from the file tree and `mod` declarations. Neither is supported yet.

### Adding Namespace Support to New Extractors

When creating an extractor for a namespace-based language, add an optional `extractNamespace(filePath, content)` method that returns the namespace/package string or `null`. This method is NOT in `REQUIRED_METHODS` — it's checked at runtime via `typeof extractor.extractNamespace === 'function'`. Extractors without it work fine; their files just use relative-path resolution only.

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

**Current extractors:** JavaScript (`.js`, `.mjs`, `.cjs`), TypeScript (`.ts`, `.tsx`), Python (`.py`), Shell (`.sh`, `.bash`), CSS (`.css`), C# (`.cs`), Java (`.java`), Go (`.go`), Rust (`.rs`)

**Adding a new language:** Create `extractors/<language>.js` with the interface above. The registry auto-discovers it on next scan. No other files need editing.

## Scanner

Run manually: `node $PLUGIN_ROOT/hippocampus/scripts/scan.js`

**Auto-discovery:** Scans all directories in `/websites/` that contain code files. New projects are automatically detected — no registration needed. Projects with names that don't match their directory (e.g., `advenire.consulting` → `advenire-portal`) use `NAME_OVERRIDES` in scan.js.

Preserves existing aliases, `_dismissed` lists, and `description` fields across re-scans. The `purpose` field is regenerated each time from current metadata.

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
