# TheBrain

A Claude Code plugin that makes your AI remember, navigate, and learn.

Out of the box, Claude Code starts every session blank — no memory of past conversations, no awareness of how your codebase connects, no learned preferences. TheBrain fixes that.

## What it does

**Remembers your conversations.** Search and recall past sessions across all your projects. "What did we decide about the auth system?" works.

**Navigates your code.** Maps file relationships, tracks blast radius (what breaks if you change this file), indexes every function and identifier across all your workspaces. Works cross-project — a shared library shows dependents from every project that imports it.

**Keeps you safe.** Hooks into every file edit and bash command. Warns before touching high-impact files, flags commands it can't fully analyze, blocks edits to sensitive files like databases without your confirmation.

**Learns how you work.** A behavioral system that builds up over time. Flag moments that matter — pain points become rules ("never do this"), good patterns get reinforced ("always do this"). Your Claude gets better the more you use it.

**Carries context across sessions.** `/wrapup` saves where you left off. `/continue` picks it back up. Short-term recall survives session restarts and context compaction.

## How it works

Install the plugin, run guided setup (2 minutes), start working. The brain loads automatically on every Claude session.

- **Personalized from the start** — setup asks how you work and configures Claude's behavior to match
- **Multi-workspace** — scans all your project directories, indexes conversations from all of them
- **Cross-platform** — works on Linux, macOS, and Windows
- **Single dependency** — just Node.js 18+, nothing else

---

## The Brain — Region by Region

### Hippocampus — Code Navigation

Your spatial map. Scans all registered workspaces and builds a graph of how files connect — imports, exports, routes, database references. Gives Claude instant answers to questions like "what calls this function?", "what breaks if I change this file?", and "where's the auth middleware?" without expensive grep searches. Supports conversational aliases so you can say "show me the server" instead of remembering `lib/http/server.js`. Auto-discovers new projects when you add them.

### Cerebral Cortex v2 — Conversation Recall

Long-term memory. Indexes your Claude Code conversation history (the JSONL files Claude already saves) and makes them searchable. Each conversation gets broken into windows with extracted decisions, summaries, and key terms. When you ask "what was the reasoning behind the database migration?", Claude searches the index, finds the relevant window, and reads back the actual back-and-forth — not a summary, the real conversation. Works across all your workspaces.

### Hypothalamus — Safety Hooks

Your guardrails. Fires on every file edit and bash command before Claude executes them. Classifies paths by sensitivity (databases, secrets, config files get flagged), calculates blast radius (how many files depend on the one being changed), and warns or blocks accordingly. A file with 15 dependents gets a different warning than a leaf file nobody imports. Unparseable bash commands get flagged for manual review. All configurable — whitelist paths, override sensitivity, or disable entirely.

### Prefrontal Cortex — Behavioral Learning

The rules engine. Compiles two data sources into decision gates that load into every session:

- **Lessons** (via `/dopamine`) — Things that went well or burned you. Stored with weights that determine how strongly they influence behavior. Two reinforcements promote a lesson from suggestion to hard rule. Categories: amygdala (pain points), nucleus accumbens (good patterns), prefrontal (decision rules), hippocampus (routing insights).

- **Forces** (via `/oxytocin`) — Relational dynamics that shape collaboration style. How direct should feedback be? Should Claude wait for permission or take initiative? Design by conviction or iteration? These are scored and tiered — high-scoring forces shape every interaction, lower ones activate during planning.

Both compile into `prefrontal-live.md`, which loads at session start. The more you use `/dopamine` and `/oxytocin`, the more precisely Claude matches how you think and work.

### Session Continuity — `/hello`, `/continue`, `/wrapup`

The glue. `/wrapup` captures what you worked on, what files you touched, and where you left off — written to short-term recall and indexed by the Cerebral Cortex. `/continue` restores that context in a new session or after context compaction. `/hello` is the lightweight greeting that orients Claude on what happened recently. Together they make Claude feel like it remembers, even across sessions and machines if you sync the folders.

---

## Installation

```bash
# Copy to your machine and install
cd /path/to/thebrain && npm install

# Register as a Claude Code plugin
claude plugins marketplace add /path/to/thebrain
claude plugins install thebrain@thebrain-local

# Start Claude and run setup
claude
> "set up thebrain"
```

## Requirements

- Node.js 18+
- Claude Code CLI

## Documentation

- [Installation Guide](docs/installation.md) — detailed install steps and troubleshooting
- [Quick Reference](docs/quick-reference.md) — how to view, modify, and maintain everything
- [Architecture](docs/brain-map.md) — how the regions connect
- [Tool Index](docs/tool-index.md) — full CLI reference for all brain tools

---

Built by [Advenire Consulting](https://advenire.consulting).

Questions, feedback, or want to talk about what you're building? Open an issue or reach out at [advenire.consulting](https://advenire.consulting).
