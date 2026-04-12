# TheBrain — Interactive Setup

When the user says "set up thebrain", "initialize thebrain", or similar, follow these steps interactively.

**Prerequisites:** The plugin is already loaded (via `--plugin-dir` or plugin install). You can reference `$PLUGIN_ROOT` as the plugin's directory — it's resolved by the session-start hook.

---

## Step 1: Create Directory Structure

```bash
mkdir -p ~/.claude/brain/hippocampus
```

## Step 2: Ask for Workspace Roots

Ask the user:

> "What directories contain your projects? These are the root folders I'll scan for code navigation and blast radius analysis. You can list multiple — I'll scan each one. You can add more later by editing `~/.claude/brain/config.json`."

Accept one or more absolute paths. For each path:
- Expand `~` to the home directory
- Verify the directory exists
- If it doesn't exist, warn the user and skip it

## Step 3: Derive Conversation Directories

For each workspace path, compute the Claude Code conversation directory:
- Take the absolute path (e.g., `/home/user/websites`)
- Replace all `/` with `-` (e.g., `-home-user-websites`)
- Prepend `~/.claude/projects/` (e.g., `~/.claude/projects/-home-user-websites`)

Check if each conversation directory exists. If it doesn't, note it — CC2 indexing will start once the user runs Claude in that workspace.

## Step 4: Write Config

Write `~/.claude/brain/config.json`:

```json
{
  "workspaces": [
    { "name": "<derived-from-dirname>", "path": "<absolute-path>" }
  ],
  "conversationDirs": [
    "~/.claude/projects/<encoded-path>"
  ]
}
```

The `name` field is derived from the directory basename (e.g., `/home/user/websites` -> `websites`).

## Step 5: Behavioral Questionnaire

Before seeding the database, ask the user these questions to personalize the brain. Ask them **one at a time** — don't dump the full list. For each question, include the brief "why this matters" explanation so the user understands what their answer shapes.

### Boundaries (→ amygdala lessons)

**Q1:** "First, let's set some hard boundaries. These become rules I **never** break — I'll always hand these actions to you instead of running them myself.

Are there any commands or actions you explicitly do not want me to ever run? Common examples:
- `sudo` (system-level commands)
- `rm -rf` (destructive file deletion)
- `git push --force` (overwriting remote history)
- Database drops or destructive migrations

You can list as many as you'd like, or say 'those examples are fine' to use the defaults."

Store each answer as an amygdala lesson with domain "boundaries", weight 100, polarity negative. Title format: "Never run [action] without user confirmation".

**Q2:** "Are you using a reverse proxy like Caddy, nginx, or Apache with static routes or special configuration? This matters because server changes can break routing if I don't know about your proxy setup.

If you're not serving anything from this machine, just say 'no' and we'll skip this."

If yes, store as an amygdala lesson with domain "infrastructure", weight 100, polarity negative. If no, skip.

### Working Style (→ forces)

**Q3:** "Now let's talk about how you work. Your answer here shapes how I pace myself — whether I slow down to sense the landscape or move quickly and let you steer.

When you're working on something complex, what process feels most natural?

A) **Sensing** — You sit with it, feel out what's off or missing, then act once you have a read on the situation
B) **Generating** — You move fast, produce ideas or code rapidly, and refine after you see what's there
C) **Structuring** — You build from a rigid plan outward, step by step
D) **Threading** — You follow interesting threads until a pattern clicks into place
E) Something else — describe it"

Store their answer as a force with title reflecting their process (e.g., "Identifier", "Rapid prototyper", "Structured builder", "Thread follower"), score 85, force_type "force".

**Q4:** "This shapes my communication style with you. When I see a problem with your approach or disagree with a direction, how would you like me to handle it?

A) **Push back directly** — Be blunt. Tell me what's wrong and why. I'd rather have honest friction than polite agreement.
B) **Frame it gently** — Raise concerns, but wrap them in suggestions rather than objections. I'll decide what to act on."

Store as a force. Direct → "Engage, don't validate" (score 82). Gentle → "Supportive guidance" (score 82) with description adjusted to their preference.

**Q5:** "This controls how much effort I put into different tasks. A quick utility script doesn't need the same rigor as a core authentication system.

Would you like me to:

A) **Match the weight** — Light touch for small scripts, deep consideration for foundations and critical systems. I scale my effort to what we're building.
B) **Consistent thoroughness** — Same level of care regardless of scope. Everything gets the full treatment."

If adaptive, store as force "Intent principle" (score 80): "Match the quality of awareness to the weight of what you're holding."
If consistent, store as force "Consistent thoroughness" (score 80) with their preferred level.

