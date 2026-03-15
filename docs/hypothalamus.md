# Hypothalamus

Safety guard. Fires mechanically before every Edit, Write, MultiEdit, and Bash tool call. Checks what's being touched against the hippocampus spatial map and blocks or warns based on threat level.

This is the part of the brain that says "no" regardless of how convincing the prompt is.

## What It Does

1. **Edit/Write/MultiEdit** — checks if the target file is sensitive (database, .env, credentials) or has high blast radius (many dependents)
2. **Bash commands** — extracts filesystem paths from the command string, resolves them, classifies each against the hippocampus map
3. **Blocks** destructive operations on project roots, databases, and sensitive files
4. **Warns** on files with dependents, paths outside known projects, and commands it can't fully parse
5. **Suggests archiving** to `marked-for-deletion/` instead of permanent deletion

## Classification Levels

| Level | When | Action |
|-------|------|--------|
| RED (sensitivity) | Project root, database, .env, credentials | Exit 2 — blocks the tool call |
| RED (blast radius) | 5+ dependents | Exit 0 — warns via stderr, does not block |
| YELLOW | Known file with 1-4 dependents | Exit 0 — warns via stderr |
| AMBER | Unparseable command (eval, subshells, env vars, script files) | Exit 0 — warns via stderr |
| GREEN | Known file, no dependents, no sensitivity | Exit 0 — silent |
| UNKNOWN | Path outside all known project roots | Exit 0 — warns via stderr |

Note: RED has two sub-categories. Sensitivity RED (irreplaceable data) hard-blocks because the cost of a mistake is unrecoverable. Blast radius RED (many dependents) warns because the change may be intentional — the developer needs awareness, not a gate.

## Key Files

| File | Purpose |
|------|---------|
| `hooks/hypothalamus_hook.js` | The hook — reads stdin, routes to Bash or Edit handler |
| `hypothalamus/lib/path-extractor.js` | Parses Bash commands into resolved absolute paths. Strips heredoc content before extraction. |
| `hypothalamus/lib/classifier.js` | Classifies paths against hippocampus DIR data |
| `hypothalamus/lib/config.js` | Loads override config with safe defaults |
| `hooks/hooks.json` | Wiring — PreToolUse matcher for Edit/Write/MultiEdit/Bash |

## PostToolUse Hook

`hooks/post-edit-hook.js` fires after every Edit/Write/MultiEdit:
- Updates the term index for the edited file (real-time identifier tracking)
- Updates the file's DIR entry (imports, exports, routes)
- Resets the hypothalamus warning for that file so changes to blast radius are re-evaluated

## Session Dedup

Each warning fires once per path per session. State is stored in `~/.claude/hypothalamus_state_<session_id>.json`. Dedup is checked before any warning output — prevents infinite retry loops where a blocked command re-triggers the same alert on each attempt.

## Heredoc Handling

Bash commands containing heredocs (`<< 'EOF'...EOF`) have their heredoc body stripped before path extraction. The body is data, not a command — project names or file paths mentioned in heredoc text (e.g., PFC entries, commit messages) are not classified as targets.

## Override Config

Optional file at `~/.claude/brain/hypothalamus-config.json`:

| Field | Default | What it does |
|-------|---------|--------------|
| `disabled` | `false` | Kill switch — disables all checks |
| `whitelisted_paths` | `[]` | Paths that always pass as GREEN |
| `sensitivity_overrides` | `{}` | Downgrade specific files from sensitive to regular code |
| `warn_on_unparseable` | `true` | Show AMBER warnings for unparseable commands |

## How It Connects to Hippocampus

The hypothalamus doesn't maintain its own file index. It reads DIR files produced by the hippocampus scanner. New projects or files won't be protected until they appear in a DIR file.
