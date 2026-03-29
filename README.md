# TheBrain

A Claude Code plugin that makes your AI remember, navigate, and learn.

Out of the box, Claude Code starts every session blank — no memory of past conversations, no awareness of how your codebase connects, no learned preferences. TheBrain fixes that.

## What it does

**Remembers your conversations.** Search and recall past sessions across all your projects. "What did we decide about the auth system?" works.

**Navigates your code.** Maps file relationships, tracks blast radius (what breaks if you change this file), indexes every function and identifier across all your workspaces. Works cross-project — a shared library shows dependents from every project that imports it.

**Saves tokens.** Every tool the brain provides replaces an exploratory chain that would otherwise burn tokens — and those tokens don't just cost at read time, they persist in the conversation context for every subsequent turn. See [Token Savings](#token-savings) for the full breakdown.

**Keeps you safe.** Hooks into every file edit and bash command. Warns before touching high-impact files, flags commands it can't fully analyze, blocks edits to sensitive files like databases without your confirmation.

**Learns how you work.** A behavioral system that builds up over time. Flag moments that matter — pain points become rules ("never do this"), good patterns get reinforced ("always do this"). Your Claude gets better the more you use it.

**Tracks what you're working on.** File-level working memory that knows which files are hot right now. Reads and edits build heat; idle files cool off exponentially between sessions. Session start loads the hottest files with context — what you were doing with each one and why — so Claude picks up mid-thought, not mid-codebase.

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

Your spatial map. Scans all registered workspaces and builds a structured index of how files connect — imports, exports, routes, database references, and what each file does.

**Directory maps** (`--map <project>`) give Claude a full project overview in one call: every file with an auto-generated purpose summary (exports, routes, DB refs, import count) and optional narrative descriptions you can add over time. This is the first thing Claude checks when touching a project — it replaces the multi-file exploratory reads that burn tokens and pollute context.

**Navigation** answers structural questions without grep: `--blast-radius` shows what depends on a file and what it imports, `--find` locates every occurrence of an identifier across all projects with line numbers, `--structure` returns function/class/interface definitions with line numbers, `--lookup` shows a file's exports, routes, and database references, and `--schema` returns database table structures.

**Conversational aliases** let you say "show me the auth middleware" instead of remembering `lib/middleware/auth.js`. Aliases are preserved across re-scans. Auto-discovers new projects when you add workspace directories.

### Cerebral Cortex v2 — Conversation Recall

Long-term memory. Indexes your Claude Code conversation history (the JSONL files Claude already saves) and makes them searchable. Each conversation gets broken into windows with extracted decisions, summaries, and key terms. When you ask "what was the reasoning behind the database migration?", Claude searches the index, finds the relevant window, and reads back the actual back-and-forth — not a summary, the real conversation. Works across all your workspaces.

Search results include per-window decision digests so Claude can identify the right session before reading the full conversation. A filter sharpening system lets you flag noise terms that clutter results — terms flagged repeatedly get auto-promoted to the stopword list, keeping search quality high over time.

### Hypothalamus — Safety Hooks

Your guardrails. Fires on every file edit and bash command before Claude executes them. Classifies paths by sensitivity (databases, secrets, config files get flagged), calculates blast radius (how many files depend on the one being changed), and warns or blocks accordingly. A file with 15 dependents gets a different warning than a leaf file nobody imports. Unparseable bash commands get flagged for manual review. All configurable — whitelist paths, override sensitivity, or disable entirely.

### dlPFC — Working Memory

File-level attention tracking. Every Read bumps a file's heat score (+0.3), every Edit bumps it harder (+1.0). Between sessions, scores decay exponentially — files you haven't touched in three sessions fade out, files you're actively working on stay hot.

At wrapup, Claude enriches hot files with context notes ("refactoring the auth flow to support multi-tenant sessions") and one-line summaries. At session start, the top files per project load into context with their scores, notes, and summaries — so Claude knows not just *what files exist* but *which ones matter right now and why*.

The decay curve is tuned for real work patterns: a file edited today has a score of 1.0. After one idle session it's 0.37, after two it's 0.14, after three it drops below the 0.1 threshold and falls out of working memory. Active files accumulate — a file touched across five sessions builds a score that takes several idle sessions to cool off.

### Prefrontal Cortex — Behavioral Learning

The rules engine. Compiles two data sources into decision gates that load into every session:

