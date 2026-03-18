# TheBrain

A Claude Code plugin that makes your AI remember, navigate, and learn.

Out of the box, Claude Code starts every session blank — no memory of past conversations, no awareness of how your codebase connects, no learned preferences. TheBrain fixes that.

## What it does

**Remembers your conversations.** Search and recall past sessions across all your projects. "What did we decide about the auth system?" works.

**Navigates your code.** Maps file relationships, tracks blast radius (what breaks if you change this file), indexes every function and identifier across all your workspaces. Works cross-project — a shared library shows dependents from every project that imports it.

**Saves tokens.** Every tool the brain provides replaces an exploratory chain that would otherwise burn tokens — and those tokens don't just cost at read time, they persist in the conversation context for every subsequent turn. See [Token Savings](#token-savings) for the full breakdown.

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

Your spatial map. Scans all registered workspaces and builds a structured index of how files connect — imports, exports, routes, database references, and what each file does.

**Directory maps** (`--map <project>`) give Claude a full project overview in one call: every file with an auto-generated purpose summary (exports, routes, DB refs, import count) and optional narrative descriptions you can add over time. This is the first thing Claude checks when touching a project — it replaces the multi-file exploratory reads that burn tokens and pollute context.

**Navigation** answers structural questions without grep: `--blast-radius` shows what depends on a file and what it imports, `--find` locates every occurrence of an identifier across all projects with line numbers, `--structure` returns function/class/interface definitions with line numbers, `--lookup` shows a file's exports, routes, and database references, and `--schema` returns database table structures.

**Conversational aliases** let you say "show me the auth middleware" instead of remembering `lib/middleware/auth.js`. Aliases are preserved across re-scans. Auto-discovers new projects when you add workspace directories.

### Cerebral Cortex v2 — Conversation Recall

Long-term memory. Indexes your Claude Code conversation history (the JSONL files Claude already saves) and makes them searchable. Each conversation gets broken into windows with extracted decisions, summaries, and key terms. When you ask "what was the reasoning behind the database migration?", Claude searches the index, finds the relevant window, and reads back the actual back-and-forth — not a summary, the real conversation. Works across all your workspaces.

Search results include per-window decision digests so Claude can identify the right session before reading the full conversation. A filter sharpening system lets you flag noise terms that clutter results — terms flagged repeatedly get auto-promoted to the stopword list, keeping search quality high over time.

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

## Token Savings

Every brain tool replaces an exploratory chain — and the savings compound. Tokens loaded into context don't disappear after one turn; they're re-sent with every subsequent message. A 1,500-token exploratory read at turn 3 costs 1,500 tokens × every remaining turn. Over a 30-turn session, that's 40,000+ tokens of cumulative cost for files you never look at again.

The estimates below compare what each brain tool returns versus what Claude would do without it. "Immediate" is the token cost at the moment of the call. "Cumulative" is the real cost over a full session, because everything loaded into context stays there.

### Project Orientation (`--map`)

| | Without TheBrain | With TheBrain |
|---|---|---|
| **What happens** | Glob/ls to see directory (~200 tok). Read entry point to understand architecture (~500 tok). Read 2-3 more files to see patterns (~1,000 tok). Maybe read a wrong file and backtrack (~500 tok). | One `--map` call returns every file with purpose summaries (~400 tok). |
| **Immediate cost** | ~2,200 tokens across 4-5 tool calls | ~400 tokens, 1 tool call |
| **Cumulative (30 turns)** | ~55,000 tokens (irrelevant file contents carried all session) | ~12,000 tokens (compact, all-useful context) |

### Finding an Identifier (`--find`)

| | Without TheBrain | With TheBrain |
|---|---|---|
| **What happens** | Grep across the codebase (~300 tok). Results show file paths but not enough context. Read 2-3 files around the matches (~1,500 tok). If it's cross-project, repeat the grep in other directories (~600 tok). | One `--find` call returns every occurrence with line numbers across all projects (~200-500 tok). |
| **Immediate cost** | ~2,400 tokens across 4-6 tool calls | ~200-500 tokens, 1 tool call |
| **Cumulative (30 turns)** | ~60,000 tokens | ~6,000-15,000 tokens |

