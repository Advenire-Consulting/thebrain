# Brain System Map

Complete reference of how brain code (`$PLUGIN_ROOT/`) relates to brain data (`~/.claude/brain/`). Updated 2026-03-26.

## Architecture Overview

```
CODE ($PLUGIN_ROOT/)          DATA (~/.claude/brain/)
─────────────────────────────           ──────────────────────
hippocampus/                    ──►     hippocampus/
  lib/dir-loader.js             reads     *.dir.json (9 projects)
  lib/term-db.js                reads     terms.db (47MB)
  lib/term-scanner.js           writes    terms.db
  lib/extractor.js              writes    *.dir.json
  scripts/scan.js               writes    *.dir.json
  scripts/term-scan-cli.js      writes    terms.db
  scripts/query.js              reads     *.dir.json, terms.db
  scripts/link-recall.js        ORPHANED  (reads CC1 recall.db)

hypothalamus/                   ──►     hippocampus/ (read-only)
  lib/classifier.js             reads     *.dir.json (via dir-loader)
  lib/config.js                 reads     hypothalamus-config.json (optional, doesn't exist yet)

cerebral-cortex-v2/             ──►     (own data, + reads hippocampus)
  lib/db.js                     reads/writes  cc2/recall.db (18MB)
  lib/extractor.js              reads     hippocampus/*.dir.json (via dir-loader)
  lib/search.js                 reads     hippocampus/*.dir.json (via dir-loader)
  lib/decision-detector.js      reads     JSONL transcripts
  lib/scanner.js                reads     JSONL transcripts → cc2/windows.json
  lib/stopwords.js              reads     cc2/recall.db (dynamic stopwords)
  scripts/pfc-trim.js           reads/writes  prefrontal-cortex.md, cc2/recall.db

dlpfc/                          ──►     working-memory.db, dlpfc-live.md
  lib/db.js                     reads/writes  working-memory.db
  lib/tracker.js                reads/writes  working-memory.db (via db.js)
  lib/generator.js              reads     working-memory.db → writes dlpfc-live.md
  hooks/read-hook.js            writes    working-memory.db (PreToolUse Read)
  scripts/wrapup-step.js        reads/writes  working-memory.db, reads cc2/recall.db

scripts/                        ──►     signals.db, prefrontal-live.md
  generate-prefrontal.js        reads     signals.db → writes prefrontal-live.md
  lessons.js                    reads/writes  signals.db
  seed-signals.js               writes    signals.db

hooks/                          ──►     (runtime wiring)
  session-start.js              reads     signals.db, prefrontal-live.md, tool-index.md, dlpfc-live.md
  hypothalamus_hook.js          reads     hippocampus/*.dir.json (via classifier)
  post-edit-hook.js             writes    hippocampus/terms.db (incremental), working-memory.db (dlPFC bump)

scripts/wrapup-mechanical.js    ──►     (orchestrator — calls everything including dlPFC)
```

## Data Files

### ~/.claude/brain/

| File | Size | Read by | Written by | Rebuildable? |
|------|------|---------|------------|-------------|
| `hippocampus/*.dir.json` (9) | ~108K total | hypothalamus, CC2 search, CC2 extractor, query.js | hippocampus/scan.js | Yes — scan.js regenerates from codebase |
| `hippocampus/terms.db` | 47MB | query.js (--find, --structure) | term-scan-cli.js, post-edit-hook.js | Yes — term-scan-cli.js rebuilds from codebase |
| `signals.db` | 1.3MB | generate-prefrontal.js, session-start hook | lessons.js, seed-signals.js | **No** — accumulated behavioral lessons |
| `prefrontal-cortex.md` | ~2K | /hello, /continue, pfc-trim.js, session-start hook | /wrapup (Claude writes entries) | No — session summaries written by Claude |
| `prefrontal-live.md` | ~9K | session-start hook (loaded into context) | generate-prefrontal.js | Yes — generated from signals.db |
| `working-memory.db` | ~small | dlpfc/generator.js, session-start hook | dlpfc hooks, dlpfc/wrapup-step.js | **Partially** — context_notes are Claude-authored, not rebuildable |
| `dlpfc-live.md` | ~1K | session-start hook (loaded into context) | dlpfc/generator.js | Yes — generated from working-memory.db |
| `.pfc-loaded-size` | 4B | /hello, /continue (skip-read check) | session-start hook, wrapup-mechanical.js | Yes — just a byte count |

