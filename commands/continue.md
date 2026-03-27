---
description: "Context preservation and restoration — save state, restore after compaction, or resume a project"
---

Context preservation and restoration. Use before compaction, after compaction, or to pick up a project.

## Usage

- `/continue save` — save current state before compaction
- `/continue` — restore context after compaction
- `/continue <project>` — pick up a specific project in a new session
- `/continue workspace` — full workspace-level resume

---

## `/continue save` — Save Current State

Captures project state for pickup later — whether after compaction, next session, or switching projects.

1. **dlPFC gate** — Ask: "Should this session be logged to working memory (dlPFC)?" Remember the answer for step 7.
2. **Identify the project** — based on what we worked on in this conversation.
3. **Update project memory** — Read the relevant project file in the workspace's `~/.claude/projects/<workspace>/memory/projects/` directory, update: current state, where we left off, any new design decisions, new file locations. If no file exists, create one.
4. **Update MEMORY.md index** — Update the Status column in the Projects table if it changed.
5. **Append to prefrontal cortex** — Append an entry to `~/.claude/brain/prefrontal-cortex.md` using this exact format (the CC2 indexer pairs entries to conversation windows on trim):
   ```
   ## YYYY-MM-DD HH:MM — project-or-scope [SESSION_ID]
   Files: file1.js, file2.js
   Summary: One-line description of what was done
   Next: Where we left off / what's pending
   ```
   Use the current date and time (YYYY-MM-DD HH:MM in 24h) and the project/scope from step 1. For `SESSION_ID`, find the most recent JSONL file across all conversation directories listed in `~/.claude/brain/config.json`, then take the first 8 characters of its filename. The indexer keeps the last 3 entries and clears older ones after ingestion.
5b. **Update queued plans** — Read `~/.claude/brain/queued-plans.md`. If this session's `Next:` references a plan doc, add it if missing. If this session completed a queued item, check it off (`- [x]`). Remove checked items older than 2 sessions.
5c. **Update DIR file if needed** — If a new conversational alias was used this session (user named a system/flow for the first time), append it to the relevant DIR file at `~/.claude/brain/hippocampus/<project>.dir.json`. Most sessions: skip silently.
5d. **Enrich file descriptions** — Run `node $PLUGIN_ROOT/hippocampus/scripts/undescribed.js <project>` (scoped to the project you worked on). For each file listed that you edited or read in depth this session, add a `description` field to the DIR file entry — one sentence, plain language, for someone with zero context. Skip files you don't have context for; they'll get described in future sessions. If all files already have descriptions, skip silently.
6. **dlPFC enrichment (if opted in at step 1)** — For each file you touched this session, write or update the `context_note` and `summary` in working memory:
   ```bash
   node -e "
   const { WorkingMemoryDB } = require('$PLUGIN_ROOT/dlpfc/lib/db');
   const db = new WorkingMemoryDB();
   db.updateContextNote('PROJECT', 'FILE_PATH', 'CONTEXT NOTE HERE');
   db.updateSummary('PROJECT', 'FILE_PATH', 'SUMMARY HERE');
   db.close();
   "
   ```
   Write context notes from your session knowledge — what you were doing with the file and why. One line, ~15-20 words. Only update summary if it's missing or stale. Skip files whose context note is still accurate.
7. **Run mechanical wrapup** — `node $PLUGIN_ROOT/scripts/wrapup-mechanical.js`. Handles: hippocampus scan, term index, CC2 indexing, dlPFC decay + generation, PFC trim, prefrontal regeneration, PFC size marker.
8. **Show the user** what you're updating before writing it.
9. **Confirm** — Tell the user what was saved. If there are code changes, remind them to commit.

---

## `/continue` (no argument) — Post-Compaction Restore

Restores context after compaction within the same session. Brain rules and MEMORY.md are already loaded from session start — don't re-read them.

1. Check for `<!-- brain-loaded -->` in system reminders. If present, skip to step 2. If missing, follow the full restore (read MEMORY.md, prefrontal-live.md).
2. **Check if PFC has changed** — Run: `current=$(wc -c < ~/.claude/brain/prefrontal-cortex.md 2>/dev/null | tr -d ' ' || echo 0); loaded=$(cat ~/.claude/brain/.pfc-loaded-size 2>/dev/null || echo 0); [ "$current" != "$loaded" ] && echo "CHANGED" || echo "UNCHANGED"`. If `UNCHANGED`, the PFC content from session start is still current — skip reading it. If `CHANGED` (e.g., wrapup added an entry before compaction), read `~/.claude/brain/prefrontal-cortex.md` for updated short-term recall.
3. Confirm in a sentence or two that you're re-grounded. Don't summarize the files back.

---

## `/continue <project>` — Project Resume

Pick up a specific recurring project.

1. Read the project index table in the current workspace's MEMORY.md
2. **Fuzzy match** the argument against project names. Be loose — "terminal" matches "Terminal Core", "advenire" matches "Advenire Portal", etc. If the same name exists in multiple workspaces (check `~/.claude/brain/config.json`), ask which one.
3. Read the matched project's memory file (follow the link in the table)
4. **Catch up the spatial map** — Run `bash $PLUGIN_ROOT/scripts/wrapup-mechanical.sh` to re-scan hippocampus DIR files and reindex conversations. Check the `Next:` line in `~/.claude/brain/prefrontal-cortex.md` for where we left off.
5. **Search recent context** — Use CC2 search to surface recent windows for the project:
   `node $PLUGIN_ROOT/cerebral-cortex-v2/scripts/search.js "<project-name>" --limit 5`.
   Show the user: "Recent activity on [project]:" followed by the top results (date + time range).
7. Give a concise summary:
   - What this project is
   - Where we left off
   - Open questions or next steps
   - Suggest what to work on, or ask what the user wants to focus on

---

## `/continue workspace` — Full Workspace Resume

For returning to a messy in-progress workspace, not a specific project.

1. Check for any active plan files in `~/.claude/plans/` — read the most recent one if it exists
2. Run `git log --oneline -10` to see recent work
3. Run `git status` to see any in-progress changes
4. Read the MEMORY.md file for this project from the auto memory directory
5. Check for any TODO or REFACTOR plan files in the project root

Then give a concise summary:
- What was being worked on last
- What's currently modified but not committed
- Any active plans or next steps documented
- Suggested next action to continue the work
