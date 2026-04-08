---
doc_type: spec
date: 2026-04-07
status: in-flight
feature_area: thebrain-package/hippocampus

touches:
  files:
    - path: thebrain-package/hippocampus/scripts/spec-check.js
      mode: create
      spec_section: L199-L245
    - path: thebrain-package/hippocampus/lib/spec-check/schema.js
      mode: create
      spec_section: L229-L244
    - path: thebrain-package/hippocampus/lib/spec-check/walker.js
      mode: create
      spec_section: L229-L244
    - path: thebrain-package/hippocampus/lib/spec-check/yaml-parser.js
      mode: create
      spec_section: L229-L244
    - path: thebrain-package/hippocampus/lib/spec-check/frontmatter-parser.js
      mode: create
      spec_section: L229-L244
    - path: thebrain-package/hippocampus/lib/spec-check/collision-detector.js
      mode: create
      spec_section: L229-L244
    - path: thebrain-package/hippocampus/lib/spec-check/report-formatter.js
      mode: create
      spec_section: L229-L244
    - path: ~/.claude/rules/spec-management.md
      mode: create
      spec_section: L385-L434
    - path: thebrain-package/docs/tool-index.md
      mode: modify
      spec_section: L437-L468

  schema: []
  events:
    emits: []
    subscribes: []

depends_on: []
---

# Spec/Plan Cross-Check Tool — Design Spec

**Date:** 2026-04-07
**Feature area:** `thebrain-package/hippocampus/scripts/` + `~/.claude/rules/`
**Status:** Frontmatter added 2026-04-07 after Chunk 6 of the implementation plan shipped.

---

## Why this exists

As a project accumulates specs and plans, each one gets written, reviewed, and parked in a folder — individually well-designed, collectively blind to each other. Nothing surfaces when two specs modify the same file, two specs add columns to the same table, or one spec subscribes to an event that no spec or existing code actually emits. The collisions only become visible during plan execution, when Sonnet agents start editing the same lines and either conflict, drop changes, or silently diverge from what was designed.

Concrete examples from drip's current state (as of 2026-04-07):

- `inbox-lifecycle-redesign` (proposed) and `spec-b-project-management` (in-flight) both modify `drip/features/projects/routes.js` — inbox-lifecycle adds event emits to routes that spec-b is actively rewriting.
- `forums-design` (proposed) and `inbox-lifecycle-redesign` (proposed) both modify `drip/frontend/src/components/Workspace.svelte` — forums adds sidebar navigation, inbox-lifecycle adds inbox row navigation wiring.
- `inbox-lifecycle-redesign` subscribes to `project.thread_linked` — which no current spec or existing code definitively owns the emit side of.

None of these are caught by any tooling. Each spec was written in its own session with awareness only of its own scope. The collisions exist as latent bugs in the design phase, waiting to cost engineering time during implementation.

This tool:

1. **Forces specs and plans to declare their impact surface** in machine-readable YAML frontmatter — which files they touch, which schema they modify, which events they emit or subscribe to, which other docs they depend on.
2. **Cross-checks the entire collection** of docs in a folder against each other, surfacing collisions in a two-section report: a human-readable summary with resolution hints, and a Claude-readable index with line-number references for token-cheap follow-up reads.
3. **Stays layout-agnostic and doc-type-agnostic** — works on any folder structure (`docs/superpowers/specs/`, `planning/`, anything), handles both specs and plans identically, checks collisions across document types (a plan in flight can collide with a proposed spec).
4. **Leaves resolution to humans.** The tool detects. People decide whether to merge specs, sequence them, split them, or coordinate manually.

---

## Design philosophy