**Q6:** "This determines whether I'm proactive or reactive. Some people want an assistant that anticipates and acts; others want one that waits for direction.

When a task comes up, would you prefer I:

A) **Jump in** — Take initiative, handle what I can, and report back what I did
B) **Wait for your signal** — Present what I see, then wait for you to say go"

Proactive → store as force "Activate on arrival" (score 78). Reactive → store as force "Wait for the signal" (score 78).

**Q7:** "This shapes whether I stay narrowly focused or invest in making things more robust. When you've built something useful, would you like me to:

A) **Suggest extensions** — Proactively point out opportunities for better error handling, safety improvements, documentation, or related features
B) **Stay focused** — Do exactly what's asked, nothing more. I'll only mention improvements if you ask"

Extend → store as force "Generosity where wealth exists" (score 75). Focused → store as force "Stay scoped" (score 75).

**Q8:** "This affects how I approach architecture and tooling decisions.

Do you prefer your tools and projects to be:

A) **Self-contained** — Minimal external dependencies. If a service shuts down or a library changes, your project shouldn't break.
B) **Ecosystem-friendly** — Pull in libraries, APIs, and services freely to move faster. The convenience is worth the coupling."

Self-contained → store as force "Minimize dependency" (score 70). Dependencies OK → store as force "Leverage the ecosystem" (score 70).

**Q9:** "Last one. This shapes how we make design decisions together — whether I push for more exploration or move toward execution sooner.

When there are multiple valid approaches:

A) **Hold off** — Keep exploring until we find the one that feels clearly right. Don't commit to a direction prematurely.
B) **Pick and iterate** — Choose the best available option and refine as we learn. Progress over perfection."

Hold off → store as force with title and description reflecting conviction-first design (e.g., "Design conviction — only commit when it feels right"), score 90. Pick and refine → store similarly with iterative framing (e.g., "Iterative design — pick the best option and refine as you go"), score 90.

### Inserting Setup-Prompted Seeds

After the questionnaire, insert all collected answers into signals.db using the helper scripts. **Every entry must include a `--summary`** — a one-sentence distillation that gets loaded into context at session start. Without it, the full text bloats the session-start hook and can truncate the tool-index.

```bash
# For each amygdala lesson:
node $PLUGIN_ROOT/scripts/dopamine-helper.js --insert \
  --brain "amygdala" --domain "<domain>" --title "<title>" --entry "<entry>" \
  --summary "<one-sentence reasoning>" --weight <weight>

# For each force:
node $PLUGIN_ROOT/scripts/oxytocin-helper.js --insert \
  --title "<title>" --description "<description>" \
  --summary "<one-sentence reasoning>" --score <score> --type "<type>"
```

## Step 6: Seed Static Lessons and Forces

After the questionnaire answers are stored, seed the remaining static lessons and forces:

```bash
node $PLUGIN_ROOT/scripts/seed-signals.js
```

This adds to `~/.claude/brain/signals.db`:
- 10 static behavioral lessons (amygdala + nucleus accumbens, various weights)
- 4 static relational forces
- Schema version tracking

Note: `seed-signals.js` skips seeding if the database already has entries (from the questionnaire). If so, insert the static seeds manually using the helper scripts, or clear and re-run.

Tell the user: "These are starter lessons — training wheels. Use `/dopamine` to reinforce ones you agree with, flag ones that don't fit, or clear them all and build your own over time."

## Step 7: Initialize Queued Plans

```bash
cat > ~/.claude/brain/queued-plans.md << 'QPEOF'
# Queued Plans

Unfinished work with plan docs.
QPEOF
```

## Step 8: Run First Hippocampus Scan

```bash
node $PLUGIN_ROOT/hippocampus/scripts/scan.js
```

This walks all registered workspaces, discovers projects, and generates:
- DIR files in `~/.claude/brain/hippocampus/` (one per project)
- Term index in `~/.claude/brain/hippocampus/terms.db`

Report the number of projects discovered and files indexed.

## Step 8b: Alias Triage

After the scan, the hippocampus has mapped files and their connections but doesn't know what to *call* them. Aliases are conversational names that let you say "show me the auth middleware" instead of remembering `lib/middleware/auth.js`.

For each project that has mapped files, read its DIR file at `~/.claude/brain/hippocampus/<project>.dir.json` and look at the `files` section. Files with high connection counts (3+) or routes are the most important to alias.

Walk the user through the top projects (skip any with 0 mapped files). For each project:

1. **Filter out noise** — automatically dismiss files that are clearly not user-authored:
   - Anything inside `node_modules/`, `vendor/`, `dist/`, `build/`, `.next/`, `__pycache__/`
   - Minified files (`.min.js`, `.min.css`)
   - Generated files (`package-lock.json`, `yarn.lock`, lockfiles)
   - Use `--dismiss` for these silently — don't ask the user about them

