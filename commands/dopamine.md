---
description: "Flag a behavioral moment — positive (nucleus accumbens) or negative (amygdala). Structured discussion, then store as a weighted lesson."
---

A deliberate "this moment matters" flag. A structured discussion about what just happened and why it matters.

**Routing:**
- `/dopamine +` — Something worked well. Brain file is **nucleus accumbens**. Still discuss the lesson in step 2.
- `/dopamine -` — Something burned us. Brain file is **amygdala**. Still discuss the lesson in step 2.
- `/dopamine` (bare) — Ask: "Was this a positive spike or a negative one?" Then route.

If the answer doesn't cleanly map to nucleus accumbens/amygdala (e.g., a decision rule or routing insight), step 2 determines the brain file.

Do all steps in order:

## 1. Reconstruct the Moment

Review the last 10-15 messages. Describe what happened: what was attempted, what went wrong or right, what the user's reaction was. Present this back for confirmation. Don't proceed until the user confirms the reconstruction is accurate.

## 2. Discuss the Lesson

What's the takeaway? The polarity (`+`/`-`) tells you where it goes, not why it matters. Discuss the lesson with the user.

If brain file is already set by `+` or `-`, focus on *what* the pattern or pain point was. If bare `/dopamine`, also determine which brain file:
- **amygdala** — A pain point. Something that burned us.
- **nucleus accumbens** — A pattern that worked. Something to reinforce.
- **prefrontal** — A decision rule. Something to check before acting.
- **hippocampus** — A routing insight. Where to look for something.

User refines, you adapt.

## 3. Categorize

Does this fit an existing domain/category in the lessons DB? Check:

```bash
node $PLUGIN_ROOT/scripts/dopamine-helper.js --lessons
```

If a match exists, state which one and why. If no match, propose a new domain and discuss where it belongs. Don't force-fit into existing categories.

## 4. Write the Entry

Collaboratively craft:
- **Title** — Short, scannable (2-5 words)
- **Entry text** — 1-2 line description matching brain-file format
- **Severity/confidence tag** — `critical`/`moderate`/`low` for amygdala, `proven`/`emerging` for nucleus accumbens
- **Domain tag** — The category this belongs to

Present the final entry for user approval before storing.

## 5. Store with Elevated Weight

After user approves, insert into the lessons table:

```bash
node $PLUGIN_ROOT/scripts/dopamine-helper.js --insert \
  --brain "<brain_file>" \
  --domain "<domain>" \
  --title "<title>" \
  --entry "<full entry text>" \
  --severity "<tag>"
```

Optional: `--weight <0-100>` to override the default increment. Use when the user specifies an exact weight.

This stores with weight = 50 (new) or +50 (reinforces existing, capped at 100). A single dopamine flag lands in Inclination tier. Two flags promote to Rule tier.

**Weight scale:** 75-100 = Rule (always loaded, directive), 50-74 = Inclination (always loaded, questionable), 25-49 = Awareness (on-demand), <25 = Data (background).

## 6. Confirm

Report: what was stored, which brain file, the weight, the tier it landed in, and that it's immediately available via `--surface`.