- **Layout-agnostic.** No hardcoded folder names. The script takes `--dir <path>` (repeatable) and walks recursively. Whether a project uses `docs/superpowers/specs/`, `design/`, or a flat `planning/` folder is the project's business.
- **Doc-type-agnostic.** Specs and plans share the same frontmatter schema plus two small differentiators (`doc_type` and a plan-only `implements` field). The tool checks collisions across all documents in scope regardless of type.
- **Lazy schema loading.** The full schema is not inlined in any always-loaded rule file. It lives inside the script itself and is fetched on demand via `--schema` or `--template`. Session start cost is a small signpost rule file (~40 lines) pointing at the script; the full schema (~200+ lines with examples) is only loaded into a session when Claude is actually writing a spec or plan.
- **Token-cheap structured output.** The report's Claude-readable section includes file paths with line ranges so a follow-up Read can target the exact relevant slice of a spec instead of the whole file. Inherits the brain's existing philosophy for structured output.
- **Human + Claude dual-format output.** Human summary leads with narrative ("Specs X and Y both touch `features/projects/routes.js` — review both and coordinate"). Claude-readable index follows with structured key/value data suitable for programmatic follow-up. Same run, both audiences served.
- **Detection, not resolution.** The tool surfaces collisions. It does not merge specs, propose resolutions, or make decisions. Human judgment stays in the loop.
- **No AI/LLM fuzzy matching.** All checks are deterministic YAML parses and set intersections. No model calls, no probabilistic detection. Reliable, cheap, fast.

---

## Scope

### In v1

- **Script**: `thebrain-package/hippocampus/scripts/spec-check.js`
- **CLI flags**: `--dir <path>` (repeatable), `--schema`, `--template spec|plan`, `--strict`
- **Frontmatter parser**: reads YAML frontmatter from `.md` files, validates against the schema, reports validation errors with file and line context
- **Collision detectors**: files (with optional line-range precision), schema tables, event emit/subscribe graph (dangling subscribes + same-file double-emits), `depends_on` ordering
- **Output formatter**: two-section report, human summary + Claude-readable index with line-number references
- **Rule file**: `~/.claude/rules/spec-management.md` (~40 lines, signpost only)
- **Brain integration**: entry in `thebrain-package/docs/tool-index.md` → regenerated into `~/.claude/rules/brain-tools.md` at session start
- **Bootstrap**: this spec becomes the first spec in `thebrain-package/docs/specs/`; once the tool ships, this spec gets retroactive frontmatter

### Out of v1 (deferred to follow-up work)

- **PreToolUse hook** on `Write` in `~/.claude/settings.json` — path-based detection of spec/plan filenames that injects the template at write time. The rule-file-plus-tool approach is the minimum viable mechanism; the hook is belt-and-suspenders reinforcement once we've observed whether Claude reliably fetches the template under rule discretion alone. Phase 2.
- **Incremental scanning / cache layer** — the v1 script re-parses every doc on every run. Fine at current scale (4 specs per project) but worth revisiting if a project accumulates dozens of specs and scan time becomes noticeable.
- **Auto-resolution suggestions** — the tool reports collisions but does not propose fixes. Future versions could emit "sequence hints" based on `depends_on` graphs or "merge hints" based on overlap density.
- **Brain-wide multi-project scan** — convenience wrapper like `--all-known-projects` that iterates across every brain-registered project's spec folder. Not v1; add only if the cross-project collision use case becomes real.
- **Integration with writing-plans skill** — automatic pre-plan gate that runs the check before invoking plan writing. The rule file describes the workflow; automatic gating is future work.

### Not in any version (deliberate non-goals)

- **Fuzzy matching or semantic similarity.** Two specs describing overlapping concepts in different words is a human-review problem, not a tool problem. Semantic detection would produce false positives and erode trust.
- **Schema enforcement of spec body content.** The frontmatter is enforced; the spec's narrative text is not. A spec can be any length, any structure, any voice — the tool only reads the frontmatter block.
- **Automatic spec/plan rewriting.** The tool does not modify documents. It reads and reports. Any fixes are manual.
- **Opinions on folder structure.** The tool does not care whether specs and plans live in the same folder, separate folders, or scattered across multiple paths. `--dir` is the only input; `doc_type` in frontmatter is the source of truth for what each doc is.

---

## Frontmatter schema

The canonical schema. Every spec and plan gets a YAML frontmatter block at the top of the file, delimited by `---` on its own lines.

### Required fields

```yaml
---
doc_type: spec                        # spec | plan
date: YYYY-MM-DD
status: proposed                      # proposed | in-plan | in-flight | shipped
feature_area: <short-path-or-label>   # e.g. features/alerts, or "cross-cutting"
---
```