2. **Group remaining files by role** — present them organized, not as a flat list:
   - **Entry points** — server.js, index.js, main.py, app.js
   - **Routes/API** — files with routes detected
   - **Core logic** — files with the highest connection counts (5+)
   - **Utilities/shared** — files imported by many others

3. **Present each group** and ask:

> "Here are the key files in **<project>**, grouped by role. Would you like to give any of them short names? For example, 'auth middleware' for `lib/middleware/auth.js`. I'll dismiss the rest."

For each file the user wants to alias, edit the DIR file's `aliases` object:
```json
{
  "aliases": {
    "conversational name": "path/to/file.js"
  }
}
```

For files to skip, dismiss them:
```bash
node $PLUGIN_ROOT/hippocampus/scripts/scan.js --dismiss <project> <file>
```

Don't force this — if the user wants to skip alias triage entirely, that's fine. The brain works without aliases, they just make navigation faster. Say: "You can always add aliases later by editing the DIR files or asking me to alias a file during a session."

## Step 9: Run First CC2 Scan

```bash
node $PLUGIN_ROOT/cerebral-cortex-v2/scripts/scan.js
```

This indexes existing conversation history from all registered conversation directories.
Creates `~/.claude/brain/recall.db` on first run.

If no conversation directories exist yet, this step produces no output — that's fine.

## Step 10: Generate Prefrontal

```bash
node $PLUGIN_ROOT/scripts/generate-prefrontal.js
```

Builds `~/.claude/brain/prefrontal-live.md` from the seed signals.

## Step 11: Install Tool Index as User Rule

The brain's tool reference (hippocampus, CC2, wrapup commands) is loaded as a user-level rules file so it stays in high-priority context. The session-start hook keeps this file up to date on future sessions, but we need to create it now for the first restart.

```bash
mkdir -p ~/.claude/rules
```

Then read `$PLUGIN_ROOT/docs/tool-index.md`, replace all `$PLUGIN_ROOT` references with the actual plugin root path, and write the result to `~/.claude/rules/brain-tools.md`.

This file is auto-maintained — when `docs/tool-index.md` changes in the plugin, the session-start hook detects the change and rewrites the rules file with resolved paths.

## Step 12: Verify Hooks

The plugin's hooks should already be active. Check for `<!-- brain-loaded -->` in the system reminders. If it's present, hooks are working. If not, the user may need to restart Claude with the correct `--plugin-dir` flag.

## Step 13: Summary

Show the user what was set up:

- Number of workspaces registered
- Number of projects discovered (from hippocampus scan)
- Number of files indexed (from hippocampus scan)
- Number of conversation windows indexed (from CC2 scan, if any)
- Seed lessons loaded
- Note: "You can create `~/.claude/brain/hypothalamus-config.json` to customize safety hook behavior (whitelist paths, adjust sensitivity). Defaults are sensible — most users won't need this."

**IMPORTANT:** Then tell the user:

"Setup is complete! Here's what to do next:

1. **Try `/wrapup` right now** — this saves the setup session to your brain's short-term recall. It's the command you'll use at the end of every working session to save context for next time.

2. **Start a new Claude session** — the tool-index, prefrontal rules, and code navigation commands only load on fresh session starts. This session ran setup but doesn't have the brain's full context loaded.

3. **Commands you now have access to:**

| Command | When to use it |
|---------|---------------|
| `/hello` | Start of a session — orients Claude on what you've been working on recently |
| `/wrapup` | End of a session — saves what you worked on for next time |
| `/dopamine +` | Something went well — reinforce the pattern |
| `/dopamine -` | Something went wrong — flag it so it doesn't happen again |
| `/oxytocin` | A collaboration dynamic worth capturing |

The brain gets smarter the more you use `/dopamine` and `/oxytocin`. Start with `/wrapup` at the end of each session — that's the most important habit."

## Post-Setup: Adding Workspaces Later

To add a workspace:
1. Edit `~/.claude/brain/config.json` — add entry to `workspaces` and `conversationDirs`
2. Run: `node $PLUGIN_ROOT/hippocampus/scripts/scan.js`

## Already Set Up?

If `~/.claude/brain/config.json` already exists when the user asks to set up, ask: "TheBrain is already configured with N workspace(s). Would you like to add another workspace, re-run the scans, or start fresh?"

- **Add workspace** — append to config, run scan
- **Re-run scans** — run hippocampus + CC2 scans without changing config
- **Start fresh** — confirm, then delete `~/.claude/brain/` and start from Step 1
