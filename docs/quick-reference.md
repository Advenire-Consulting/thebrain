# TheBrain — Quick Reference

User-facing guide for viewing, modifying, and maintaining the brain system. Also serves as a reference for Claude when manually adjusting values.

All commands assume the plugin is loaded. `$PLUGIN_ROOT` resolves to wherever the plugin is installed.

---

## File Locations

| What | Where | Safe to delete? |
|------|-------|----------------|
| Config | `~/.claude/brain/config.json` | Re-run setup |
| Lessons + Forces DB | `~/.claude/brain/signals.db` | Loses all behavioral data — re-seed with `seed-signals.js` |
| Conversation index | `~/.claude/brain/recall.db` | Re-scan rebuilds it |
| Window index | `~/.claude/brain/windows.json` | Re-scan rebuilds it |
| Project DIR files | `~/.claude/brain/hippocampus/*.dir.json` | Re-scan rebuilds them |
| Term index | `~/.claude/brain/hippocampus/terms.db` | Re-scan rebuilds it |
| Short-term recall | `~/.claude/brain/prefrontal-cortex.md` | Loses last 3 session summaries |
| Decision gates | `~/.claude/brain/prefrontal-live.md` | Regenerated from signals.db |
| PFC size marker | `~/.claude/brain/.pfc-loaded-size` | Regenerated automatically |
| Queued plans | `~/.claude/brain/queued-plans.md` | Loses plan tracking |
| Safety config | `~/.claude/brain/hypothalamus-config.json` | Falls back to defaults |

---

## Workspaces

### Add a workspace

Edit `~/.claude/brain/config.json`:

```json
{
  "workspaces": [
    { "name": "existing", "path": "/home/user/existing" },
    { "name": "new-project", "path": "/home/user/new-project" }
  ],
  "conversationDirs": [
    "~/.claude/projects/-home-user-existing",
    "~/.claude/projects/-home-user-new-project"
  ]
}
```

The conversation dir encoding: take the absolute path, replace all `/` with `-`.

Then re-scan:
```bash
node $PLUGIN_ROOT/hippocampus/scripts/scan.js
```

### Remove a workspace

Remove the entries from `config.json`. Optionally delete its DIR files from `~/.claude/brain/hippocampus/`.

### List registered workspaces

```bash
cat ~/.claude/brain/config.json
```

---

## Lessons (Amygdala / Nucleus Accumbens / Prefrontal)

Lessons are behavioral rules stored in `signals.db`. They have a `brain_file` that categorizes them:

| Brain File | Purpose | Polarity |
|-----------|---------|----------|
| `amygdala` | Pain points — things to avoid | negative |
| `nucleus-accumbens` | Patterns that work — things to reinforce | positive |
| `prefrontal` | Decision rules — things to check before acting | negative |
| `hippocampus` | Routing insights — where to look for things | negative |

### View all lessons

```bash
node $PLUGIN_ROOT/scripts/dopamine-helper.js --lessons
```

### View lessons by tier (surfaced format)

```bash
node $PLUGIN_ROOT/scripts/dopamine-helper.js --surface
node $PLUGIN_ROOT/scripts/dopamine-helper.js --surface --all    # include low-tier
node $PLUGIN_ROOT/scripts/dopamine-helper.js --surface --brain amygdala
```

### Add a lesson via CLI

```bash
node $PLUGIN_ROOT/scripts/dopamine-helper.js --insert \
  --brain "amygdala" \
  --domain "workflow" \
  --title "Short title" \
  --entry "Full description of the lesson" \
  --severity "critical"
```

Optional: `--weight 80` to set an explicit weight instead of the default 50.

### Add a lesson via `/dopamine`

In a Claude session, type `/dopamine +` (positive) or `/dopamine -` (negative). Claude walks you through a structured discussion and stores the result.

### Change a lesson's weight directly

```bash
node -e "
const Database = require('better-sqlite3');
const db = new Database(process.env.HOME + '/.claude/brain/signals.db');
db.prepare('UPDATE lessons SET confirmation_count = ? WHERE title = ? AND status = ?').run(80, 'Lesson Title Here', 'active');
db.close();
console.log('Updated');
"
```

### Remove a lesson

Soft-delete (recommended — preserves history):
```bash
node -e "
const Database = require('better-sqlite3');
const db = new Database(process.env.HOME + '/.claude/brain/signals.db');
db.prepare(\"UPDATE lessons SET status = 'inactive' WHERE title = ? AND status = 'active'\").run('Lesson Title Here');
db.close();
console.log('Deactivated');
"
```

Hard delete:
```bash
node -e "
const Database = require('better-sqlite3');
const db = new Database(process.env.HOME + '/.claude/brain/signals.db');
db.prepare(\"DELETE FROM lessons WHERE title = ?\").run('Lesson Title Here');
db.close();
console.log('Deleted');
"
```

### Weight tiers

| Weight | Tier | Behavior |
|--------|------|----------|
| 75-100 | Rule | Always loaded. Follow without exception. |
| 50-74 | Inclination | Always loaded. Strong default, but can be questioned. |
| 25-49 | Awareness | On-demand. Not loaded into prefrontal by default. |
| 0-24 | Data | Background. Accumulating evidence only. |

