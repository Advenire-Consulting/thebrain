---
description: "Save current project state for next session"
---

Save current project state. Do all steps in order — do not ask to proceed, just execute.

**`$PLUGIN_ROOT` resolution:** Read the first line of `~/.claude/rules/brain-tools.md` — it contains `<!-- PLUGIN_ROOT: /path/to/thebrain -->`. Use that path wherever `$PLUGIN_ROOT` appears below.

1. **dlPFC gate** — Check if dlPFC is enabled: `node -e "const{isRegionEnabled}=require('$PLUGIN_ROOT/lib/config');console.log(isRegionEnabled('dlpfc'))"`. If `false`, skip step 6 silently (do not ask, do not mention it). If `true`, proceed with step 6 later.

2. **Identify what was worked on** — Distinguish between a **project** (a codebase with its own directory — ongoing, has state worth tracking across sessions) and a **task** (work done within a project — a bug fix, audit, migration, feature). A task belongs in its parent project's memory, not its own file.

3. **Update project memory** — Read the relevant project file in `~/.claude/projects/<workspace>/memory/projects/`.

   Project memory files are **thin current-state snapshots**, not session logs. They answer "where are we right now?" — not "what happened in each session?" Session history lives in CC2 (conversation recall) and should NOT be written here.

   A project memory file should contain:
   - **Current state** — what's in progress, what's uncommitted, what's blocked. Replace (not append to) the previous current state.
   - **What's next** — where the next session picks up.
   - **Key decisions still load-bearing** — only decisions that actively guide upcoming work. Decisions behind completed/shipped work belong in the project's own CLAUDE.md or are recoverable via CC2.

   Do NOT:
   - Append detailed session logs (bugs found, implementation details, task-by-task execution notes)
   - Stack dated "Current State" sections — there is only ONE current state, overwrite the old one
   - Duplicate information that's in the project's CLAUDE.md (stack, key files, design conventions)
   - Write history that CC2 already captured from the conversation

   If this session produced convention/reference material (architectural patterns, file locations, naming standards), that belongs in the project's own CLAUDE.md (`<project-dir>/CLAUDE.md`), not in the memory file.

   If work maps to an existing project — update that file per the rules above.
   If work was a task within a project — update the parent project's file. Do not create a new file.
   If ambiguous — ask the user: "Does [X] belong in [project]'s memory, or is this its own project?"
   Only create a new project memory file if the user confirms it's a genuinely new project.

4. **Update MEMORY.md index** — Update the Projects list if it changed.

5. **Append to prefrontal cortex** — Append an entry to `~/.claude/brain/prefrontal-cortex.md`:
   ```
   ## YYYY-MM-DD HH:MM — project-or-scope [SESSION_ID]
   Files: file1.js, file2.js
   Summary: One-line description of what was done
   Next: Where we left off / what's pending
   ```
   **REQUIRED: Get the real time by running `date '+%Y-%m-%d %H:%M'` — do NOT guess or estimate the timestamp.** Use that output as the `YYYY-MM-DD HH:MM` value. For `SESSION_ID`, run `node $PLUGIN_ROOT/scripts/session-id.js`.

5b. **Update queued plans** — Read `~/.claude/brain/queued-plans.md`. If this session's `Next:` references a plan doc, add it if missing. If this session completed a queued item, check it off (`- [x]`). Remove checked items older than 2 sessions.

5c. **Update DIR file if needed** — If a new conversational alias was used this session, append it to `~/.claude/brain/hippocampus/<project>.dir.json`. Most sessions: skip silently.

5d. **Enrich file descriptions** — Run `node $PLUGIN_ROOT/hippocampus/scripts/undescribed.js <project>`. For each file listed that you edited or read in depth this session, add a description using:
   ```bash
   node $PLUGIN_ROOT/hippocampus/scripts/describe.js <project> <file-path> "description text"
   ```
   One sentence, plain language. Skip files you don't have context for.

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

8. **Confirm** — Tell the user what was saved. If there are code changes, remind them to commit.
