---
description: "Session greeting — restore recent context from short-term recall"
---

New session greeting. Lightweight context restore from short-term recall.

Brain rules and behavioral data are already loaded by session start hooks — this command focuses on *what happened recently* so you can pick up naturally.

1. **Check brain-loaded marker** — Look for `<!-- brain-loaded -->` in system reminders. If present, skip to step 2. If missing (hook failed), read `~/.claude/brain/prefrontal-live.md` to restore behavioral rules and relational forces.

2. **Check if `prefrontal-cortex.md` is loaded** — Look in system reminders for recent session entries (format: `## HH:MM — scope [SESSION_ID]`). If not present, read `~/.claude/brain/prefrontal-cortex.md`.

3. **Internalize recent sessions** — `prefrontal-cortex.md` retains the last 3 session entries in this format:
   ```
   ## HH:MM — scope [SESSION_ID]
   Files: file1.js, file2.js
   Summary: One-line description
   ```
   Internalize what was worked on. Note the `[SESSION_ID]` for each — if deeper context is needed later, search long-term recall via CC2. Results include focus line ranges for targeted JSONL reading.

4. **Don't** preload conversation data. The PFC entries are the summary. Only search CC2 if the user asks about something specific or you need more context mid-task.

5. Greet briefly. Mention what the recent sessions touched (scope + summary) so the user knows you're oriented. Ask what they'd like to work on.