- **Lessons** (via `/dopamine`) — Things that went well or burned you. Stored with weights that determine how strongly they influence behavior. Two reinforcements promote a lesson from suggestion to hard rule. Categories: amygdala (pain points), nucleus accumbens (good patterns), prefrontal (decision rules), hippocampus (routing insights).

- **Forces** (via `/oxytocin`) — Relational dynamics that shape collaboration style. How direct should feedback be? Should Claude wait for permission or take initiative? Design by conviction or iteration? These are scored and tiered — high-scoring forces shape every interaction, lower ones activate during planning.

Both compile into `prefrontal-live.md`, which loads at session start. The more you use `/dopamine` and `/oxytocin`, the more precisely Claude matches how you think and work.

### Session Continuity — `/hello`, `/continue`, `/wrapup`

The glue. `/wrapup` captures what you worked on, what files you touched, and where you left off — written to short-term recall and indexed by the Cerebral Cortex. `/continue` restores that context in a new session or after context compaction. `/hello` is the lightweight greeting that orients Claude on what happened recently. Together they make Claude feel like it remembers, even across sessions and machines if you sync the folders.

---

## Token Savings

Every brain tool replaces an exploratory chain. Without persistent memory, Claude starts each session blind — reading wrong files, grepping for context the user already has, re-learning preferences it was taught yesterday. Measured across 111 real sessions:

**~2,500 tokens of brain context replaces 50,000–200,000+ tokens of exploration, false starts, and corrections.**

### Measured Comparisons

| Situation | Without TheBrain | With TheBrain | Improvement |
|-----------|-----------------|---------------|-------------|
| **Resuming work on a feature** — "where did we leave off?" | 44,000 tokens across 8 tool calls | 650 tokens across 2 tool calls | **68x** |
| **Getting oriented on a project** — what files exist, what they do, how they connect | 5,000–30,000 tokens across 5-10 tool calls | ~150 tokens, 1 `--map` call | **30–200x** |
| **Finding a function or identifier** across the codebase | 3,000–15,000 tokens across grep/glob chains | ~150 tokens, 1 `--find` call | **20–100x** |
| **Recalling a past decision** — "why did we build it this way?" | 100,000+ tokens reading raw conversation files | ~350 tokens via indexed search + digest | **300x+** |
| **Runaway tool call cascades** — Claude exploring when it should ask | 77,000+ tokens across 7 observed bursts (29+ tool calls the user had to cancel) | 560 tokens total (asking one question instead) | **137x** |
| **Repeating past mistakes** — restarting services, writing files without asking, over-exploring | 10,000–15,000 tokens per incident in wasted work + user corrections | 0 additional tokens — behavioral rules prevent the incident entirely | **Total prevention** |

All numbers are from real sessions with real timestamps. Nothing is synthetic.

### Why It Compounds

Tokens don't disappear after one turn — they persist in conversation context for every subsequent message. A 1,500-token exploratory read at turn 3 costs 1,500 × every remaining turn. Over a 30-turn session, that's 40,000+ cumulative tokens for files you never look at again.

In a typical session, Claude might orient to a project, look up a schema, find an identifier, check blast radius, and recall a past conversation. Without TheBrain, that's 5 exploratory chains totaling 15,000–25,000 tokens of immediate reads — all persisting in context. With TheBrain, the same work costs 2,000–3,000 tokens of compact, useful context.

Over a 30-turn session, the difference is roughly **100,000–300,000 cumulative tokens** — context window space that stays clean for the actual work.

### What Prevents What

| Brain Component | What It Replaces |
|----------------|-----------------|
| Hippocampus `--map` | Multi-file exploratory reads to understand a project |
| Hippocampus `--find`, `--blast-radius` | Grep chains that read wrong files first |
| Cerebral Cortex search + digest | Reading raw JSONL conversation files (dense, unindexed) |
| Prefrontal behavioral rules | Re-learning user preferences every session; mistakes that burn tokens before the user can intervene |
| dlPFC working memory | 8-12 re-orientation file reads at session start; Claude knowing *which* files matter but not *why* |

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
- [Working Memory (dlPFC)](docs/dlpfc.md) — file-level attention tracking and session context
- [Tool Index](docs/tool-index.md) — full CLI reference for all brain tools

---

Built by [Advenire Consulting](https://advenire.consulting).

Questions, feedback, or want to talk about what you're building? Open an issue or reach out at [advenire.consulting](https://advenire.consulting).
