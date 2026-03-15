# Cerebral Cortex v2

Long-term conversation recall. Indexes Claude Code session transcripts into searchable windows with term heatmaps, file references, and project frequencies.

## What It Does

1. **Scans** session transcripts (`.jsonl` files) and maps context windows (session start → compact boundary → ... → session end)
2. **Extracts** metadata per window: dual term heatmaps (user + assistant), file references with line numbers, project frequencies from tool call paths
3. **Detects decisions** within each window using the Read→discussion→Write/Edit heuristic, storing decision markers with terms, file anchors, and status
4. **Searches** past conversations by cluster-scored queries with trust decay, showing per-window decision digests in results
5. **Reads** window content at multiple zoom levels: digest (decisions only, ~200 tokens), decision-scoped (single decision block), compact (full conversation minus tools), full
6. **Pairs** PFC session summaries to windows when entries are trimmed from short-term recall. Mechanical summaries fill the gap for windows without PFC entries.

## Key Files

| File | Purpose |
|------|---------|
| `lib/scanner.js` | Single-pass JSONL reader — detects compact boundaries, builds window index |
| `lib/db.js` | RecallDB class — SQLite schema for windows, terms, files, projects, summaries |
| `lib/extractor.js` | Reads JSONL line ranges, extracts terms + file refs + project frequencies |
| `lib/decision-detector.js` | Detects decision blocks: Read→discussion→Write/Edit pattern, parked topics, compaction seam linking |
| `lib/search.js` | Cluster-scored search with trust decay, project/file boost, focus ranges |
| `lib/stopwords.js` | Tokenizer + 3-tier stopword filter (light/medium/heavy) |
| `windows.json` | Window index — 228 windows across 149 sessions |
| `recall.db` | Extracted metadata — 257K terms, 3.5K file refs, 9 projects |

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/search.js` | Search CLI — `node search.js "term1,term2" "term3" --limit 5` |
| `scripts/read-window.js` | Window reader — compact, digest, or decision-scoped reads |
| `scripts/scan.js` | Rebuild `windows.json` from all JSONL files |
| `scripts/extract.js` | Rebuild `recall.db` metadata + decisions + summaries from windows + JSONL files |

## Search

Each argument is a **cluster** of related terms (comma-separated OR). Clusters are additive — more matched = higher score.

Scoring: `(clusterScoreSum + projectBoost + fileBoost) × trustDecay`

- **Project boost:** hippocampus alias resolution maps query terms to projects. Frequency-weighted.
- **File boost:** direct file path matches in the window.
- **Trust decay:** `1 / (1 + daysSince × 0.1)` from configurable anchor time.
- **Focus range:** min/max line numbers of matching terms + files — narrows where to read.

### Search Output

Results include project and file metadata from `recall.db`:

```
b3286cbe... seq 1 | score 150.35
Time: 2026-03-01T20:29:55.633Z to 2026-03-01T21:32:14.791Z
Projects: advenire-portal (32)
Files: toolLoader.js, portal-server.js, portal.css, portal.js, dashboard.html
Lines: 647-1107 | Focus: 647-1074
```

**Noise filtering (default):** Only shows files with extensions that fall under matched project roots (from hippocampus DIR files). Excludes `CLAUDE.md`, memory files, command files, and bare directory names.

**`--verbose` flag:** Shows all files including directories, for deep recall when the filtered view isn't enough.

## Read Window

Four read modes, from cheapest to most expensive:

| Mode | Flag | Tokens | What it reads |
|------|------|--------|---------------|
| Digest | `--digest` | ~200 | Database only. Lists all decisions with line ranges. No JSONL. |
| Decision | `--decision N` | ~500-1K | JSONL for one decision block only. |
| Decision + reasoning | `--decision N --why` | ~1-3K | Expands backward to previous decision boundary. |
| Compact | (default) | ~6K+ | Full window. User messages full, Claude first response kept, consecutive assistant blocks collapsed. |
| Full | `--full` | ~10K+ | All user + assistant text, tool blocks still stripped. |

**Intended workflow:** Search → pick session → `--digest` to see decisions → `--decision N` to read just what you need.

## Decision Detection

Decisions are detected at extract time by walking JSONL for the pattern:

1. **Read/Grep/Glob** on file X → exploration
2. **User/Claude back-and-forth** → discussion
3. **Write/Edit** on file X (or same directory) → decision anchor

Each detected decision stores: line range, terms (from user messages), file anchors (from Write/Edit), and status:
- **decided** — has Write/Edit file anchors
- **parked** — discussed but no file changes
- **continued** — thread continues past a compaction boundary (linked to next window's seq)

### Compaction Seam Linking

After extraction, adjacent windows in the same session are checked. If the last decision in seq N shares file anchors or 2+ terms with the first decision in seq N+1, they're linked via `continues_to_session` / `continues_to_seq`.

### Summary Layering

Every window gets a **mechanical summary** from its decision markers (terms + file names). When PFC trim runs, it **overwrites** with Claude-written summaries for windows that have PFC entries. The mechanical version is the floor; the PFC version is the upgrade.

## Summary Pairing

When PFC has >3 entries, `index-all.js` migrates overflow entries to CC2's `window_summaries` table, matched by session ID prefix + HH:MM timestamp proximity. Timezone-aware (PFC uses local time, windows use UTC).

## Dynamic Stopword Filter

Decision term quality improves over time via a self-sharpening filter. During CC2 search/digest usage, noise terms are flagged. After 5 noise flags without a relevant hit, a term is auto-promoted to the dynamic filter and excluded from future tokenization.

- **Storage:** `stopword_candidates` table in `recall.db` — tracks noise/relevant counts and promotion status
- **Application:** `filterMedium()` in `stopwords.js` loads promoted terms on first call, cached for the process lifetime
- **Protection:** A relevant hit resets the noise count and removes promotion. Demote manually via CLI if search results degrade.
- **Force-safe:** `--force` re-extraction preserves Claude-written summaries (detected by non-null `next` field)

### Contraction Expansion

The tokenizer expands contractions before splitting ("we've" → "we have", "I'll" → "I will"). This prevents orphaned fragments ("ve", "ll", "hasn") from polluting term lists. The expansion map covers standard English contractions including curly apostrophes.

## Database Schema

- **windows** — session_id, seq, start/end line/time
- **window_decisions** — seq, start/end line, summary, terms (JSON), file_anchors (JSON), status, continues_to_session/seq
- **window_summaries** — scope, summary, files, next (mechanical from decisions, overwritten by PFC entries)
- **window_projects** — project name, frequency per window
- **window_files** — file path, tool name, line numbers per window
- **window_terms** — term, source (user/assistant), count, line numbers per window
- **stopword_candidates** — term, noise_count, relevant_count, promoted flag, last_seen
