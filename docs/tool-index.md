# Brain Tools

<!-- Source of truth: this file is resolved ($PLUGIN_ROOT → actual paths) and written to
     ~/.claude/rules/brain-tools.md by the session-start hook when this file changes.
     Edit here, not in the rules copy. -->

Spatial awareness and long-term memory for code navigation and project history. All commands run from your workspace directory.

**Default routing:** When you need to understand code — what files exist, what they do, what depends on what, what the schema looks like — route through these tools before falling back to Grep/Glob/Read. They return structured, token-efficient results built from indexed data. Standard tools are the fallback for queries brain tools don't cover (see "When Standard Tools Are Shorter" below).

## Hippocampus — Code Navigation (~150 tokens)

```
node $PLUGIN_ROOT/hippocampus/scripts/query.js <command>
```

| Command | What it does |
|---------|-------------|
| `--map <project> [path]` | **Check first** — project directory map showing what each file does |
| `--resolve <alias>` | Conversational name -> file path |
| `--blast-radius <file>` | What imports it, what it imports (term index — unmapped files won't resolve) |
| `--lookup <file>` | Exports, routes, db refs, sensitivity (dir file — mapped files only) |
| `--find <identifier>` | Code identifiers across all projects with line numbers. For arbitrary strings, use Grep. |
| `--structure <file>` | Function/class/interface/type/def definitions with line numbers (term index) |
| `--list-aliases` | Browse all conversational aliases |
| `--schema [--project p]` | Database table structures |

**Paths** are relative to project root — `lib/data-bus.js`, not `sonder-runtime/lib/data-bus.js`.

**Token-saving rule:** When the user asks you to work on a project you haven't touched this session, run `--map <project>` first. The map shows what every file does — both an auto-generated mechanical summary and an optional narrative description. This replaces reading multiple files just to get oriented. Only read individual files after the map tells you which ones matter.

**Alias triage** — after scans, unmapped files are surfaced. Dismiss or assign:
```
node $PLUGIN_ROOT/hippocampus/scripts/scan.js --dismiss <project> <file>
node $PLUGIN_ROOT/hippocampus/scripts/scan.js --undismiss <project> <file>
```

## Project Memory (~200-500 tokens)

Curated indexes for "when did we work on X?" and "what's the current state of X?"

- **Project files** — `~/.claude/projects/<workspace>/memory/projects/` — design decisions, dates, file locations
- **Archived conversations** — `~/.claude/projects/<workspace>/memory/archived-memories/conversations.md` — session summaries with dates

## Cerebral Cortex v2 — Multi-level Recall

Verbatim conversation recall — reasoning, rejected alternatives, the actual back-and-forth. Search results include decision digests so you can identify the right session before reading.

**Search** (~150 tokens, now with decision digests):
```
node $PLUGIN_ROOT/cerebral-cortex-v2/scripts/search.js "term1,term2" "term3" --limit 5
```
Terms within quotes are comma-separated OR (a cluster). Separate arguments are additive clusters — more matched = higher score. Results now show per-window decision summaries.

The `<session>` and `<seq>` arguments come from search results above. Search first, then drill into a specific window.

**Digest** (~200 tokens, database-only):
```
node $PLUGIN_ROOT/cerebral-cortex-v2/scripts/read-window.js <session> <seq> --digest
```

**Decision** (~500-1K tokens, scoped read):
```
node $PLUGIN_ROOT/cerebral-cortex-v2/scripts/read-window.js <session> <seq> --decision N
node $PLUGIN_ROOT/cerebral-cortex-v2/scripts/read-window.js <session> <seq> --decision N --why
```

**Read** (~6K tokens compact):
```
node $PLUGIN_ROOT/cerebral-cortex-v2/scripts/read-window.js <session> <seq> --focus <start>-<end>
```

**Drill** (variable):
```
node $PLUGIN_ROOT/cerebral-cortex-v2/scripts/read-window.js <session> <seq> --focus <start>-<end> --full
```

**Filter sharpening** — when reading CC2 digests or search results, flag noise terms (words that don't help identify what the decision was about):
```
node $PLUGIN_ROOT/cerebral-cortex-v2/scripts/stopword-candidates.js --noise "go,something,point"
node $PLUGIN_ROOT/cerebral-cortex-v2/scripts/stopword-candidates.js --relevant "burger"
node $PLUGIN_ROOT/cerebral-cortex-v2/scripts/stopword-candidates.js --demote "term"
node $PLUGIN_ROOT/cerebral-cortex-v2/scripts/stopword-candidates.js --list
```
Terms flagged as noise 5 times without a relevant hit are auto-promoted to the dynamic filter. A relevant hit resets the noise streak. Demote pulls a term back if search results degrade. Do this incrementally during normal CC2 usage — a few terms per session, not bulk.

## Hippocampus — Content Search (~variable tokens)

Project-aware search tools that return matches with surrounding context in one call. Use these **instead of Grep+Read cycles** — they save significant tokens by returning context inline, grouped by project.

### Grep (project-aware content search)

```
node $PLUGIN_ROOT/hippocampus/scripts/grep.js <pattern> [options]
```

Searches all files in all known project directories for a regex pattern. Returns matches with surrounding lines, grouped by project. Skips node_modules, .git, build artifacts, binaries.

| Option | What it does |
|--------|-------------|
| `--context N` / `-C N` | Lines of context around each match (default: 3) |
| `--project <name>` | Filter to one project (substring match) |
| `--max-per-file N` | Cap matches shown per file (default: 20) |

**When to use:** Any time you need "show me everywhere X appears and what the code is doing around it" — hardcoded URLs, config keys, API endpoint usage, security audits (`innerHTML`, `eval`), migration tracking. One command replaces dozens of Grep+Read cycles.

### Classify (pattern variant audit with direction detection)

```
node $PLUGIN_ROOT/hippocampus/scripts/classify.js --inline "label1=pattern1" "label2=pattern2" [options]
node $PLUGIN_ROOT/hippocampus/scripts/classify.js <config.json> [options]
```

Takes named regex variants and categorizes every match by which variant it uses. Each hit is tagged with a **direction** — whether the code is making a request `[client]`, defining a route `[server]`, setting a config value `[config]`, or just a reference `[reference]`. Shows percentage breakdown.

| Option | What it does |
|--------|-------------|
| `--project <name>` | Filter to one project |
| `--context N` / `-C N` | Lines of context per match (default: 1) |
| `--no-snippets` | Summary only, no code snippets |

Config file format for reusable audits:
```json
{
  "name": "Description",
  "variants": { "label1": "regex1", "label2": "regex2" },
  "exclude": ["tests/", "docs/"]
}
```

**When to use:** Migration audits ("how much code uses the old pattern vs new?"), convention checks ("are all API calls going through the right base path?"), routing analysis ("which files construct URLs to this service and how?").

## Hippocampus — Flow Graph (~100-300 tokens)

AST-based code intelligence — traces data flow, middleware chains, database access, and cross-project dependencies.

```
node $PLUGIN_ROOT/hippocampus/scripts/flow.js <command>
```

| Command | What it does |
|---------|-------------|
| `--trace <identifier> [--project P]` | Follow a value — where set, who reads it, what it calls |
| `--flow <file> --project P` | Everything flowing in/out of a file |
| `--notes <file:name> [--project P]` | Show annotations for a node |
| `--annotate <file:name> "note" [--project P]` | Add a note to a node |

**When to use:** When you need to understand data flow ("where does req.company come from?"), middleware ordering ("what runs before my route?"), database access ("what tables does this file touch?"), or cross-project dependencies ("what calls this API endpoint?").

## What Answers What

| Question | Tool |
|----------|------|
| "What calls this function?" | `--find <identifier>` |
| "What's the conversational name for X?" | `--resolve <alias>` |
| "What does this file export?" | `--lookup <file>` |
| "What depends on this?" | `--blast-radius <file>` |
| "What's the DB schema?" | `--schema` |
| "What functions are in this file?" | `--structure <file>` |
| "When did we work on X?" / "What's the state of X?" | Project memory files |
| "What was the reasoning behind X?" | Project memory for pointers, CC2 for detail |
| "What's in this project?" / "What does each file do?" | `--map <project>` |
| "What aliases exist?" | `--list-aliases` or `--list-projects` |
| "Where is this string/pattern used?" | `grep.js <pattern>` |
| "How much code uses pattern A vs B?" | `classify.js --inline "A=..." "B=..."` |
| "How does data flow through this file?" | `flow.js --flow <file> --project P` |
| "Where is this value set and who reads it?" | `flow.js --trace <identifier>` |
| "What middleware runs before my route?" | `flow.js --trace req.<property>` |
| "What tables does this file access?" | `flow.js --flow <file> --project P` |
| "What would break if I changed this?" | `flow.js --trace <function>` |

## When Standard Tools Are Shorter

- **"Does this path exist?" / "What's in this directory?"** -> `ls`
- **User gave a file path** -> `Read` it directly
- **User mentions a specific location** -> go there directly
- **Searching for a known string in 1-2 specific files** -> `Grep` (built-in is fine for narrow, targeted searches)

## Behavioral System

Managed via slash commands during sessions:
- `/dopamine` — flag a behavioral moment (positive or negative), stored as weighted lesson
- `/oxytocin` — flag a relational dynamic, stored as scored force

## Wrapup

```
node $PLUGIN_ROOT/scripts/wrapup-mechanical.js
```
Handles: hippocampus re-scan (auto-discovers new projects), term index update (JS, TS, Python, Shell, CSS), CC2 window scan + metadata extraction (decisions, summaries), PFC trim, prefrontal regeneration, PFC size marker.

## When Modifying Brain Files

Brain changes have two extra steps beyond normal code changes:

1. **Update the docs** — `$PLUGIN_ROOT/docs/` has per-region docs (cerebral-cortex.md, hippocampus.md, hypothalamus.md, prefrontal.md). If you changed behavior, added a flag, or altered a data flow, update the relevant doc before wrapup.

2. **Verify wiring** — New capabilities need to be connected to their consumers. Check:
   - Does the search CLI surface what the scoring engine computes?
   - Does the wrapup script call the new/moved script?
   - Does the session-start hook load what was added?
   - Do require paths still resolve after moves?
   - New language? Add an extractor in `hippocampus/extractors/` — auto-discovered, no other edits needed.
   - New project directory? Auto-discovered by scan. Only add `NAME_OVERRIDES` in scan.js if the directory name doesn't match the desired DIR name.

The recurring pattern: infrastructure gets built but the last-mile connection to the workflow that uses it gets missed. A quick "who calls this?" before closing catches it.

## Full Docs

`$PLUGIN_ROOT/docs/` — README, cerebral-cortex, hippocampus, hypothalamus, prefrontal.
