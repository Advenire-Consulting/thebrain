---
description: "Flag a relational dynamic — reinforce an existing force or name a new one. Structured discussion, then store as a scored limbic force."
---

A deliberate "this relationship dynamic matters" flag. A structured discussion about a relational force, design value, or collaboration pattern.

**Routing:**
- `/oxytocin +` — Reinforce an existing force. Score goes up.
- `/oxytocin new` — A new force emerged. Discuss and create it.
- `/oxytocin` (bare) — Ask: "Are we reinforcing something existing or naming something new?"

Do all steps in order:

## 1. Reconstruct the Moment

Review the last 10-15 messages. What happened that surfaced a relational dynamic? Describe the interaction pattern, the design value at play, or the collaboration insight. Present for confirmation.

## 2. Discuss the Force

What's the relational principle? Forces describe design values and team philosophy — how we work together, what shapes decisions, what matters in the collaboration.

Force types:
- **force** — A relational principle (e.g., "Constraint-driven design", "Engage, don't validate")
- **connective_tissue** — A link between forces (how they relate to each other)
- **behavioral_outcome** — An emergent dynamic the forces produce together

User refines, you adapt.

## 3. Check Existing Forces

Does this match or extend an existing force?

```bash
node $PLUGIN_ROOT/scripts/oxytocin-helper.js --forces
```

If a match exists, this is a reinforcement (+10 score, capped at 100). If new, propose title and description.

## 4. Craft the Entry

Collaboratively craft:
- **Title** — Short, evocative (2-5 words)
- **Summary** — One sentence distilling the force's reasoning. This is what gets loaded into context at session start. Must be self-contained.
- **Description** — Full 1-2 lines describing the principle and when it applies. Stored for reference but NOT loaded at session start.
- **Score** — Only set explicitly for new forces. Reinforcements auto-increment.
- **Type** — force, connective_tissue, or behavioral_outcome
- **Connections** — For connective tissue: which forces does it link?

Present for user approval before storing. The summary is required — without it, the full description bloats session-start context.

## 5. Store

After user approves:

```bash
# New force
node $PLUGIN_ROOT/scripts/oxytocin-helper.js --insert \
  --title "<title>" \
  --description "<description>" \
  --summary "<one-sentence reasoning>" \
  --score <score> \
  --type "<force_type>"

# Reinforce existing (omit --score for auto +10)
node $PLUGIN_ROOT/scripts/oxytocin-helper.js --insert \
  --title "<exact existing title>" \
  --description "<updated description>" \
  --summary "<one-sentence reasoning>"

# Connective tissue with connections
node $PLUGIN_ROOT/scripts/oxytocin-helper.js --insert \
  --title "<title>" \
  --description "<description>" \
  --summary "<one-sentence reasoning>" \
  --type connective_tissue \
  --connections "Force A" "Force B" "Force C"
```

**Tier scale:** 80-100 = Always-on (loaded every session via PFC), 50-79 = Planning-mode (active during brainstorming), <50 = Deep context (archive).

## 6. Confirm

Report: what was stored, the type, the score, the tier, and that it will be reflected in the next prefrontal generation.
