---
description: "Save current project state for next session"
---

Save current project state. Do all steps in order — do not ask to proceed, just execute.

1. **dlPFC gate** — Ask: "Should this session be logged to working memory (dlPFC)?" Remember the answer for step 6.

2. **Identify the project** — based on what was worked on in this conversation.

3. **Update project memory** — Read the relevant project file in `~/.claude/projects/<workspace>/memory/projects/`. Update: current state, where we left off, any new design decisions, new file locations. If no file exists, create one.

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