Doc ids are the filename stem (everything after any date prefix, minus the `.md` extension). Cross-references in `depends_on` and `implements` use this stem directly.

### Required arrays (may be empty, but must be present)

```yaml
touches:
  files: []
  schema: []
  events:
    emits: []
    subscribes: []
depends_on: []
```

### `touches.files` entries

Each entry describes a file the doc expects to create, modify, or delete:

```yaml
touches:
  files:
    - path: features/alerts/events.js
      mode: modify                    # create | modify | delete
      spec_section: L145-L171         # where in THIS doc the rationale lives
      source_lines: null              # optional — actual file line range, plan-writer often fills this
```

- `path` is a project-relative file path (no leading slash).
- `mode` is one of `create`, `modify`, `delete`.
- `spec_section` is a line range inside the current doc pointing at the section that describes this file's changes. Format: `L<start>-L<end>`. Required. Defaults to `L1-L<end>` (whole doc) if the author can't narrow it, but narrower is better for the Claude-readable index.
- `source_lines` is optional and usually null on specs. Plans typically fill this in because plan-writing resolves actual line numbers. Format: `L<start>-L<end>`.

### `touches.schema` entries

Each entry describes a database table change:

```yaml
touches:
  schema:
    - table: notifications
      change: add_columns             # create | add_columns | add_indexes | drop_column | drop_table | modify_constraint
      spec_section: L85-L105
    - table: notification_lifecycle_events
      change: create
      spec_section: L70-L85
```

- `table` is the table name (no schema prefix).
- `change` is one of `create`, `add_columns`, `add_indexes`, `drop_column`, `drop_table`, `modify_constraint`.
- `spec_section` is a line range inside the current doc.

### `touches.events.emits` entries

Each entry describes an event the doc plans to emit:

```yaml
touches:
  events:
    emits:
      - name: thread.renamed
        from_file: features/threads/routes.js
        spec_section: L160
```

- `name` is the event identifier as it will be passed to `eventBus.emit()`.
- `from_file` is the file the emit is added to. Used for same-file double-emit detection.
- `spec_section` is a line reference (single line or range) inside the current doc.

### `touches.events.subscribes` entries

Each entry describes an event the doc plans to subscribe to:

```yaml
touches:
  events:
    subscribes:
      - name: thread.flagged
        spec_section: L155
```

- `name` is the event identifier.
- `spec_section` is a line reference inside the current doc.

### `depends_on` entries

```yaml
depends_on:
  - doc: 2026-04-06-spec-b-project-management
    reason: "requires project_thread_links table to exist"
```

- `doc` is the filename stem of another doc in the collection (e.g., `2026-04-07-forums-design`).
- `reason` is a human-readable note describing what the dependency is for.

### Plan-only fields

Plans add one additional field:

```yaml
implements: inbox-lifecycle-redesign   # kebab-case id of the spec this plan implements
```

Plans that don't reference a spec (rare — e.g., maintenance plans) may omit this field.

### Field value conventions

- All line references use `L<n>` or `L<start>-L<end>` format (capital L, no spaces). Makes them grep-able and unambiguous.
- `status` transitions: `proposed` → `in-plan` → `in-flight` → `shipped`. Tool does not enforce transitions, but reports status mismatches (e.g. a dependent spec in `in-flight` whose dependency is still `proposed`).
- `feature_area` is free-form but should be consistent across related docs — used for grouping in the report.
- Kebab-case for all identifiers. No spaces, no underscores, no uppercase.

---

## Script architecture

### Location

`thebrain-package/hippocampus/scripts/spec-check.js`

Lives under hippocampus because it's design intelligence in the same family as hippocampus's code intelligence. Hippocampus knows what files exist and what they export; spec-check knows what specs exist and what they declare. Same conceptual layer, different subject matter.

### CLI interface

```bash
# scan a folder recursively for specs/plans
node thebrain-package/hippocampus/scripts/spec-check.js --dir <path>

# scan multiple folders (repeatable)
node spec-check.js --dir <path-a> --dir <path-b>

# print the canonical frontmatter schema
node spec-check.js --schema

# print a ready-to-fill template
node spec-check.js --template spec
node spec-check.js --template plan

# fail (exit 1) if headerless docs exist
node spec-check.js --dir <path> --strict
```