### $PLUGIN_ROOT/cerebral-cortex-v2/

| File | Size | Read by | Written by | Rebuildable? |
|------|------|---------|------------|-------------|
| `windows.json` | 75K | extract.js, search.js, read-window.js | scan.js | Yes — scan.js rebuilds from JSONL |
| `recall.db` | 18MB | search.js, read-window.js, stopwords.js | extract.js, pfc-trim.js | Mostly — scan+extract rebuilds all except `stopword_candidates` and Claude summaries |

### JSONL transcripts (source data, not brain-owned)

| Location | What | Touched by |
|----------|------|-----------|
| `~/.claude/projects/<workspace-encoded-path>/*.jsonl` | Session transcripts | CC2 scanner reads, CC2 read-window reads |

## Orphaned / Archived

| File | Status | Notes |
|------|--------|-------|
| `~/.claude/brain/recall.db` (118MB) | **ORPHANED** | CC1 conversation store. Nothing references it. Archive to `brain/archived/`. |
| `~/.claude/brain/hippocampus.md` (191B) | **ORPHANED** | Old single-file hippocampus. Replaced by `hippocampus/*.dir.json`. |
| `~/.claude/brain/limbic.md` (8.6K) | **ORPHANED** | Old limbic forces file. Folded into `signals.db` + generated `prefrontal-live.md`. |
| `hippocampus/scripts/link-recall.js` | **ORPHANED** | Queries CC1 `cerebral-cortex/recall.db` schema (chunks, sessions, file_refs). CC2 uses different schema. |
| `hypothalamus-config.json` | **UNUSED** | config.js looks for it but falls back to defaults. File has never been created. |

## Cross-Region Dependencies

```
                    ┌─────────────────┐
                    │   signals.db    │
                    │ (lessons+forces)│
                    └───────┬─────────┘
                            │ read
                    ┌───────▼─────────┐
                    │ generate-       │
                    │ prefrontal.py   │
                    └───────┬─────────┘
                            │ write
                    ┌───────▼─────────┐
                    │prefrontal-live.md│◄── session-start hook loads into context
                    └─────────────────┘

┌──────────────┐    ┌─────────────────┐    ┌──────────────────┐
│  *.dir.json  │───►│  hypothalamus   │    │  CC2 recall.db   │
│ (hippocampus)│    │  (blast radius) │    │  (search index)  │
│              │───►│                 │    │                  │
└──────┬───────┘    └─────────────────┘    └────────┬─────────┘
       │                                            │
       │ read                                       │ read
       │            ┌─────────────────┐             │
       └───────────►│   CC2 search    │◄────────────┘
                    │   CC2 extract   │
                    └────────┬────────┘
                             │ read
                    ┌────────▼────────┐
                    │ JSONL transcripts│
                    │ (session files)  │
                    └─────────────────┘

┌──────────────┐
│  terms.db    │◄── post-edit-hook (incremental)
│ (hippocampus)│◄── term-scan-cli (full rebuild)
│              │──► query.js --find, --structure
└──────────────┘

┌──────────────────┐    ┌─────────────────┐
│prefrontal-cortex │───►│   pfc-trim.js   │───► CC2 recall.db
│     .md          │    │ (migrates old   │     (window_summaries)
│ (Claude writes)  │    │  entries to CC2) │
└──────────────────┘    └─────────────────┘
```

## Hooks (Runtime Event Flow)