### Understanding a File (`--structure`, `--lookup`)

| | Without TheBrain | With TheBrain |
|---|---|---|
| **What happens** | Read the entire file to see what's in it (~500-2,000 tok depending on file size). The whole file stays in context even if you only needed the function list. | `--structure` returns definitions with line numbers (~150 tok). `--lookup` returns exports, routes, DB refs (~150 tok). |
| **Immediate cost** | ~500-2,000 tokens | ~150-300 tokens |
| **Cumulative (30 turns)** | ~15,000-60,000 tokens | ~4,500-9,000 tokens |

### Impact Analysis (`--blast-radius`)

| | Without TheBrain | With TheBrain |
|---|---|---|
| **What happens** | Grep for the filename across the codebase to find imports (~300 tok). Read each importing file to understand the dependency (~500 tok each × 3-5 files). Cross-project dependencies require repeating in other workspace directories. | One call returns importers and imports with connection counts (~200-400 tok). |
| **Immediate cost** | ~1,800-2,800 tokens across 4-6 tool calls | ~200-400 tokens, 1 tool call |
| **Cumulative (30 turns)** | ~45,000-70,000 tokens | ~6,000-12,000 tokens |

### Conversation Recall (CC2 Search)

This is where the savings are largest. The question: *"When was the burger menu collapse last discussed?"*

| | Without TheBrain | With TheBrain |
|---|---|---|
| **What happens** | Find the conversations directory (~100 tok). List JSONL session files (~200 tok). Grep across JSONL files for "burger" or "menu" (~500 tok). JSONL is raw — each line is a JSON object with role, content, base64 tool results, system prompts. Read 200 lines around a match to get conversation context (~3,000-5,000 tok of raw JSONL). If the first match is wrong, repeat for the next (~3,000-5,000 tok more). Often 2-4 attempts before finding the right conversation. | Search returns window IDs with decision digests (~150 tok). Read the digest to confirm it's the right one (~200 tok). Focused read of the cleaned conversation (~500-1,000 tok). |
| **Immediate cost** | ~7,000-16,000 tokens across 5-10 tool calls | ~850-1,350 tokens across 3 tool calls |
| **Cumulative (30 turns)** | ~175,000-400,000 tokens (raw JSONL is dense and stays in context) | ~25,000-40,000 tokens |

### Database Schema (`--schema`)

| | Without TheBrain | With TheBrain |
|---|---|---|
| **What happens** | Find database files (~200 tok). Find migration or schema files — might be in `migrations/`, `db/`, `server/db.js`, or inline (~300 tok + reads). Read schema definitions across multiple files (~1,000 tok). | One call returns all table structures (~300-500 tok). |
| **Immediate cost** | ~1,500 tokens across 3-4 tool calls | ~300-500 tokens, 1 tool call |
| **Cumulative (30 turns)** | ~37,500 tokens | ~9,000-15,000 tokens |

### Behavioral Preferences (Prefrontal)

| | Without TheBrain | With TheBrain |
|---|---|---|
| **What happens** | User re-explains preferences every session. "Don't use sudo." "Ask before deploying." "Match effort to question scope." Each correction costs a turn (~500 tok user message + ~500 tok Claude response) and the mistake it corrected already happened. Over weeks, the same corrections repeat. | Decision gates load at session start (~2,000 tok once). Rules are followed from turn 1. No correction cycles. |
| **Per-session cost** | ~3,000-5,000 tokens in corrections (plus the wasted work from mistakes) | ~2,000 tokens (loaded once, prevents the mistakes entirely) |

### The Compound Effect

These savings stack. In a typical working session, Claude might orient to a project, look up a schema, find an identifier, check blast radius, and recall a past conversation. Without TheBrain, that's 5 exploratory chains totaling ~15,000-25,000 tokens of immediate reads — all persisting in context.

With TheBrain, the same work costs ~2,000-3,000 tokens of compact, useful context.

Over a 30-turn session, the difference is roughly **100,000-300,000 cumulative tokens** — context window space that stays clean for the actual work.

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