### Module structure

The script is decomposed into small, independently testable modules rather than one monolithic file:

```
thebrain-package/hippocampus/
  scripts/
    spec-check.js                    # CLI entry point, argument parsing, orchestration
  lib/
    spec-check/
      frontmatter-parser.js          # YAML frontmatter extraction + schema validation
      collision-detector.js          # pure functions: given parsed docs, return collisions
      report-formatter.js            # collision list → human + Claude-readable output
      schema.js                      # canonical schema definition + template generator
      walker.js                      # recursive file discovery
```

Each lib module has a focused responsibility, a pure interface, and can be unit-tested without touching the filesystem. The CLI entry point wires them together.

### Detection rules

**File collisions** — two or more docs declare `touches.files` entries with the same `path`. Reported as a collision. If both entries include `source_lines` line ranges AND those ranges don't overlap, reported as a soft warning ("same file, non-overlapping ranges — coordinate but unlikely to conflict"). If `source_lines` is missing on either, reported as a hard warning ("same file, line ranges not declared — review required").

**Schema collisions** — two or more docs declare `touches.schema` entries with the same `table`. Always a hard warning. SQLite migrations are ordered and fragile; any two docs touching the same table must be sequenced explicitly.

**Dangling subscribes** — a doc declares `touches.events.subscribes` for an event name, but no doc in scope declares a matching `touches.events.emits` AND the event name isn't found in the existing codebase (a grep for `eventBus.emit('<name>')`). Reported as a warning. Can false-positive if the codebase already emits the event but the grep misses it — expected and acceptable.

**Same-file double-emits** — two or more docs declare `touches.events.emits` entries with the same `from_file` AND the same `name`. Reported as a hard warning.

**Dependency order violations** — a doc's `depends_on` lists another doc whose `status` is less advanced than the dependent's. E.g., an `in-plan` doc depending on a `proposed` doc. Reported as an info-level notice.

**Headerless docs** — any `.md` file found in scope that has no YAML frontmatter block. Reported separately in the report's "Headerless docs" section. With `--strict`, causes the script to exit non-zero.

### Deliberately NOT detected (rationale)

- **Same event with multiple subscribers** — not a conflict. Multiple handlers for the same event is legitimate event-bus pattern.
- **Endpoint collisions** — redundant with file collisions. If two docs both add a `POST /foo` route in the same file, the files collision catches it.
- **Component collisions** — redundant with file collisions. Svelte components are files.
- **Dependency cycles** — the `depends_on` graph *could* be checked for cycles, but cycles are extremely unlikely in practice and not worth the implementation complexity in v1.

---

## Output format

Two sections in the report, always in the same order, always both present (even if one is empty).

### Example output