### Regenerate prefrontal after changes

After modifying lessons directly in the DB, regenerate the compiled output:

```bash
node $PLUGIN_ROOT/scripts/generate-prefrontal.js
```

This rebuilds `~/.claude/brain/prefrontal-live.md` from the current state of `signals.db`. The next session start will pick it up automatically.

---

## Forces (Limbic System)

Forces are relational dynamics stored in `signals.db`. They shape how Claude collaborates with you.

| Force Type | Purpose |
|-----------|---------|
| `force` | A relational principle (e.g., "Constraint-driven design") |
| `connective_tissue` | Links between forces |
| `behavioral_outcome` | Emergent dynamics forces produce together |

### View all forces

```bash
node $PLUGIN_ROOT/scripts/oxytocin-helper.js --forces
```

### View forces by tier (surfaced format)

```bash
node $PLUGIN_ROOT/scripts/oxytocin-helper.js --surface
node $PLUGIN_ROOT/scripts/oxytocin-helper.js --surface --all
```

### Add a force via CLI

```bash
node $PLUGIN_ROOT/scripts/oxytocin-helper.js --insert \
  --title "Force Name" \
  --description "What this force means and when it applies" \
  --score 75 \
  --type "force"
```

### Add a force via `/oxytocin`

In a Claude session, type `/oxytocin new` to create or `/oxytocin +` to reinforce. Claude walks you through it.

### Change a force's score directly

```bash
node -e "
const Database = require('better-sqlite3');
const db = new Database(process.env.HOME + '/.claude/brain/signals.db');
db.prepare('UPDATE forces SET score = ? WHERE title = ? AND status = ?').run(85, 'Force Title Here', 'active');
db.close();
console.log('Updated');
"
```

### Remove a force

```bash
node -e "
const Database = require('better-sqlite3');
const db = new Database(process.env.HOME + '/.claude/brain/signals.db');
db.prepare(\"UPDATE forces SET status = 'inactive' WHERE title = ? AND status = 'active'\").run('Force Title Here');
db.close();
console.log('Deactivated');
"
```

### Score tiers

| Score | Tier | Behavior |
|-------|------|----------|
| 75-100 | Always-on | Shapes every interaction |
| 50-74 | Planning-mode | Active during design and brainstorming |
| 0-49 | Deep context | Archived, accessed on demand |

### Regenerate after changes

Same as lessons — run `generate-prefrontal.js` to recompile.

---

## Prefrontal (Decision Gates)

The prefrontal is a compiled markdown file (`prefrontal-live.md`) generated from lessons and forces in `signals.db`. It's loaded into Claude's context at every session start.

**Never edit `prefrontal-live.md` directly** — it's overwritten on regeneration.

### What controls its content

- Lessons with weight >= 50 (Rule + Inclination tiers)
- Forces with score >= 50 (Always-on + Planning-mode tiers)
- 120-line cap (truncates if too large)

### Force regeneration

```bash
node $PLUGIN_ROOT/scripts/generate-prefrontal.js
```

### Short-term recall (`prefrontal-cortex.md`)

This is separate from `prefrontal-live.md`. It holds the last 3 session summaries written by `/wrapup` or `/continue save`. Format:

```
## HH:MM — project-or-scope [SESSION_ID]
Files: file1.js, file2.js
Summary: What was done
Next: What's pending
```

You can edit this manually if a session entry is wrong. The CC2 indexer reads entries before trimming them.

---

## Hippocampus (Code Navigation)

### Query commands

```bash
node $PLUGIN_ROOT/hippocampus/scripts/query.js --resolve <alias>
node $PLUGIN_ROOT/hippocampus/scripts/query.js --blast-radius <file>
node $PLUGIN_ROOT/hippocampus/scripts/query.js --lookup <file>
node $PLUGIN_ROOT/hippocampus/scripts/query.js --find <identifier>
node $PLUGIN_ROOT/hippocampus/scripts/query.js --structure <file>
node $PLUGIN_ROOT/hippocampus/scripts/query.js --list-aliases
node $PLUGIN_ROOT/hippocampus/scripts/query.js --schema
```

### Re-scan all workspaces

```bash
node $PLUGIN_ROOT/hippocampus/scripts/scan.js
```

### Add an alias

Edit the project's DIR file at `~/.claude/brain/hippocampus/<project>.dir.json`. Add to the `aliases` object:

```json
{
  "aliases": {
    "auth middleware": "lib/middleware/auth.js",
    "main server": "server.js"
  }
}
```

Aliases are preserved across re-scans.

### Dismiss a file from alias triage

```bash
node $PLUGIN_ROOT/hippocampus/scripts/scan.js --dismiss <project-name> <file-path>
```

### Undismiss

```bash
node $PLUGIN_ROOT/hippocampus/scripts/scan.js --undismiss <project-name> <file-path>
```

### Update term index

```bash
node $PLUGIN_ROOT/hippocampus/scripts/term-scan-cli.js
```

