# TheBrain

A cognitive layer for Claude Code that gives your AI assistant spatial awareness, conversation memory, safety guardrails, and behavioral learning across all your projects.

## What's Included

- **Hippocampus** — Code navigation: file aliases, blast radius analysis, term search, DB schema snapshots
- **Cerebral Cortex v2** — Conversation recall: search past sessions, read decision context, drill into reasoning
- **Hypothalamus** — Safety hooks: warns before touching sensitive files, surfaces blast radius on edits
- **Prefrontal** — Behavioral system: learned lessons and relational forces that shape how Claude works with you
- **Commands** — `/hello`, `/continue`, `/wrapup`, `/dopamine`, `/oxytocin`

## Installation

### Step 1: Copy the folder

Copy `thebrain-package` to your machine. Any location works — your home directory, a tools folder, wherever.

### Step 2: Install dependencies

```bash
cd /path/to/thebrain-package && npm install
```

### Step 3: Register the plugin

Run these in your terminal (not inside Claude):

```bash
claude plugins marketplace add /path/to/thebrain-package
claude plugins install thebrain@thebrain-local
```

After this, thebrain loads automatically on every `claude` launch — no `--plugin-dir` flag needed.

**Alternative (manual per-session):** If you prefer not to install permanently:
```bash
claude --plugin-dir /path/to/thebrain-package
```

### Step 4: Restart Claude and set up

Start a new Claude session. You should see `<!-- brain-loaded -->` confirming the plugin loaded. Then say:

> "set up thebrain"

Claude walks you through:
1. Registering your workspace directories
2. A behavioral questionnaire (personalizes how Claude works with you)
3. Seeding starter lessons and forces
4. First code scan and conversation indexing

## Requirements

- Node.js 18+
- Claude Code CLI
- A C++ compiler for `better-sqlite3` native build (or prebuilt binaries)

## Multi-Workspace Support

TheBrain scans multiple workspace roots and indexes conversations from all of them. Blast radius analysis crosses workspace boundaries — if a shared library is imported from two workspaces, edits to it surface dependents from both.

Configure workspaces in `~/.claude/brain/config.json`.

## Commands

| Command | What it does |
|---------|-------------|
| `/hello` | Session greeting — restores recent context |
| `/continue` | Context preservation and restoration (4 modes) |
| `/wrapup` | Save session state for next time |
| `/dopamine` | Flag a behavioral moment — builds your lesson database |
| `/oxytocin` | Flag a relational dynamic — builds your force system |

## Data Storage

All mutable state lives in `~/.claude/brain/`:
- `config.json` — workspace roots and conversation directories
- `signals.db` — behavioral lessons and relational forces
- `recall.db` — conversation index
- `hippocampus/` — project DIR files and term index
- `prefrontal-cortex.md` — short-term recall
- `prefrontal-live.md` — generated decision gates

## Troubleshooting

### "SessionStart:startup hook error"

**After first install:** Uninstall and reinstall the plugin to clear the cache:
```bash
claude plugins uninstall thebrain@thebrain-local
claude plugins marketplace remove thebrain-local
claude plugins marketplace add /path/to/thebrain-package
claude plugins install thebrain@thebrain-local
```

**After upgrading Node.js:** The `better-sqlite3` native module needs rebuilding. The session-start hook will detect this and tell you the fix, but if needed:
```bash
cd /path/to/thebrain-package && npm rebuild better-sqlite3
```
Also rebuild in the plugin cache if installed:
```bash
cd ~/.claude/plugins/cache/thebrain-local/thebrain/1.0.0 && npm rebuild better-sqlite3
```

### Claude doesn't recognize "set up thebrain"

Make sure the plugin is installed and enabled:
```bash
claude plugins list
```
Should show `thebrain@thebrain-local` with status `enabled`. If not, follow the install steps above. Start a **new** Claude session after installing.

### Node.js version too old

TheBrain requires Node.js 18+. The session-start hook checks this automatically. Upgrade with:
```bash
nvm install 22 && nvm use 22
```
Then `npm install` again in the thebrain-package directory.

## Further Reading

- `docs/quick-reference.md` — How to view, modify, and maintain everything
- `docs/tool-index.md` — Full CLI reference for all brain tools
- `docs/brain-map.md` — Architecture overview
- `setup/SETUP.md` — What happens during setup (Claude reads this)
