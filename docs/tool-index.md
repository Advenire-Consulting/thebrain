# Brain Tools

Spatial awareness and long-term memory for code navigation and project history. All commands run from your workspace directory.

## Hippocampus — Code Navigation (~150 tokens)

```
node $PLUGIN_ROOT/hippocampus/scripts/query.js <command>
```

| Command | What it does |
|---------|-------------|
| `--resolve <alias>` | Conversational name -> file path |
| `--blast-radius <file>` | What imports it, what it imports |
| `--lookup <file>` | Exports, routes, db refs, sensitivity |
| `--find <identifier>` | Every occurrence across all projects with line numbers (JS, TS, Python, Shell, CSS) |
| `--structure <file>` | Function/class/interface/type/def definitions with line numbers |
| `--list-aliases` | Browse all conversational aliases |
| `--schema [--project p]` | Database table structures |

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
| "What's in this project?" | `--list-aliases` or `--list-projects` |

## When Standard Tools Are Shorter

- **"Does this path exist?" / "What's in this directory?"** -> `ls`
- **User gave a file path** -> `Read` it directly
- **User mentions a specific location** -> go there directly
- **Searching for a string pattern across files** -> `Grep`

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
