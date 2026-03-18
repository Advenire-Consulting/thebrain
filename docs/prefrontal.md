# Prefrontal Cortex & Signals

Behavioral memory. Stores lessons learned from real sessions and generates decision gates that load into Claude's context at session start.

## Two Systems

### Signals Database (`~/.claude/brain/signals.db`)

Persistent store of two types of behavioral data:

**Lessons** (via `/dopamine`) — things that went right or wrong in sessions.
- Amygdala (negative): "Never do X" — mistakes to avoid
- Myelin (positive): "Always do X" — patterns that worked
- Each has a weight (0-100) that determines enforcement tier

**Forces** (via `/oxytocin`) — relational dynamics and working style preferences.
- Always-on (75+): active in every interaction
- Planning-mode (50-74): active during design and brainstorming

### Prefrontal Generator (`scripts/generate-prefrontal.py`)

Reads signals.db and produces `~/.claude/brain/prefrontal-live.md` — loaded at session start. Contains:

1. **Rules (75-100)** — non-negotiable behavioral constraints
2. **Inclinations (50-74)** — strong defaults that can be overridden with stated reasoning
3. **Relational forces** — working style, communication preferences
4. **Tool selection protocol** — which tools to prefer for which tasks

## Key Scripts

| Script | Purpose |
|--------|---------|
| `scripts/generate-prefrontal.py` | Builds prefrontal-live.md from signals.db |
| `scripts/dopamine-helper.py` | CLI for lesson CRUD — insert, surface, list |
| `scripts/oxytocin-helper.py` | CLI for force CRUD — insert, surface, list |
| `scripts/lessons.py` | Core lesson operations against signals.db |
| `scripts/wrapup-mechanical.sh` | Single call handles: hippocampus scan, term index, conversation indexing, prefrontal regeneration, PFC size marker |

## Weight Tiers

| Range | Tier | Enforcement |
|-------|------|-------------|
| 75-100 | Rule | Always/never. No exceptions. |
| 50-74 | Inclination | Default behavior. Must state reason before overriding. |
| < 50 | Below threshold | Not surfaced in prefrontal. Still in signals.db for review. |

## PFC Session Log (`~/.claude/brain/prefrontal-cortex.md`)

Separate from the generated prefrontal. This file tracks the last 3 sessions:

```markdown
## 2026-03-08 16:45 — thebrain [5390cc74]
Files: file1.js, file2.js
Summary: One-line description of what was done
Next: What to do next session
```

The `/hello` command reads this to orient on recent work. When entries overflow (>3), `index-all.js` migrates them to CC2's `window_summaries` table before trimming.

## Slash Commands

- `/dopamine` — flag a moment that matters (positive or negative), structured discussion, stored as weighted lesson
- `/oxytocin` — flag a relational dynamic, structured discussion, stored as scored force

## Lifecycle

```
/dopamine or /oxytocin (during session)
  → signals.db updated
  → Next session start: generate-prefrontal.py reads signals.db
  → prefrontal-live.md written
  → Loaded into Claude's context as decision gates
```
