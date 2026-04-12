---
description: "Session greeting — restore recent context from short-term recall"
---

New session greeting. Lightweight context restore from short-term recall.

Brain rules and behavioral data are already loaded by session start hooks — this command focuses on *what happened recently* so you can pick up naturally.

1. **Check brain-loaded marker** — Look for `<!-- brain-loaded -->` in system reminders. If present, skip to step 2. If missing (hook failed), read `~/.claude/brain/prefrontal-live.md` to restore behavioral rules and relational forces.

2. **Check if `prefrontal-cortex.md` is loaded** — Look in system reminders for recent session entries (format: `## YYYY-MM-DD HH:MM — scope [SESSION_ID]`). If not present, read `~/.claude/brain/prefrontal-cortex.md`.

3. **Internalize recent sessions** — `prefrontal-cortex.md` retains the last 3 session entries in this format:
   ```
   ## YYYY-MM-DD HH:MM — scope [SESSION_ID]
   Files: file1.js, file2.js
   Summary: One-line description
   ```
   Internalize what was worked on. Note the `[SESSION_ID]` for each — if deeper context is needed later, search long-term recall via CC2. Results include focus line ranges for targeted JSONL reading.

4. **Don't** preload conversation data. The PFC entries are the summary. Only search CC2 if the user asks about something specific or you need more context mid-task.

5. **dlPFC working memory** — First check whether the dlPFC region is enabled. Read `~/.claude/brain/config.json` and look at `regions.dlpfc`. If it is `false` (or `{ "enabled": false }`), skip this step entirely — do not read `dlpfc-live.md`, do not mention it. If it is `true`, omitted, or `{ "enabled": true }`, proceed:
   - Check if `~/.claude/brain/dlpfc-live.md` exists by reading it. If it has content:
     - Mention what's there: "Working memory available for [project(s)] — [N] hot files tracked."
     - Ask: "Want me to load it for this session?"
     - If yes, read the file and internalize the context.
     - If no, skip — zero tokens spent on it.
   - If the file doesn't exist or is empty, skip silently.

   (Note: this config check is a temporary measure. The proper fix is to make commands config-aware via a build step the way `brain-tools.md` is regenerated at session start.)

6. Greet briefly. Mention what the recent sessions touched (scope + summary) so the user knows you're oriented. Ask what they'd like to work on.