### SessionStart (startup, resume, compact, clear)
1. Check if `signals.db` is newer than `prefrontal-live.md` → regenerate if stale
2. Record `prefrontal-cortex.md` byte size to `.pfc-loaded-size`
3. Emit `prefrontal-live.md` + `tool-index.md` as context → Claude loads behavioral rules

### PreToolUse (Edit, Write, MultiEdit, Bash)
1. **Edit/Write/MultiEdit:** Extract file path → load DIR files → classify sensitivity + count dependents → warn/block
2. **Bash:** Extract paths from command → classify against hippocampus map → warn on sensitive paths

### PostToolUse (Edit, Write, MultiEdit)
1. Identify which project the edited file belongs to (via DIR files)
2. Re-scan that single file into `terms.db` (incremental update)
3. Bump file_heat score in working-memory.db (+1.0 for edits)

### PreToolUse (Read) — dlPFC only
1. Extract file_path from tool input
2. Resolve project via hippocampus DIR files
3. Bump file_heat score in working-memory.db (+0.3 for reads)

## Wrapup Flow (wrapup-mechanical.js)

```
Step 0a: hippocampus/scan.js       → *.dir.json (full rebuild, ~5s)
Step 0b: hippocampus/term-scan-cli  → terms.db (incremental)
Step 0c: cc2/scan.js               → windows.json (find new windows)
Step 0c: cc2/extract.js            → recall.db (terms, files, projects, decisions, summaries)
Step 0d: dlpfc/wrapup-step.js      → working-memory.db (reconcile, decay), dlpfc-live.md (generate)
Step 1:  cc2/pfc-trim.js           → prefrontal-cortex.md (keep 3, migrate overflow to recall.db)
Step 2:  generate-prefrontal.js    → prefrontal-live.md (from signals.db)
Step 3:  Update .pfc-loaded-size   → size marker for skip-read optimization
```

## Slash Commands and Their Brain Touchpoints

| Command | Reads | Writes |
|---------|-------|--------|
| `/hello` | prefrontal-cortex.md, .pfc-loaded-size, dlpfc-live.md | — |
| `/wrapup` | project memory files | prefrontal-cortex.md, project memory, working-memory.db (context notes), then calls wrapup-mechanical.js |
| `/continue` | prefrontal-cortex.md, project memory | prefrontal-cortex.md, project memory, working-memory.db (context notes) |
| `/dopamine` | signals.db (surface existing lessons) | signals.db (insert/reinforce lesson) |
| `/oxytocin` | signals.db (surface existing forces) | signals.db (insert/reinforce force) |
| `/db-backup` | — | ~/backups/thebrain/ (copies of signals.db, terms.db, DIR files, cc2 recall.db, working-memory.db) |

## Backup Strategy

| Data | Backed up by | Location | Notes |
|------|-------------|----------|-------|
| `signals.db` | /db-backup | `~/backups/thebrain/` | **Critical — not rebuildable** |
| `terms.db` | /db-backup | `~/backups/thebrain/` | Rebuildable but slow (~47MB) |
| `*.dir.json` | /db-backup | `~/backups/thebrain/hippocampus-$TS/` | Rebuildable via scan.js |
| CC2 `recall.db` | /db-backup | `~/backups/thebrain/` | Mostly rebuildable; stopword_candidates + Claude summaries are not |
| `prefrontal-cortex.md` | /db-backup | `~/backups/thebrain/` | Not rebuildable — Claude-written session entries |
| `prefrontal-live.md` | /db-backup | `~/backups/thebrain/` | Rebuildable from signals.db |
| `working-memory.db` | /db-backup | `~/backups/thebrain/` | **Partially rebuildable** — context_notes are Claude-authored |
| `dlpfc-live.md` | /db-backup | `~/backups/thebrain/` | Rebuildable from working-memory.db |

## Git Tracking

**Tracked (code):** All `.js`, `.py`, `.sh`, `.md` files in `$PLUGIN_ROOT/`
**Tracked (data):** `windows.json` (small, diffable JSON)
**Not tracked:** All `*.db` files, `.pfc-loaded-size`, session state files — covered by /db-backup