```
=== SPEC CHECK ===
Scanned: 2 folders, 7 docs

Docs found:
  ✓ forums-design                [spec,  proposed,  389 lines]
  ✓ inbox-lifecycle-redesign     [spec,  proposed,  390 lines]
  ⚠ spec-b-project-management    [HEADERLESS, 2441 lines]
  ✓ spec-d-emoji-reactions       [spec,  shipped,   1271 lines]
  ✓ spec-d-implementation-plan   [plan,  shipped,   1271 lines]  → implements: spec-d-emoji-reactions
  ✓ spec-cross-check-tool-design [spec,  proposed,  <n> lines]
  ⚠ 2026-04-06-some-old-spec     [HEADERLESS, 180 lines]

=== HEADERLESS DOCS — need frontmatter before check can be trusted ===

[H1] drip/docs/superpowers/plans/2026-04-06-spec-b-project-management.md
[H2] drip/docs/other/2026-04-06-some-old-spec.md

=== HUMAN SUMMARY ===

3 collisions detected:

[C1] File — features/projects/routes.js (hard)
    inbox-lifecycle-redesign  declares modify
      spec section: L145-L171 ("Event wiring")
      source lines: not declared
    spec-b-project-management declares modify
      spec section: L2183-L2240 ("Chunk 5")
      source lines: not declared
    Impact: both docs add event emits to this file. Without source line ranges, physical overlap cannot be
            ruled out. Review both sections and coordinate emit additions before planning inbox-lifecycle.

[C2] File — frontend/src/components/Workspace.svelte (hard)
    forums-design             declares modify
      spec section: L156-L190 ("Sidebar Forums tree")
    inbox-lifecycle-redesign  declares modify
      spec section: L230-L265 ("Rendering & navigation")
    Impact: both wire new navigation handlers into Workspace. Sequencing suggestion: forums-design does not
            declare a depends_on, inbox-lifecycle-redesign depends on spec-b-project-management — ship
            forums first when spec-b ships, then inbox-lifecycle.

[C3] Dangling subscribe — project.thread_linked (warning)
    Subscribed by: inbox-lifecycle-redesign
      spec section: L201
    Emitted by: none detected in specs or existing code
    Impact: inbox-lifecycle plans must include the emit wiring, OR confirm another doc owns the emit.

Dependency ordering:
  inbox-lifecycle-redesign depends on [spec-b-project-management]
    status: spec-b-project-management is HEADERLESS (cannot verify status)
    action: add frontmatter to spec-b-project-management before planning inbox-lifecycle

=== CLAUDE-READABLE INDEX ===

docs:
  forums-design: drip/docs/superpowers/specs/2026-04-07-forums-design.md
  inbox-lifecycle-redesign: drip/docs/superpowers/specs/2026-04-07-inbox-lifecycle-redesign.md
  spec-b-project-management: drip/docs/superpowers/plans/2026-04-06-spec-b-project-management.md

conflicts.files:
  features/projects/routes.js:
    - doc: inbox-lifecycle-redesign
      spec_section: L145-L171
    - doc: spec-b-project-management
      spec_section: L2183-L2240
  frontend/src/components/Workspace.svelte:
    - doc: forums-design
      spec_section: L156-L190
    - doc: inbox-lifecycle-redesign
      spec_section: L230-L265

conflicts.schema: []

conflicts.events.dangling_subscribes:
  project.thread_linked:
    subscribers:
      - doc: inbox-lifecycle-redesign
        spec_section: L201

conflicts.events.double_emits: []

dependency_graph:
  inbox-lifecycle-redesign:
    depends_on: [spec-b-project-management]
    status: proposed
  forums-design:
    depends_on: []
    status: proposed
  spec-d-implementation-plan:
    implements: spec-d-emoji-reactions
    status: shipped

headerless:
  - path: drip/docs/superpowers/plans/2026-04-06-spec-b-project-management.md
    lines: 2441
  - path: drip/docs/other/2026-04-06-some-old-spec.md
    lines: 180

exit_code: 0
```

### Design notes for the output

- **Human summary leads with narrative.** Each collision gets a `[C<n>]` identifier for easy reference, a severity tag (`hard`, `warning`, `info`), the docs involved, their spec sections, and a plain-English impact assessment with a resolution hint.
- **Claude-readable index is pure structured data.** YAML-ish format that's easy for Claude to parse mentally. Every entry includes file paths with line ranges so Claude can `Read` the exact relevant slice without loading whole docs.
- **The `docs:` block at the top of the Claude-readable section maps spec identifiers to file paths.** Lets Claude look up a doc by name without re-searching the filesystem.
- **Exit code** is 0 if only info/warnings are present, non-zero if hard collisions or (with `--strict`) headerless docs are present. Enables CI or pre-plan gating later.

---

## Rule file — `~/.claude/rules/spec-management.md`