---

## Cerebral Cortex v2 (Conversation Recall)

### Search past conversations

```bash
node $PLUGIN_ROOT/cerebral-cortex-v2/scripts/search.js "term1,term2" "term3" --limit 5
```

Terms in quotes are comma-separated OR. Separate arguments are additive (more matched = higher score).

### Read a conversation window

```bash
# Digest (summary only)
node $PLUGIN_ROOT/cerebral-cortex-v2/scripts/read-window.js <session> <seq> --digest

# Decision context
node $PLUGIN_ROOT/cerebral-cortex-v2/scripts/read-window.js <session> <seq> --decision N

# Full window
node $PLUGIN_ROOT/cerebral-cortex-v2/scripts/read-window.js <session> <seq> --focus <start>-<end>
```

### Re-index conversations

```bash
node $PLUGIN_ROOT/cerebral-cortex-v2/scripts/scan.js
```

### Extract metadata (decisions, summaries)

```bash
node $PLUGIN_ROOT/cerebral-cortex-v2/scripts/extract.js
```

### Manage stopwords

```bash
node $PLUGIN_ROOT/cerebral-cortex-v2/scripts/stopword-candidates.js --noise "go,something"
node $PLUGIN_ROOT/cerebral-cortex-v2/scripts/stopword-candidates.js --relevant "term"
node $PLUGIN_ROOT/cerebral-cortex-v2/scripts/stopword-candidates.js --demote "term"
node $PLUGIN_ROOT/cerebral-cortex-v2/scripts/stopword-candidates.js --list
```

---

## Hypothalamus (Safety Hooks)

The hypothalamus fires on every Edit/Write/Bash call. It classifies paths and warns about risky operations.

### Customize behavior

Create or edit `~/.claude/brain/hypothalamus-config.json`:

```json
{
  "disabled": false,
  "whitelisted_paths": ["/path/to/safe/dir"],
  "sensitivity_overrides": {
    "some-file.db": "green"
  },
  "warn_on_unparseable": true
}
```

| Field | Default | Purpose |
|-------|---------|---------|
| `disabled` | `false` | Turn off all hypothalamus warnings |
| `whitelisted_paths` | `[]` | Paths that always get GREEN classification |
| `sensitivity_overrides` | `{}` | Override sensitivity for specific files |
| `warn_on_unparseable` | `true` | Warn on bash commands that can't be fully analyzed |

### Classification levels

| Level | Meaning | Action |
|-------|---------|--------|
| GREEN | Safe | Proceed silently |
| YELLOW | Has dependents | Warn, proceed |
| AMBER | Unparseable command | Warn, proceed |
| RED (sensitivity) | Database/secrets/roots | **Block** — requires user confirmation |
| RED (blast radius) | 5+ dependents | Warn strongly, proceed |
| UNKNOWN | Outside known projects | Warn, proceed |

---

## Commands

| Command | Usage | What it does |
|---------|-------|-------------|
| `/hello` | Start of session | Restores recent context from PFC |
| `/continue` | After compaction | Re-grounds in current session |
| `/continue save` | Before stopping | Saves project state + runs wrapup |
| `/continue <project>` | New session | Picks up a specific project |
| `/continue workspace` | New session | Full workspace status overview |
| `/wrapup` | Before stopping | Alias for `/continue save` |
| `/dopamine +` | Mid-session | Flag a positive pattern |
| `/dopamine -` | Mid-session | Flag a pain point |
| `/oxytocin new` | Mid-session | Create a new relational force |
| `/oxytocin +` | Mid-session | Reinforce an existing force |

---

## Full Wrapup (All Maintenance)

Runs hippocampus re-scan, term index update, CC2 scan + metadata extraction, PFC trim, prefrontal regeneration, and size marker update:

```bash
bash $PLUGIN_ROOT/scripts/wrapup-mechanical.sh
```

This is what `/wrapup` calls after Claude writes the PFC entry.

---

## Uninstall

Plugin uninstall only removes the plugin registration — it does **not** delete your brain data.

### Remove the plugin

```bash
claude plugins uninstall thebrain@thebrain-local
claude plugins marketplace remove thebrain-local
```

### Remove brain data (optional)

After uninstalling the plugin, your learned data still lives in `~/.claude/brain/`. To remove it:

```bash
rm -rf ~/.claude/brain
```

### Full clean uninstall

All three steps — plugin, data, and source:

```bash
claude plugins uninstall thebrain@thebrain-local
claude plugins marketplace remove thebrain-local
rm -rf ~/.claude/brain
rm -rf /path/to/thebrain-package
```

---

## Reset (Keep Plugin, Fresh Data)

To start completely fresh without uninstalling:

```bash
rm -rf ~/.claude/brain
```

Then start a new Claude session and say "set up thebrain".

To reset only behavioral data (keep workspaces and indexes):

```bash
rm ~/.claude/brain/signals.db ~/.claude/brain/prefrontal-live.md
node $PLUGIN_ROOT/scripts/seed-signals.js
node $PLUGIN_ROOT/scripts/generate-prefrontal.js
```
