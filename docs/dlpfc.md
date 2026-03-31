# dlPFC — Working Memory

The dorsolateral prefrontal cortex (dlPFC) region tracks which files are actively relevant across sessions and generates compact context summaries. It bridges the gap between hippocampus (structural map) and CC2 (conversation recall) by maintaining a live, decaying map of file relevance.

## Purpose

Long-running projects touch the same hub files session after session. Without working memory, each session starts cold — re-reading files to rebuild understanding. The dlPFC carries forward per-file context notes so hot files don't need re-reading.

## Data Model

**Database:** `~/.claude/brain/working-memory.db`

### file_heat

Tracks per-file relevance with exponential decay scoring.

| Column | Type | Description |
|--------|------|-------------|
| project | TEXT | Project name (resolved from hippocampus DIR roots) |
| file_path | TEXT | Path relative to project root |
| score | REAL | Decay score — bumped on touch, decayed 0.8x per wrapup |
| touch_count | INTEGER | Lifetime touch counter (never decays) |
| last_session | TEXT | Session ID of most recent touch |
| summary | TEXT | Stable description — seeded from DIR purpose line |
| context_note | TEXT | Volatile — why this file matters in current work |

### clusters

Tracks files that co-occur across sessions.

| Column | Type | Description |
|--------|------|-------------|
| project | TEXT | Project name |
| file_paths | TEXT | JSON array of file paths, always sorted alphabetically |
| co_occurrence_count | INTEGER | Number of sessions the pair co-occurred in |

## Touch Weights

| Event | Weight | Source |
|-------|--------|--------|
| Edit/Write/MultiEdit | +1.0 | PostToolUse hook (`post-edit-hook.js`) |
| Read | +0.3 | PreToolUse hook (`dlpfc/hooks/read-hook.js`) |
| Referenced in conversation | +0.5 | Wrapup reconciliation (cross-refs CC2 `window_files`) |

## Decay Math

All scores multiplied by **0.8** at each dlPFC-active wrapup. Decay only runs when the user opts in.

| Scenario | Equilibrium score | Sessions to cool below 1.0 |
|----------|------------------|---------------------------|
| Touched once | 1.0 | 1 |
| Touched across 3 sessions | ~1.95 | ~3 after last touch |
| Touched 10+ sessions | ~4.0 | ~7 after last touch |

## Degradation Tiers

| Tier | Score | Loaded at session start |
|------|-------|------------------------|
| Hot | > 2.0 | `summary` + `context_note` |
| Warm | 1.0–2.0 | `summary` only |
| Cold | < 1.0 | Nothing — falls back to hippocampus/CC2 |

## Generated Output

`~/.claude/brain/dlpfc-live.md` — generated at wrapup, loaded at session start.

```
## Working Memory — {project}
{file_path} [{score}] — {summary}
  > {context_note}
  clusters: {file_a, file_b}
```

Caps: 15 files per project, 3 clusters per project. Target: ~200-400 tokens per active project.

## Opt-In Gates

- **Hello/continue:** If hot entries exist, asks "Want to load the dlPFC working memory?"
- **Wrapup:** First question: "Should this session be logged to working memory (dlPFC)?"

No other user interaction. Decay only runs on opted-in wrapups.

## Git Re-engagement Briefing

When a cold file (score < 1.0) is re-engaged by a Read or Edit, the hook checks git for changes since `last_touched_at`. If commits exist, a one-line summary is emitted to stderr — visible in the conversation as a system note.

- **Not persisted** — the briefing is ephemeral, consumed once per session
- **Deduped per session** — each file briefed at most once via `git_briefing_state_<session>.json`
- **Git-aware** — skips silently if the project root is not a git repo
- **No dlpfc-live.md changes** — the generated file is unaffected

## File Inventory

| File | Purpose |
|------|---------|
| `dlpfc/lib/db.js` | Schema, CRUD for file_heat and clusters |
| `dlpfc/lib/tracker.js` | Score bumping, decay math, cluster detection, re-engagement detection |
| `dlpfc/lib/git-briefing.js` | Git change check + session dedup for re-engagement briefings |
| `dlpfc/lib/generator.js` | Produces `dlpfc-live.md` from DB |
| `dlpfc/hooks/read-hook.js` | PreToolUse hook — bumps score on Read |
| `dlpfc/scripts/wrapup-step.js` | Wrapup orchestrator — reconciliation, decay, generation |

## Wrapup Pipeline

When opted in, runs after CC2 extraction and before PFC trim:

1. **Reconciliation** — cross-ref CC2 `window_files` for referenced but untouched files
2. **Context enrichment** — Claude writes `context_note` per file from session knowledge (in wrapup skill, not script)
3. **Decay** — multiply all scores by 0.8
4. **Cluster detection** — pair co-occurrence counting
5. **Generation** — write `dlpfc-live.md`

## Backup

`working-memory.db` is **not fully rebuildable** — `context_note` values are Claude-authored. Add to backup scope alongside signals.db and recall.db.