A short rule file (~40 lines, loaded at session start via the brain's standard rule-loading path) that establishes the workflow and points at the script. Does NOT inline the schema — the schema is fetched lazily via `spec-check.js --schema` only when Claude is actually writing a spec or plan.

### Rough structure

```markdown
# Spec & Plan Management

When you are writing a spec or plan document, or about to invoke plan writing
on an existing spec, follow this workflow.

## Frontmatter is required

Every spec and every plan must have a YAML frontmatter block at the top of the
file. The canonical schema is published by the script — not inlined here, so
this rule file stays small.

Before writing a new spec or plan, run:

    node thebrain-package/hippocampus/scripts/spec-check.js --template spec
    node thebrain-package/hippocampus/scripts/spec-check.js --template plan

Copy the template verbatim into the new file and fill it in honestly.

## Cross-check before planning

Before invoking writing-plans on any spec, cross-check the full collection of
specs and plans in the project's design folder:

    node thebrain-package/hippocampus/scripts/spec-check.js --dir <path>

The script reports collisions between docs (files, schema, events) and
dependency-order issues. Resolve any hard collisions before proceeding with
plan writing. Warnings and info notices are for human judgment.

## Headerless docs

Older specs and plans written before this tool existed will be flagged as
headerless. The fix is to add frontmatter — the script's --template output is
the starting point. Don't plan around a headerless doc; fix it first.

## Script reference

See `~/.claude/rules/brain-tools.md` for full script documentation and flags.
Regenerated on every session start from `thebrain-package/docs/tool-index.md`.
```

The rule file's job is to teach Claude *that* the tool exists, *when* to use it, and *where* to look up details — not to BE the reference.

---

## Brain integration — `tool-index.md` entry

A new section added to `thebrain-package/docs/tool-index.md`. On wrapup, the brain's regeneration script (`pfc-trim.js` or the broader wrapup mechanical script) walks `tool-index.md` and produces `~/.claude/rules/brain-tools.md` with the full tool catalog. The spec-check entry is just another section in that catalog.

### Section draft

```markdown
## Spec / Plan Cross-Check (~variable tokens)

Cross-checks specs and plans in a folder for collisions before planning commits
engineering effort. Detects file overlaps, schema collisions, dangling event
subscribes, same-file double-emits, and dependency-order violations. Produces a
two-section report (human summary + Claude-readable index) with line-range
references for token-cheap follow-up reads.

    node thebrain-package/hippocampus/scripts/spec-check.js <command>

| Flag | What it does |
|------|-------------|
| --dir <path> | Scan a folder recursively for specs/plans. Repeatable. |
| --schema | Print the canonical frontmatter schema. |
| --template spec\|plan | Print a ready-to-fill frontmatter template. |
| --strict | Exit non-zero if headerless docs are present. |

**When to use:** before invoking `writing-plans` on a new spec, to catch
overlap with other in-flight or proposed work. Also useful when adding a new
spec to an already-busy folder — run the check to verify the new doc doesn't
step on existing work.

**Paths** are anything — the tool is layout-agnostic. Works on
`docs/superpowers/specs/`, `docs/design/`, `planning/`, or anywhere else a
project parks its design docs.
```

---

## Phase 2 — PreToolUse hook (deferred)

A `PreToolUse` hook on the `Write` tool in `~/.claude/settings.json`. When Claude is about to `Write` a file, the hook inspects the intended path:

- If path matches `**/specs/**/*.md` or `**/plans/**/*.md` AND filename matches a date-prefixed pattern like `YYYY-MM-DD-*.md`, the hook fires.
- The hook runs `spec-check.js --template <spec|plan>` and injects the output into Claude's context at write time via the hook's stdin/stdout protocol.
- Claude sees the template immediately before writing and has no opportunity to "forget" to fetch it.

This is strictly additive to the rule-file-plus-tool approach. The rule file establishes the workflow and lets Claude fetch templates under discretion. The hook removes the discretion. Ship the rule-based version first; add the hook if we observe Claude skipping the template fetch in practice.

**Why not v1:** hooks add configuration surface and settings.json complexity. The minimum viable mechanism is the rule + tool. Observing the failure rate of rule-discretion in practice will tell us whether the hook investment is needed.

**Reference vs. title problem:** Claude writing "see the inbox-lifecycle spec" inside an unrelated file doesn't match the path pattern, so the hook never fires for pure references. Path-based detection handles this cleanly without needing prompt inspection.

---

## Implementation notes for the plan-writer

When the implementation plan is written from this spec, follow these rules.

### 1. No plan chunk exceeds 1000 lines of code changes

Per the standard `websites/CLAUDE.md` rule for plans. Subdivide any chunk that would exceed 1000 lines into sub-chunks of ≤1000 lines each, each leaving the codebase in a working state.

Likely chunk shape (the plan-writer will refine):

- **Chunk 1 — Schema + walker + frontmatter parser.** `lib/spec-check/schema.js` (canonical schema + template generator), `lib/spec-check/walker.js` (recursive file discovery), `lib/spec-check/frontmatter-parser.js` (YAML extraction + validation). Unit tests for each module independently.
- **Chunk 2 — Collision detector.** `lib/spec-check/collision-detector.js` with one pure function per detection rule (file collisions, schema collisions, dangling subscribes, double-emits, dependency ordering). Pure function interface means each detector can be tested with synthetic doc arrays — no filesystem or parsing involved.
- **Chunk 3 — Report formatter.** `lib/spec-check/report-formatter.js` — takes the output of the collision detector and produces the two-section report. Human summary rendering and Claude-readable index rendering are separate functions.
- **Chunk 4 — CLI entry point.** `scripts/spec-check.js` — argument parsing, orchestration, `--schema`/`--template`/`--dir`/`--strict` wiring, exit code logic.
- **Chunk 5 — Rule file + tool-index entry + retroactive frontmatter.** Create `~/.claude/rules/spec-management.md`. Add the spec-check section to `thebrain-package/docs/tool-index.md`. Add YAML frontmatter to this very spec (`thebrain-package/docs/specs/2026-04-07-spec-cross-check-tool-design.md`) — bootstrap complete.

The plan-writer should compute actual line counts per chunk from the real files at plan-writing time and subdivide where needed.

### 2. The plan ends with copyable per-chunk handoff prompts

Per the standard plan structure rule in `websites/CLAUDE.md`. Each handoff prompt must:

- Be a complete, self-contained brief that a freshly-spawned Sonnet agent can act on without reading the full plan file.
- Specify the chunk's goal in 1-2 sentences.
- Include targeted file references with line ranges for every file the agent must read, formatted as `path/to/file.ext:start-end`.
- Reference the plan file with the specific line range for that chunk's section.
- List the files the agent must create or modify.
- State the test gate that proves the chunk is done.
- Explicitly note that the agent should NOT restart services or claim verification — it should describe what changed and what the user needs to test.

### 3. Modularity discipline

Per `websites/CLAUDE.md`'s modularity principle. The script's lib modules must be small and independently testable. If a module starts growing past ~300 lines or starts absorbing unrelated responsibilities, split it. The frontmatter parser must not know about collision detection; the collision detector must not know about report rendering; the report formatter must not know about file walking. Clean boundaries.

### 4. Testing

Each lib module gets unit tests alongside it (`frontmatter-parser.test.js`, `collision-detector.test.js`, etc.) using the Node built-in test runner, matching drip's convention. Integration tests at the CLI level verify end-to-end behavior on a synthetic folder of test docs.

### 5. Bootstrap finalization

Chunk 5's "retroactive frontmatter on this spec" step is how the bootstrap closes. Until that step, this spec is headerless and the script will report it as such on its first run. After that step, the spec is compliant with its own schema and the headerless list is empty.

---

## Open questions for plan-writing

- **Which YAML parser to use?** Node has no built-in YAML parser. Options: add a dependency (`js-yaml`), write a minimal hand-rolled parser for the frontmatter subset we use, or use a WASM-compiled parser. Plan-writer should evaluate the tradeoff — `js-yaml` is the obvious choice but adds a dependency to `thebrain-package`.
- **Do we need file-watching / live mode?** A future `--watch` flag that re-runs the check when any spec in scope changes. Useful during active design sessions but non-trivial to implement. Not v1; evaluate if needed.
- **How should the script handle deeply nested directory structures?** `--dir` walks recursively, but at what depth? Infinite depth is simplest but could be slow on unrelated folders. A `--max-depth N` flag could cap it. Defer unless performance issues arise.
- **Does the `from_file` field on event emits need validation against the `touches.files` list?** E.g., if a doc declares it emits `thread.renamed` from `features/threads/routes.js`, should the schema validator insist that `features/threads/routes.js` also appears in the doc's `touches.files` entries? Probably yes — it's a consistency check — but worth flagging as an explicit plan-writer decision.
- **What should `--schema` output look like exactly?** YAML-as-text with inline comments explaining each field? A JSON Schema document? A commented example? Plan-writer should settle this based on what's most useful for Claude to consume when fetching the schema on demand.
