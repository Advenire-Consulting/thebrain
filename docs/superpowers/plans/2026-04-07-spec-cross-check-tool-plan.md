---
doc_type: plan
date: 2026-04-07
status: proposed
feature_area: thebrain-package/hippocampus
implements: 2026-04-07-spec-cross-check-tool-design

touches:
  files:
    - path: thebrain-package/hippocampus/lib/spec-check/schema.js
      mode: create
      spec_section: L150-L531
    - path: thebrain-package/hippocampus/lib/spec-check/schema.test.js
      mode: create
      spec_section: L150-L531
    - path: thebrain-package/hippocampus/lib/spec-check/walker.js
      mode: create
      spec_section: L150-L531
    - path: thebrain-package/hippocampus/lib/spec-check/walker.test.js
      mode: create
      spec_section: L150-L531
    - path: thebrain-package/hippocampus/lib/spec-check/yaml-parser.js
      mode: create
      spec_section: L532-L1099
    - path: thebrain-package/hippocampus/lib/spec-check/yaml-parser.test.js
      mode: create
      spec_section: L532-L1099
    - path: thebrain-package/hippocampus/lib/spec-check/frontmatter-parser.js
      mode: create
      spec_section: L532-L1099
    - path: thebrain-package/hippocampus/lib/spec-check/frontmatter-parser.test.js
      mode: create
      spec_section: L532-L1099
    - path: thebrain-package/hippocampus/lib/spec-check/collision-detector.js
      mode: create
      spec_section: L1100-L1456
    - path: thebrain-package/hippocampus/lib/spec-check/collision-detector.test.js
      mode: create
      spec_section: L1100-L1456
    - path: thebrain-package/hippocampus/lib/spec-check/report-formatter.js
      mode: create
      spec_section: L1457-L1656
    - path: thebrain-package/hippocampus/lib/spec-check/report-formatter.test.js
      mode: create
      spec_section: L1457-L1656
    - path: thebrain-package/hippocampus/lib/spec-check/chunk-extractor.js
      mode: create
      spec_section: L1657-L2480
    - path: thebrain-package/hippocampus/lib/spec-check/chunk-extractor.test.js
      mode: create
      spec_section: L1657-L2480
    - path: thebrain-package/hippocampus/scripts/spec-check.js
      mode: create
      spec_section: L1657-L2480
    - path: thebrain-package/hippocampus/scripts/spec-check.test.js
      mode: create
      spec_section: L1657-L2480
    - path: ~/.claude/rules/spec-management.md
      mode: create
      spec_section: L2481-L2799
    - path: thebrain-package/docs/tool-index.md
      mode: modify
      spec_section: L2481-L2799
    - path: thebrain-package/docs/superpowers/specs/2026-04-07-spec-cross-check-tool-design.md
      mode: modify
      spec_section: L2481-L2799

  schema: []
  events:
    emits: []
    subscribes: []

depends_on: []
---

# Spec/Plan Cross-Check Tool — Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax. The user has opted out of subagent-driven implementation — work each chunk in the current session. The user manages all commits independently. **Do NOT read entire files unless this plan explicitly asks you to** — each chunk lists specific file:line ranges to read first. Reading whole files burns context unnecessarily. **Do NOT restart services or claim verification** — describe what changed and what the user needs to test.

**Goal:** Build `spec-check.js` — a dependency-free Node CLI that parses YAML frontmatter from spec/plan markdown files, cross-checks them for collisions (file overlaps, schema clashes, dangling event subscribes, same-file double-emits, dependency-order violations), and emits a two-section report (human narrative + Claude-readable index with line refs). Ships with a rule file at `~/.claude/rules/spec-management.md` and a tool-index entry that regenerates into `~/.claude/rules/brain-tools.md` on wrapup. Bootstrap closes by adding frontmatter to this plan's own source spec as the final chunk.

**Architecture:** Six focused lib modules under `thebrain-package/hippocampus/lib/spec-check/`, wired together by a CLI entry point at `thebrain-package/hippocampus/scripts/spec-check.js`. Pure-function interfaces throughout — each detector, parser, and renderer takes data in and returns data out, no hidden state, no filesystem coupling below the walker. Hand-rolled YAML subset parser keeps the package dependency-free.

**Tech Stack:** Node.js (built-in `test` runner, `fs/promises`, `path`). Zero npm dependencies. Target Node ≥18 for stable built-in test runner.

---

## Architecture decisions (locked from spec + 2026-04-07 design discussion)

1. **Hand-rolled YAML subset parser.** No `js-yaml` dependency. The frontmatter schema uses a narrow, well-defined subset (flat scalars, nested maps one-to-two levels deep, lists of maps, lists of scalars, quoted and unquoted strings, `null`, `[]`). A focused hand-rolled parser (~250 lines) is maintainable and keeps `thebrain-package` dep-free. Rejected: `js-yaml` (adds a runtime dep to a package that has none), WASM YAML (overkill).

2. **`from_file` must appear in `touches.files`.** The frontmatter validator enforces that every `touches.events.emits[*].from_file` value also appears as a `path` in the doc's `touches.files` list. Catches the common oversight of "I added an emit but forgot to list the file I'm editing." Cheap, deterministic, high-signal.

3. **Collapse `--schema` and `--template` into `--template spec|plan`.** The spec originally defined two flags — `--schema` for reference documentation and `--template` for a starter block. Simplified to one flag. The template output is commented enough to serve as both. Surface-area reduction; less to maintain.

4. **Drop the `spec:` frontmatter field. Id = filename stem.** Originally the schema required a `spec:` field as the doc's unique identifier. Redundant with the filename — `depends_on` and `implements` now reference docs by filename stem (e.g., `2026-04-07-spec-cross-check-tool-design`). Single source of truth, no sync risk. The nested `spec:` field inside `depends_on` entries is renamed to `doc:` for consistency with the Claude-readable index output format. Chunk 6 retroactively amends the source spec's schema section to reflect this.

5. **Lib modules live under `hippocampus/lib/spec-check/`, CLI lives under `hippocampus/scripts/`.** Matches the existing hippocampus convention where `scripts/` holds CLI entry points and libs live beside them. Each lib module is small (<300 lines), pure, and independently unit-testable.

6. **Walker does NOT follow symlinks.** Avoids infinite loops via self-referential symlinks (the brain is now using symlinks in the plugin cache; defensive default). Hidden directories (`.git`, `node_modules`, dotfiles) are skipped.

7. **Integration test uses a synthetic fixture folder.** Chunk 5's end-to-end test builds a temp folder with 3-4 test spec files covering each collision type, runs the full pipeline, and asserts against expected output. No reliance on real project specs — keeps the test hermetic.

8. **Bootstrap sequencing.** This plan's own file is the first compliant artifact. The spec it implements is currently headerless by design (the spec defines what frontmatter is). Chunk 6 adds frontmatter to the spec, amends the schema section to drop `spec:`, and on that chunk's completion the tool's first real run reports zero headerless docs in `thebrain-package/docs/superpowers/`.

9. **Test runner:** Node built-in (`node --test`). Drip uses this. Zero setup, zero dependencies.

10. **Exit codes:**
    - `0` — only info/warnings, no hard collisions.
    - `1` — hard collisions detected.
    - `2` — with `--strict`, headerless docs found.
    - `3` — argument error or unreadable path.

---

## File structure overview

```
thebrain-package/hippocampus/
├── lib/
│   └── spec-check/
│       ├── schema.js                    # canonical schema + template generator
│       ├── schema.test.js
│       ├── walker.js                    # recursive .md discovery, symlink-safe
│       ├── walker.test.js
│       ├── yaml-parser.js               # hand-rolled subset parser
│       ├── yaml-parser.test.js
│       ├── frontmatter-parser.js        # extract frontmatter block + validate
│       ├── frontmatter-parser.test.js
│       ├── collision-detector.js        # pure functions per detection rule
│       ├── collision-detector.test.js
│       ├── report-formatter.js          # human summary + Claude-readable index
│       └── report-formatter.test.js
└── scripts/
    ├── spec-check.js                    # CLI entry point
    └── spec-check.test.js               # end-to-end integration tests
```

**Files touched outside hippocampus (Chunk 6):**
- `~/.claude/rules/spec-management.md` (create)
- `thebrain-package/docs/tool-index.md` (modify — add spec-check section)
- `thebrain-package/docs/superpowers/specs/2026-04-07-spec-cross-check-tool-design.md` (modify — add frontmatter, strike `spec:` field from schema section, rename `spec:` → `doc:` inside `depends_on` examples)

---

## Pre-flight

Before Chunk 1:

- Confirm `thebrain-package/hippocampus/` exists and has existing `scripts/` and (probably) `lib/`.
- Confirm Node version ≥18 (`node --version`).
- Baseline test count: `cd thebrain-package && node --test hippocampus/lib/ 2>&1 | tail -5` — record the current pass count. Each chunk grows it.

---

## Chunk 1 — Scaffolding, walker, schema/template generator

**Goal:** Land the `lib/spec-check/` directory with two standalone modules: `walker.js` (recursive `.md` file discovery) and `schema.js` (canonical schema definition + `--template` generator). Both are pure, both have unit tests, neither depends on any other spec-check module yet. After Chunk 1, you can call `walkSpecDir(path)` and get back an array of `.md` file paths, and you can call `renderTemplate('spec')` / `renderTemplate('plan')` and get back a ready-to-paste frontmatter block.

**Non-goals (do NOT do these — they belong to other chunks or are explicitly out of scope):**

- Do NOT write any YAML parsing or frontmatter extraction logic — that is Chunk 2's scope.
- Do NOT write any collision detection logic — that is Chunk 3's scope.
- Do NOT write any report rendering — that is Chunk 4's scope.
- Do NOT write the CLI entry point or argument parsing — that is Chunk 5's scope.
- Do NOT add npm dependencies. Node built-ins only (`fs/promises`, `path`, `node:test`, `node:assert/strict`).
- Do NOT extend the `SCHEMA` object beyond the fields shown in this chunk — no speculative future fields.
- Do NOT refactor unrelated hippocampus files you happen to glance at while working.
- Do NOT add type annotations, JSDoc, or TypeScript — plain-language one-line comments only, per `websites/CLAUDE.md`.

**Read first (line ranges only — do not read whole files):**

- `thebrain-package/docs/superpowers/specs/2026-04-07-spec-cross-check-tool-design.md:72-196` — the frontmatter schema section. This is the source of truth for what `schema.js` encodes.
- `thebrain-package/hippocampus/scripts/query.js:1-30` — existing hippocampus CLI entry style (for future reference when writing `spec-check.js` in Chunk 5).

**Touched files:**
- Create: `thebrain-package/hippocampus/lib/spec-check/schema.js`
- Create: `thebrain-package/hippocampus/lib/spec-check/schema.test.js`
- Create: `thebrain-package/hippocampus/lib/spec-check/walker.js`
- Create: `thebrain-package/hippocampus/lib/spec-check/walker.test.js`

### Task 1.1: Create `schema.js`

- [ ] **Step 1: Write the module.**

Create `thebrain-package/hippocampus/lib/spec-check/schema.js`. It exports three things:

1. `SCHEMA` — a plain JS object describing every field's type, whether it's required, and its valid values. Used by the frontmatter parser's validator in Chunk 2.
2. `renderTemplate(docType)` — returns a commented YAML frontmatter string for `'spec'` or `'plan'`. Throws on any other value.
3. `getValidTypes()` — returns the list of valid doc types (`['spec', 'plan']`).

The schema object (canonical — matches the spec with decisions 2, 3, 4 applied):

```js
const SCHEMA = {
  required: {
    doc_type: { type: 'enum', values: ['spec', 'plan'] },
    date: { type: 'date' },
    status: { type: 'enum', values: ['proposed', 'in-plan', 'in-flight', 'shipped'] },
    feature_area: { type: 'string' },
  },
  requiredArrays: {
    'touches.files': {
      itemShape: {
        path: { type: 'string', required: true },
        mode: { type: 'enum', values: ['create', 'modify', 'delete'], required: true },
        spec_section: { type: 'line_ref', required: true },
        source_lines: { type: 'line_ref', required: false, nullable: true },
      },
    },
    'touches.schema': {
      itemShape: {
        table: { type: 'string', required: true },
        change: { type: 'enum', values: ['create', 'add_columns', 'add_indexes', 'drop_column', 'drop_table', 'modify_constraint'], required: true },
        spec_section: { type: 'line_ref', required: true },
      },
    },
    'touches.events.emits': {
      itemShape: {
        name: { type: 'string', required: true },
        from_file: { type: 'string', required: true },
        spec_section: { type: 'line_ref', required: true },
      },
    },
    'touches.events.subscribes': {
      itemShape: {
        name: { type: 'string', required: true },
        spec_section: { type: 'line_ref', required: true },
      },
    },
    'depends_on': {
      itemShape: {
        doc: { type: 'string', required: true },
        reason: { type: 'string', required: true },
      },
    },
  },
  planOnly: {
    implements: { type: 'string', required: false },
  },
};
```

The `renderTemplate(docType)` function returns a string like this (for `'spec'`):

```yaml
---
# Every spec and plan needs this block. Fill in every field.
# Cross-reference other docs by their filename stem (no .md, no date prefix stripping).

doc_type: spec                          # spec | plan
date: 2026-04-07                        # YYYY-MM-DD
status: proposed                        # proposed | in-plan | in-flight | shipped
feature_area: features/your-area        # short path or label

touches:
  files:
    # Every file this doc creates, modifies, or deletes.
    - path: path/to/file.js             # project-relative, no leading slash
      mode: modify                      # create | modify | delete
      spec_section: L120-L160           # where in THIS doc the rationale lives (format: L<start>-L<end>)
      source_lines: null                # optional — fill in at plan time if known

  schema:
    # Every database table change.
    # - table: your_table
    #   change: add_columns             # create | add_columns | add_indexes | drop_column | drop_table | modify_constraint
    #   spec_section: L200-L215
    []

  events:
    emits:
      # Events this doc plans to emit. `from_file` MUST appear in touches.files above.
      # - name: your.event.name
      #   from_file: path/to/emitter.js
      #   spec_section: L250
      []
    subscribes:
      # Events this doc plans to subscribe to.
      # - name: other.event.name
      #   spec_section: L270
      []

depends_on:
  # Other specs/plans this one depends on. Reference by filename stem.
  # - doc: 2026-04-06-other-spec-name
  #   reason: "requires X table to exist"
  []
---
```

For `'plan'`, the same template but with `doc_type: plan` and an extra field after `feature_area`:

```yaml
implements: 2026-04-07-your-spec-name   # filename stem of the spec this plan implements
```

Add a plain-language comment at the top of `schema.js` describing its responsibility. Add a one-line plain-language comment above every exported function and the `SCHEMA` object.

- [ ] **Step 2: Write `schema.test.js`.**

Create `thebrain-package/hippocampus/lib/spec-check/schema.test.js`. Use Node's built-in test runner.

```js
// Unit tests for the canonical frontmatter schema and template generator.
const test = require('node:test');
const assert = require('node:assert/strict');
const { SCHEMA, renderTemplate, getValidTypes } = require('./schema.js');

test('getValidTypes returns both doc types', () => {
  assert.deepEqual(getValidTypes(), ['spec', 'plan']);
});

test('renderTemplate spec returns a frontmatter block with doc_type: spec', () => {
  const out = renderTemplate('spec');
  assert.match(out, /^---\n/);
  assert.match(out, /\n---\n?$/);
  assert.match(out, /doc_type: spec/);
  assert.doesNotMatch(out, /implements:/);
});

test('renderTemplate plan returns a frontmatter block with implements field', () => {
  const out = renderTemplate('plan');
  assert.match(out, /doc_type: plan/);
  assert.match(out, /implements: /);
});

test('renderTemplate throws on unknown doc type', () => {
  assert.throws(() => renderTemplate('foo'), /doc type/i);
});

test('SCHEMA declares all required scalars', () => {
  assert.ok(SCHEMA.required.doc_type);
  assert.ok(SCHEMA.required.date);
  assert.ok(SCHEMA.required.status);
  assert.ok(SCHEMA.required.feature_area);
});

test('SCHEMA does NOT declare a spec field (decision: id = filename stem)', () => {
  assert.equal(SCHEMA.required.spec, undefined);
});

test('SCHEMA declares all required arrays', () => {
  assert.ok(SCHEMA.requiredArrays['touches.files']);
  assert.ok(SCHEMA.requiredArrays['touches.schema']);
  assert.ok(SCHEMA.requiredArrays['touches.events.emits']);
  assert.ok(SCHEMA.requiredArrays['touches.events.subscribes']);
  assert.ok(SCHEMA.requiredArrays['depends_on']);
});

test('SCHEMA depends_on item shape uses `doc` not `spec`', () => {
  const shape = SCHEMA.requiredArrays['depends_on'].itemShape;
  assert.ok(shape.doc);
  assert.equal(shape.spec, undefined);
});
```

- [ ] **Step 3: Run the tests.**

From `thebrain-package/`:

```bash
node --test hippocampus/lib/spec-check/schema.test.js
```

Expected: 7 passing tests.

### Task 1.2: Create `walker.js`

- [ ] **Step 1: Write the module.**

Create `thebrain-package/hippocampus/lib/spec-check/walker.js`. It exports one async function, `walkSpecDir(rootPath)`, which returns a sorted array of absolute paths to every `.md` file under `rootPath`.

Requirements:

- Use `fs/promises` (`readdir`, `stat`).
- Recurse into subdirectories, but NOT into hidden directories (name starts with `.`) or `node_modules`.
- Do NOT follow symlinks. Use `lstat` and skip entries where `isSymbolicLink()` returns true.
- Only include files ending in `.md` (case-insensitive).
- Return results sorted alphabetically for deterministic output.
- If `rootPath` does not exist or is not a directory, throw an error with a clear message.

```js
// Recursive .md file walker used by spec-check to discover spec/plan docs in a folder.
// Symlink-safe (does not follow), skips hidden dirs and node_modules, sorts deterministically.

const fs = require('fs/promises');
const path = require('path');

// Walk rootPath recursively and return a sorted list of .md file paths.
async function walkSpecDir(rootPath) {
  const stat = await fs.lstat(rootPath).catch(() => null);
  if (!stat || !stat.isDirectory()) {
    throw new Error(`walkSpecDir: not a directory: ${rootPath}`);
  }
  const out = [];
  await walkInto(rootPath, out);
  out.sort();
  return out;
}

// Recursive helper — pushes matching files into `out`.
async function walkInto(dir, out) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;          // skip hidden
    if (entry.name === 'node_modules') continue;        // skip deps
    const full = path.join(dir, entry.name);
    const lstat = await fs.lstat(full);
    if (lstat.isSymbolicLink()) continue;               // no symlink follow
    if (lstat.isDirectory()) {
      await walkInto(full, out);
    } else if (lstat.isFile() && entry.name.toLowerCase().endsWith('.md')) {
      out.push(full);
    }
  }
}

module.exports = { walkSpecDir };
```

- [ ] **Step 2: Write `walker.test.js`.**

Create `thebrain-package/hippocampus/lib/spec-check/walker.test.js`. Build a temp fixture folder per test, exercise the walker, clean up.

```js
// Unit tests for the .md file walker.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { walkSpecDir } = require('./walker.js');

// Build a temp directory with a known layout. Returns the temp root.
async function makeFixture(layout) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'walker-test-'));
  for (const [rel, contents] of Object.entries(layout)) {
    const full = path.join(root, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, contents);
  }
  return root;
}

test('walkSpecDir finds .md files at any depth', async () => {
  const root = await makeFixture({
    'top.md': 'x',
    'sub/mid.md': 'x',
    'sub/deep/bottom.md': 'x',
    'sub/deep/ignored.txt': 'x',
  });
  const found = await walkSpecDir(root);
  assert.equal(found.length, 3);
  assert.ok(found.every(f => f.endsWith('.md')));
});

test('walkSpecDir skips hidden directories', async () => {
  const root = await makeFixture({
    'visible.md': 'x',
    '.hidden/secret.md': 'x',
  });
  const found = await walkSpecDir(root);
  assert.equal(found.length, 1);
  assert.match(found[0], /visible\.md$/);
});

test('walkSpecDir skips node_modules', async () => {
  const root = await makeFixture({
    'real.md': 'x',
    'node_modules/pkg/README.md': 'x',
  });
  const found = await walkSpecDir(root);
  assert.equal(found.length, 1);
});

test('walkSpecDir does not follow symlinks', async () => {
  const root = await makeFixture({
    'real.md': 'x',
    'target/inside.md': 'x',
  });
  // Create a symlink pointing back to root — would loop if followed.
  await fs.symlink(root, path.join(root, 'loop'));
  const found = await walkSpecDir(root);
  // Should find exactly real.md and target/inside.md. No loop, no duplicates.
  assert.equal(found.length, 2);
});

test('walkSpecDir returns sorted paths', async () => {
  const root = await makeFixture({
    'z.md': 'x',
    'a.md': 'x',
    'm.md': 'x',
  });
  const found = await walkSpecDir(root);
  const names = found.map(f => path.basename(f));
  assert.deepEqual(names, ['a.md', 'm.md', 'z.md']);
});

test('walkSpecDir throws on non-directory input', async () => {
  await assert.rejects(
    () => walkSpecDir('/nonexistent/path/here'),
    /not a directory/
  );
});

test('walkSpecDir is case-insensitive on .md extension', async () => {
  const root = await makeFixture({
    'lower.md': 'x',
    'upper.MD': 'x',
    'mixed.Md': 'x',
  });
  const found = await walkSpecDir(root);
  assert.equal(found.length, 3);
});
```

- [ ] **Step 3: Run the tests.**

```bash
node --test hippocampus/lib/spec-check/walker.test.js
```

Expected: 7 passing tests.

### Task 1.3: Run all Chunk 1 tests together

- [ ] **Step 1: Run the whole spec-check test dir.**

```bash
node --test hippocampus/lib/spec-check/
```

Expected: 14 passing tests (7 schema + 7 walker). Tell the user the count and what landed. Do NOT restart any services. Do NOT commit.

---

## Chunk 2 — YAML subset parser + frontmatter parser

**Goal:** Land two tightly coupled modules. `yaml-parser.js` is a hand-rolled parser for the narrow YAML subset the schema uses (scalars, nested maps, lists of maps, lists of scalars, quoted/unquoted strings, `null`, `[]`). `frontmatter-parser.js` extracts the `---...---` block from a markdown file, passes it to the YAML parser, and validates the result against `SCHEMA` from Chunk 1. Validation enforces decision 2: every `touches.events.emits[*].from_file` must appear in the doc's `touches.files` list. After Chunk 2, you can point the parser at any markdown file with frontmatter and get back either `{ ok: true, data }` or `{ ok: false, errors: [...] }`.

**Non-goals (do NOT do these):**

- Do NOT widen the YAML subset beyond what is listed. No anchors (`&foo`), no aliases (`*foo`), no multi-line scalars (`|`, `>`), no inline comments, no flow-style maps (`{a: 1, b: 2}` outside of `{}`/`[]` empty markers), no tags (`!!str`), no type coercion beyond integer detection.
- Do NOT add `js-yaml` or any other YAML library. Hand-rolled is the entire point — adding a dep defeats the chunk.
- Do NOT modify Chunk 1's files (`schema.js`, `walker.js`, their tests). You consume `SCHEMA` from `schema.js`; you do not change it.
- Do NOT add fancy error recovery. The parser fails loudly with line numbers; the frontmatter-parser returns structured `{ ok: false, errors: [...] }`. No silent fallbacks, no "best-effort" partial parsing.
- Do NOT write any collision detection logic — that is Chunk 3's scope.
- Do NOT add a streaming or incremental parser. Synchronous full-buffer parse is the contract.
- Do NOT add new schema validation rules beyond what `SCHEMA` declares plus the `from_file ∈ touches.files` cross-rule.

**Read first (line ranges only):**

- `thebrain-package/hippocampus/lib/spec-check/schema.js:1-80` — the `SCHEMA` object that the validator checks against.
- `thebrain-package/docs/superpowers/specs/2026-04-07-spec-cross-check-tool-design.md:72-196` — the frontmatter schema section (the source of truth for what the parser must handle).

**Touched files:**
- Create: `thebrain-package/hippocampus/lib/spec-check/yaml-parser.js`
- Create: `thebrain-package/hippocampus/lib/spec-check/yaml-parser.test.js`
- Create: `thebrain-package/hippocampus/lib/spec-check/frontmatter-parser.js`
- Create: `thebrain-package/hippocampus/lib/spec-check/frontmatter-parser.test.js`

### Task 2.1: Write `yaml-parser.js`

- [ ] **Step 1: Write the module.**

Create `thebrain-package/hippocampus/lib/spec-check/yaml-parser.js`. Export one function, `parseYaml(text)`, which returns a JS object (nested maps + lists + scalars). Throws on malformed input with line-number context.

The subset to support (and nothing more):

- **Flat scalars:** `key: value`
- **Nested maps:** indentation-based, 2-space indent units. `key:` on its own line opens a nested map.
- **Lists of scalars:** `  - foo` / `  - bar` under a key.
- **Lists of maps:** `  - key: val` followed by continuation `    other_key: val` at +2 deeper indent.
- **Scalar types:** unquoted strings (everything after `: `), double-quoted strings (for values with colons or leading/trailing whitespace), `null`, integers, dates (treat as strings).
- **Empty collections:** `key: []` and `key: {}` as one-liners.
- **Comments:** lines starting with `#` (optionally preceded by whitespace) are ignored. Inline comments (`key: value # comment`) are NOT supported — keep it simple.
- **Blank lines:** ignored.

Parser strategy: **line-based with an indentation stack.** Each line is classified as one of: comment/blank, map key (with optional inline scalar), list item opening a map, list item scalar. A stack tracks the current nesting path. Changing indent levels pops the stack.

```js
// Hand-rolled YAML subset parser for spec-check frontmatter.
// Supports: flat scalars, nested maps, lists of scalars, lists of maps, quoted/unquoted
// strings, null, empty collections ([], {}), comments (full-line only).
// Does NOT support: anchors, aliases, multi-line strings, flow-style maps, inline comments,
// tags, explicit type coercion. If it needs more, widen the subset deliberately — do not
// reach for js-yaml.

// Parse YAML text into a JS value (object, array, string, number, null).
function parseYaml(text) {
  const lines = text.split('\n').map((raw, i) => ({ raw, lineNum: i + 1 }));
  const tokens = [];
  for (const { raw, lineNum } of lines) {
    const stripped = raw.replace(/\s+$/, '');
    if (stripped.trim() === '' || stripped.trim().startsWith('#')) continue;
    const indent = stripped.match(/^ */)[0].length;
    if (indent % 2 !== 0) {
      throw new Error(`yaml-parser: odd indent ${indent} at line ${lineNum}`);
    }
    tokens.push({ indent, content: stripped.slice(indent), lineNum });
  }
  const [value, consumed] = parseValue(tokens, 0, 0);
  if (consumed < tokens.length) {
    throw new Error(`yaml-parser: trailing content at line ${tokens[consumed].lineNum}`);
  }
  return value;
}

// Parse a value starting at tokens[start], expected at `indent` depth.
// Returns [parsedValue, indexOfNextToken].
function parseValue(tokens, start, indent) {
  if (start >= tokens.length) return [null, start];
  const first = tokens[start];
  if (first.content.startsWith('- ') || first.content === '-') {
    return parseList(tokens, start, indent);
  }
  return parseMap(tokens, start, indent);
}

// Parse a map at the given indent. Returns [obj, nextIndex].
function parseMap(tokens, start, indent) {
  const obj = {};
  let i = start;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.indent < indent) break;
    if (tok.indent > indent) {
      throw new Error(`yaml-parser: unexpected indent at line ${tok.lineNum}`);
    }
    const match = tok.content.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (!match) {
      throw new Error(`yaml-parser: expected "key:" at line ${tok.lineNum} — got "${tok.content}"`);
    }
    const key = match[1];
    const inline = match[2];
    if (inline === '') {
      // Nested value on following lines at +2 indent.
      i++;
      if (i >= tokens.length || tokens[i].indent <= indent) {
        // Empty nested — treat as empty object.
        obj[key] = {};
        continue;
      }
      const [nested, next] = parseValue(tokens, i, indent + 2);
      obj[key] = nested;
      i = next;
    } else {
      // Inline scalar.
      obj[key] = parseScalar(inline);
      i++;
    }
  }
  return [obj, i];
}

// Parse a list at the given indent. Returns [arr, nextIndex].
function parseList(tokens, start, indent) {
  const arr = [];
  let i = start;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (tok.indent < indent) break;
    if (tok.indent > indent) {
      throw new Error(`yaml-parser: unexpected list indent at line ${tok.lineNum}`);
    }
    if (!tok.content.startsWith('-')) break;
    const after = tok.content.slice(1).replace(/^\s*/, '');
    if (after === '') {
      // Bare "-" — nested value on next line.
      i++;
      if (i < tokens.length && tokens[i].indent > indent) {
        const [nested, next] = parseValue(tokens, i, tokens[i].indent);
        arr.push(nested);
        i = next;
      } else {
        arr.push(null);
      }
      continue;
    }
    const match = after.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (match) {
      // List item opens a map. First key is on this line; continuation keys at +2 deeper indent.
      const key = match[1];
      const inline = match[2];
      const item = {};
      if (inline === '') {
        // Key with nested value below.
        i++;
        if (i < tokens.length && tokens[i].indent > indent + 2) {
          const [nested, next] = parseValue(tokens, i, tokens[i].indent);
          item[key] = nested;
          i = next;
        } else {
          item[key] = {};
        }
      } else {
        item[key] = parseScalar(inline);
        i++;
      }
      // Continuation keys at indent + 2.
      while (i < tokens.length && tokens[i].indent === indent + 2 && !tokens[i].content.startsWith('-')) {
        const [more, next] = parseMap([tokens[i]], 0, indent + 2);
        // parseMap on a single token — merge
        Object.assign(item, more);
        i = next === 1 ? i + 1 : i + 1;
        // The above line assumes parseMap consumed exactly the one token. For multi-line continuations
        // at the same indent, loop handles it.
      }
      // Simpler: re-parse continuation as a map at indent+2.
      arr.push(item);
    } else {
      // Scalar list item.
      arr.push(parseScalar(after));
      i++;
    }
  }
  return [arr, i];
}

// Parse an inline scalar. Handles quoted strings, null, [], {}, numbers, and raw strings.
function parseScalar(raw) {
  const s = raw.trim();
  if (s === '' || s === 'null' || s === '~') return null;
  if (s === '[]') return [];
  if (s === '{}') return {};
  if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
    return s.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) {
    return s.slice(1, -1).replace(/''/g, "'");
  }
  if (/^-?\d+$/.test(s)) return parseInt(s, 10);
  return s;
}

module.exports = { parseYaml };
```

**Known subtlety:** the inline continuation-keys loop in `parseList` is tricky because list items can have multiple map keys at the same `indent + 2` depth. A cleaner approach is to treat the list item's body as a sub-map call: detect the span of lines at `indent + 2` after the `-`, and parse them with `parseMap(tokens, start, indent + 2)`. Refactor to that approach if the first-pass tests fail on multi-key list items.

- [ ] **Step 2: Write `yaml-parser.test.js`.**

Cover every subset feature. Minimum test cases:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseYaml } = require('./yaml-parser.js');

test('flat scalars', () => {
  const r = parseYaml('foo: bar\nbaz: qux\n');
  assert.deepEqual(r, { foo: 'bar', baz: 'qux' });
});

test('null scalars', () => {
  const r = parseYaml('a: null\nb: ~\nc:\n');
  assert.deepEqual(r, { a: null, b: null, c: {} });
});

test('integer scalars', () => {
  const r = parseYaml('count: 42\nneg: -7\n');
  assert.deepEqual(r, { count: 42, neg: -7 });
});

test('double-quoted strings preserve colons', () => {
  const r = parseYaml('msg: "hello: world"\n');
  assert.deepEqual(r, { msg: 'hello: world' });
});

test('empty inline collections', () => {
  const r = parseYaml('a: []\nb: {}\n');
  assert.deepEqual(r, { a: [], b: {} });
});

test('nested map', () => {
  const r = parseYaml('outer:\n  inner: value\n');
  assert.deepEqual(r, { outer: { inner: 'value' } });
});

test('two levels of nesting', () => {
  const r = parseYaml('a:\n  b:\n    c: deep\n');
  assert.deepEqual(r, { a: { b: { c: 'deep' } } });
});

test('list of scalars', () => {
  const r = parseYaml('items:\n  - one\n  - two\n  - three\n');
  assert.deepEqual(r, { items: ['one', 'two', 'three'] });
});

test('list of maps with single key', () => {
  const r = parseYaml('items:\n  - name: a\n  - name: b\n');
  assert.deepEqual(r, { items: [{ name: 'a' }, { name: 'b' }] });
});

test('list of maps with multiple keys', () => {
  const r = parseYaml('items:\n  - path: file.js\n    mode: modify\n  - path: other.js\n    mode: create\n');
  assert.deepEqual(r, { items: [
    { path: 'file.js', mode: 'modify' },
    { path: 'other.js', mode: 'create' },
  ]});
});

test('full frontmatter-shaped input', () => {
  const input = [
    'doc_type: spec',
    'date: 2026-04-07',
    'status: proposed',
    'feature_area: features/alerts',
    'touches:',
    '  files:',
    '    - path: features/alerts/routes.js',
    '      mode: modify',
    '      spec_section: L145-L171',
    '      source_lines: null',
    '  schema: []',
    '  events:',
    '    emits: []',
    '    subscribes: []',
    'depends_on: []',
    '',
  ].join('\n');
  const r = parseYaml(input);
  assert.equal(r.doc_type, 'spec');
  assert.equal(r.touches.files.length, 1);
  assert.equal(r.touches.files[0].path, 'features/alerts/routes.js');
  assert.equal(r.touches.files[0].source_lines, null);
  assert.deepEqual(r.touches.schema, []);
  assert.deepEqual(r.touches.events.emits, []);
  assert.deepEqual(r.depends_on, []);
});

test('comments and blank lines are ignored', () => {
  const r = parseYaml('# top comment\n\nfoo: bar\n  # indented comment\nbaz: qux\n');
  assert.deepEqual(r, { foo: 'bar', baz: 'qux' });
});

test('throws on odd indentation', () => {
  assert.throws(() => parseYaml('foo:\n bar: baz\n'), /odd indent/);
});

test('throws on malformed key line', () => {
  assert.throws(() => parseYaml('not a key line\n'), /expected "key:"/);
});
```

- [ ] **Step 3: Run and iterate.**

```bash
node --test hippocampus/lib/spec-check/yaml-parser.test.js
```

Expected: 14 passing tests. **If multi-key list items fail** (test 10 or 11), refactor `parseList`'s continuation loop to: after consuming the first `- key: val` line, detect the span of continuation tokens at `indent + 2` that do NOT start with `-`, and recursively call `parseMap` on that span. This is the cleanest fix.

### Task 2.2: Write `frontmatter-parser.js`

- [ ] **Step 1: Write the module.**

Create `thebrain-package/hippocampus/lib/spec-check/frontmatter-parser.js`. It exports `parseFrontmatter(fileContents, filePath)` which:

1. Looks for `---\n...\n---\n` at the start of the file.
2. If missing, returns `{ ok: false, errors: [{ code: 'HEADERLESS', message: 'No frontmatter block found' }] }`.
3. If present, extracts the middle block and passes it to `parseYaml`.
4. Validates the parsed object against `SCHEMA` (required scalars, required arrays, item shapes).
5. Enforces **decision 2**: every `touches.events.emits[*].from_file` must also appear as a `path` in `touches.files`.
6. Enforces filename-stem id rules: `implements` (plan-only) and `depends_on[*].doc` values must be valid kebab-case strings (regex: `/^[a-z0-9][a-z0-9-]*$/`).
7. Returns `{ ok: true, data, rawStartLine, rawEndLine }` or `{ ok: false, errors: [...] }`.

`rawStartLine` / `rawEndLine` are 1-indexed line numbers of the opening and closing `---` in the source file — useful for the report formatter.

```js
// Frontmatter parser for spec/plan markdown files.
// Extracts the --- ... --- block, parses it as YAML, validates against the canonical schema,
// and enforces cross-field rules (from_file must appear in touches.files).

const { parseYaml } = require('./yaml-parser.js');
const { SCHEMA } = require('./schema.js');

const ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const LINE_REF_RE = /^L\d+(-L\d+)?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Parse the frontmatter block from a markdown file's contents.
function parseFrontmatter(fileContents, filePath) {
  const lines = fileContents.split('\n');
  if (lines[0] !== '---') {
    return { ok: false, errors: [{ code: 'HEADERLESS', message: `${filePath}: no frontmatter block` }] };
  }
  let endLine = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') { endLine = i; break; }
  }
  if (endLine === -1) {
    return { ok: false, errors: [{ code: 'UNTERMINATED', message: `${filePath}: frontmatter not terminated` }] };
  }
  const body = lines.slice(1, endLine).join('\n');
  let data;
  try {
    data = parseYaml(body);
  } catch (err) {
    return { ok: false, errors: [{ code: 'YAML_ERROR', message: `${filePath}: ${err.message}` }] };
  }
  const errors = validate(data, filePath);
  if (errors.length) return { ok: false, errors };
  return { ok: true, data, rawStartLine: 1, rawEndLine: endLine + 1 };
}

// Validate a parsed frontmatter object against SCHEMA + cross-field rules.
function validate(data, filePath) {
  const errors = [];
  const ctx = filePath;

  // Required scalars.
  for (const [field, def] of Object.entries(SCHEMA.required)) {
    if (data[field] === undefined || data[field] === null) {
      errors.push({ code: 'MISSING_FIELD', message: `${ctx}: required field "${field}" missing` });
      continue;
    }
    if (def.type === 'enum' && !def.values.includes(data[field])) {
      errors.push({ code: 'INVALID_ENUM', message: `${ctx}: ${field}=${data[field]} not in [${def.values.join(', ')}]` });
    }
    if (def.type === 'date' && !DATE_RE.test(data[field])) {
      errors.push({ code: 'INVALID_DATE', message: `${ctx}: ${field}="${data[field]}" not YYYY-MM-DD` });
    }
    if (def.type === 'string' && typeof data[field] !== 'string') {
      errors.push({ code: 'INVALID_TYPE', message: `${ctx}: ${field} must be a string` });
    }
  }

  // Required arrays — must exist (may be empty).
  for (const arrPath of Object.keys(SCHEMA.requiredArrays)) {
    const arr = getPath(data, arrPath);
    if (!Array.isArray(arr)) {
      errors.push({ code: 'MISSING_ARRAY', message: `${ctx}: ${arrPath} must be an array (possibly empty)` });
      continue;
    }
    const itemShape = SCHEMA.requiredArrays[arrPath].itemShape;
    arr.forEach((item, idx) => {
      for (const [key, spec] of Object.entries(itemShape)) {
        if (spec.required && (item[key] === undefined || (item[key] === null && !spec.nullable))) {
          errors.push({ code: 'MISSING_ITEM_FIELD', message: `${ctx}: ${arrPath}[${idx}].${key} required` });
          continue;
        }
        if (item[key] === undefined || item[key] === null) continue;
        if (spec.type === 'enum' && !spec.values.includes(item[key])) {
          errors.push({ code: 'INVALID_ENUM', message: `${ctx}: ${arrPath}[${idx}].${key}=${item[key]} not in [${spec.values.join(', ')}]` });
        }
        if (spec.type === 'line_ref' && !LINE_REF_RE.test(item[key])) {
          errors.push({ code: 'INVALID_LINE_REF', message: `${ctx}: ${arrPath}[${idx}].${key}="${item[key]}" must match L<n> or L<n>-L<n>` });
        }
      }
    });
  }

  // Cross-field rule: every emits[].from_file must appear in touches.files[].path.
  const emits = getPath(data, 'touches.events.emits') || [];
  const files = getPath(data, 'touches.files') || [];
  const filePaths = new Set(files.map(f => f.path));
  for (const emit of emits) {
    if (emit.from_file && !filePaths.has(emit.from_file)) {
      errors.push({
        code: 'EMIT_FILE_NOT_LISTED',
        message: `${ctx}: emits "${emit.name}" from_file=${emit.from_file} but not in touches.files`,
      });
    }
  }

  // id format: implements + depends_on[].doc must be kebab-case.
  if (data.implements !== undefined && data.implements !== null) {
    if (typeof data.implements !== 'string' || !ID_RE.test(data.implements)) {
      errors.push({ code: 'INVALID_ID', message: `${ctx}: implements="${data.implements}" not kebab-case` });
    }
  }
  for (const dep of (data.depends_on || [])) {
    if (dep.doc && !ID_RE.test(dep.doc)) {
      errors.push({ code: 'INVALID_ID', message: `${ctx}: depends_on.doc="${dep.doc}" not kebab-case` });
    }
  }

  return errors;
}

// Dot-path getter: getPath(obj, 'touches.events.emits') walks the nested structure.
function getPath(obj, dotted) {
  return dotted.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

module.exports = { parseFrontmatter };
```

- [ ] **Step 2: Write `frontmatter-parser.test.js`.**

Cover the happy path, each failure mode, and the cross-field rule.

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFrontmatter } = require('./frontmatter-parser.js');

// A valid spec frontmatter for baseline tests.
const VALID_SPEC = [
  '---',
  'doc_type: spec',
  'date: 2026-04-07',
  'status: proposed',
  'feature_area: features/x',
  'touches:',
  '  files:',
  '    - path: features/x/routes.js',
  '      mode: modify',
  '      spec_section: L10-L50',
  '  schema: []',
  '  events:',
  '    emits: []',
  '    subscribes: []',
  'depends_on: []',
  '---',
  '',
  '# Body',
].join('\n');

test('parses a valid spec frontmatter', () => {
  const r = parseFrontmatter(VALID_SPEC, 'test.md');
  assert.equal(r.ok, true);
  assert.equal(r.data.doc_type, 'spec');
});

test('rejects a file with no frontmatter', () => {
  const r = parseFrontmatter('# just a heading\n', 'test.md');
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].code, 'HEADERLESS');
});

test('rejects a file with unterminated frontmatter', () => {
  const r = parseFrontmatter('---\ndoc_type: spec\n', 'test.md');
  assert.equal(r.ok, false);
  assert.equal(r.errors[0].code, 'UNTERMINATED');
});

test('rejects missing required scalar', () => {
  const broken = VALID_SPEC.replace('doc_type: spec\n', '');
  const r = parseFrontmatter(broken, 'test.md');
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.code === 'MISSING_FIELD'));
});

test('rejects invalid enum', () => {
  const broken = VALID_SPEC.replace('status: proposed', 'status: maybe');
  const r = parseFrontmatter(broken, 'test.md');
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.code === 'INVALID_ENUM'));
});

test('rejects invalid date format', () => {
  const broken = VALID_SPEC.replace('date: 2026-04-07', 'date: April 7');
  const r = parseFrontmatter(broken, 'test.md');
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.code === 'INVALID_DATE'));
});

test('rejects invalid line ref', () => {
  const broken = VALID_SPEC.replace('spec_section: L10-L50', 'spec_section: 10-50');
  const r = parseFrontmatter(broken, 'test.md');
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.code === 'INVALID_LINE_REF'));
});

test('enforces from_file must appear in touches.files', () => {
  const withBadEmit = VALID_SPEC.replace(
    '    emits: []',
    '    emits:\n      - name: thread.renamed\n        from_file: features/threads/routes.js\n        spec_section: L100'
  );
  const r = parseFrontmatter(withBadEmit, 'test.md');
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.code === 'EMIT_FILE_NOT_LISTED'));
});

test('accepts emit whose from_file IS in touches.files', () => {
  const withGoodEmit = VALID_SPEC.replace(
    '    emits: []',
    '    emits:\n      - name: thread.renamed\n        from_file: features/x/routes.js\n        spec_section: L100'
  );
  const r = parseFrontmatter(withGoodEmit, 'test.md');
  assert.equal(r.ok, true, JSON.stringify(r.errors));
});

test('rejects non-kebab implements id', () => {
  const plan = VALID_SPEC.replace('doc_type: spec', 'doc_type: plan')
    .replace('feature_area: features/x', 'feature_area: features/x\nimplements: Spec With Spaces');
  const r = parseFrontmatter(plan, 'test.md');
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => e.code === 'INVALID_ID'));
});
```

- [ ] **Step 3: Run all Chunk 2 tests.**

```bash
node --test hippocampus/lib/spec-check/
```

Expected: 14 schema+walker tests from Chunk 1 + 14 yaml-parser + 10 frontmatter-parser = 38 passing tests. Report counts to user. Do NOT restart services.

---

## Chunk 3 — Collision detector

**Goal:** Land `collision-detector.js` — a module of pure functions, one per detection rule (file collisions, schema collisions, dangling subscribes, same-file double-emits, dependency-order violations). Each function takes an array of parsed docs (output from frontmatter-parser) and returns an array of collision records. Pure function interfaces mean every rule can be unit-tested against synthetic doc fixtures without touching the filesystem.

**Non-goals (do NOT do these):**

- Do NOT add filesystem access, parsing, or schema validation — those are upstream concerns. Detector functions take already-parsed `docs[]` and return collision records. That is the entire interface.
- Do NOT add report rendering — that is Chunk 4's scope. Detectors return raw collision records as plain JS objects.
- Do NOT add fuzzy matching, semantic similarity, or auto-resolution. Detection only — humans decide how to fix collisions. This is in the spec's "Not in any version" list.
- Do NOT add new collision rules beyond the five specified (file, schema, dangling subscribe, double emit, dependency order). If you think one is missing, add an observation in the observations file — do not invent it.
- Do NOT modify Chunks 1 or 2 files.
- Do NOT run a grep against the live codebase to find existing event emits — that is the CLI's job in Chunk 5. `detectDanglingSubscribes` accepts a `codebaseEmits` Set parameter; it does not populate the set itself.
- Do NOT add cycle detection on the `depends_on` graph. The spec explicitly defers this — cycles are unlikely in practice and the implementation cost is not justified for v1.

**Read first (line ranges only):**

- `thebrain-package/docs/superpowers/specs/2026-04-07-spec-cross-check-tool-design.md:247-266` — the detection rules section. Source of truth for each rule's semantics.
- `thebrain-package/hippocampus/lib/spec-check/frontmatter-parser.js:1-30` — confirms the shape of `{ ok: true, data }` that docs come in as.

**Touched files:**
- Create: `thebrain-package/hippocampus/lib/spec-check/collision-detector.js`
- Create: `thebrain-package/hippocampus/lib/spec-check/collision-detector.test.js`

### Task 3.1: Write `collision-detector.js`

- [ ] **Step 1: Write the module.**

Export one main function `detectAll(docs)` which runs every rule and returns a structured object:

```js
{
  fileCollisions: [...],       // hard + soft
  schemaCollisions: [...],     // always hard
  danglingSubscribes: [...],   // warning
  doubleEmits: [...],          // hard
  dependencyOrderIssues: [...], // info
}
```

Plus individual exports for each rule so tests can exercise them in isolation.

The `docs` array shape: each entry is `{ id, filePath, data }` where `id` is the filename stem (basename without `.md`), `filePath` is the absolute path, `data` is the parsed frontmatter object.

```js
// Collision detector — pure functions over parsed spec/plan docs.
// Each rule takes docs[] and returns an array of collision records.

// Rule: two or more docs declare touches.files entries with the same path.
// Soft warning if both have source_lines and they don't overlap; hard otherwise.
function detectFileCollisions(docs) {
  const byPath = new Map();
  for (const doc of docs) {
    for (const file of (doc.data.touches?.files || [])) {
      if (!byPath.has(file.path)) byPath.set(file.path, []);
      byPath.get(file.path).push({ docId: doc.id, entry: file });
    }
  }
  const collisions = [];
  for (const [path, entries] of byPath) {
    if (entries.length < 2) continue;
    const allHaveSourceLines = entries.every(e => e.entry.source_lines);
    const severity = allHaveSourceLines && !anyOverlap(entries.map(e => e.entry.source_lines))
      ? 'soft'
      : 'hard';
    collisions.push({ kind: 'file', path, severity, entries });
  }
  return collisions;
}

// Rule: two or more docs touch the same table.
function detectSchemaCollisions(docs) {
  const byTable = new Map();
  for (const doc of docs) {
    for (const entry of (doc.data.touches?.schema || [])) {
      if (!byTable.has(entry.table)) byTable.set(entry.table, []);
      byTable.get(entry.table).push({ docId: doc.id, entry });
    }
  }
  const collisions = [];
  for (const [table, entries] of byTable) {
    if (entries.length >= 2) {
      collisions.push({ kind: 'schema', table, severity: 'hard', entries });
    }
  }
  return collisions;
}

// Rule: a doc subscribes to an event that no doc in scope emits AND no codebase emit exists.
// `codebaseEmits` is a Set<string> of event names found by an external grep (passed in by the CLI).
function detectDanglingSubscribes(docs, codebaseEmits = new Set()) {
  const emitted = new Set([...codebaseEmits]);
  for (const doc of docs) {
    for (const emit of (doc.data.touches?.events?.emits || [])) {
      emitted.add(emit.name);
    }
  }
  const dangling = [];
  for (const doc of docs) {
    for (const sub of (doc.data.touches?.events?.subscribes || [])) {
      if (!emitted.has(sub.name)) {
        dangling.push({
          kind: 'dangling_subscribe',
          eventName: sub.name,
          severity: 'warning',
          docId: doc.id,
          specSection: sub.spec_section,
        });
      }
    }
  }
  return dangling;
}

// Rule: two or more docs declare emits with the same (from_file, name) pair.
function detectDoubleEmits(docs) {
  const byKey = new Map();
  for (const doc of docs) {
    for (const emit of (doc.data.touches?.events?.emits || [])) {
      const key = `${emit.from_file}::${emit.name}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push({ docId: doc.id, entry: emit });
    }
  }
  const collisions = [];
  for (const [key, entries] of byKey) {
    if (entries.length >= 2) {
      const [fromFile, name] = key.split('::');
      collisions.push({ kind: 'double_emit', fromFile, eventName: name, severity: 'hard', entries });
    }
  }
  return collisions;
}

// Rule: a doc depends on another doc whose status is less advanced than the dependent's.
function detectDependencyOrderIssues(docs) {
  const statusRank = { proposed: 0, 'in-plan': 1, 'in-flight': 2, shipped: 3 };
  const byId = new Map(docs.map(d => [d.id, d]));
  const issues = [];
  for (const doc of docs) {
    const depStatus = statusRank[doc.data.status];
    for (const dep of (doc.data.depends_on || [])) {
      const target = byId.get(dep.doc);
      if (!target) {
        issues.push({
          kind: 'missing_dependency',
          docId: doc.id,
          missingId: dep.doc,
          severity: 'warning',
        });
        continue;
      }
      const tStatus = statusRank[target.data.status];
      if (tStatus < depStatus) {
        issues.push({
          kind: 'order_violation',
          docId: doc.id,
          docStatus: doc.data.status,
          dependsOnId: target.id,
          dependsOnStatus: target.data.status,
          severity: 'info',
        });
      }
    }
  }
  return issues;
}

// Helper: do any two line-ranges in the input overlap?
function anyOverlap(ranges) {
  const parsed = ranges.map(parseRange).filter(Boolean).sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < parsed.length; i++) {
    if (parsed[i][0] <= parsed[i - 1][1]) return true;
  }
  return false;
}

function parseRange(r) {
  if (!r) return null;
  const m = r.match(/^L(\d+)(?:-L(\d+))?$/);
  if (!m) return null;
  const start = parseInt(m[1], 10);
  const end = m[2] ? parseInt(m[2], 10) : start;
  return [start, end];
}

function detectAll(docs, codebaseEmits = new Set()) {
  return {
    fileCollisions: detectFileCollisions(docs),
    schemaCollisions: detectSchemaCollisions(docs),
    danglingSubscribes: detectDanglingSubscribes(docs, codebaseEmits),
    doubleEmits: detectDoubleEmits(docs),
    dependencyOrderIssues: detectDependencyOrderIssues(docs),
  };
}

module.exports = {
  detectAll,
  detectFileCollisions,
  detectSchemaCollisions,
  detectDanglingSubscribes,
  detectDoubleEmits,
  detectDependencyOrderIssues,
};
```

- [ ] **Step 2: Write `collision-detector.test.js`.**

Build a `makeDoc(id, frontmatter)` helper that returns a fake doc object. Exercise each rule with minimal synthetic inputs.

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  detectFileCollisions,
  detectSchemaCollisions,
  detectDanglingSubscribes,
  detectDoubleEmits,
  detectDependencyOrderIssues,
  detectAll,
} = require('./collision-detector.js');

// Fake doc factory. Fills in sane defaults for anything not passed.
function makeDoc(id, overrides = {}) {
  return {
    id,
    filePath: `/fake/${id}.md`,
    data: {
      doc_type: 'spec',
      status: 'proposed',
      touches: { files: [], schema: [], events: { emits: [], subscribes: [] } },
      depends_on: [],
      ...overrides,
    },
  };
}

test('detectFileCollisions returns hard when two docs touch same file without source_lines', () => {
  const docs = [
    makeDoc('a', { touches: { files: [{ path: 'x.js', mode: 'modify', spec_section: 'L10' }], schema: [], events: { emits: [], subscribes: [] } } }),
    makeDoc('b', { touches: { files: [{ path: 'x.js', mode: 'modify', spec_section: 'L20' }], schema: [], events: { emits: [], subscribes: [] } } }),
  ];
  const r = detectFileCollisions(docs);
  assert.equal(r.length, 1);
  assert.equal(r[0].severity, 'hard');
  assert.equal(r[0].path, 'x.js');
});

test('detectFileCollisions returns soft when source_lines do not overlap', () => {
  const docs = [
    makeDoc('a', { touches: { files: [{ path: 'x.js', mode: 'modify', spec_section: 'L10', source_lines: 'L1-L50' }], schema: [], events: { emits: [], subscribes: [] } } }),
    makeDoc('b', { touches: { files: [{ path: 'x.js', mode: 'modify', spec_section: 'L20', source_lines: 'L100-L200' }], schema: [], events: { emits: [], subscribes: [] } } }),
  ];
  const r = detectFileCollisions(docs);
  assert.equal(r[0].severity, 'soft');
});

test('detectFileCollisions returns hard when source_lines overlap', () => {
  const docs = [
    makeDoc('a', { touches: { files: [{ path: 'x.js', mode: 'modify', spec_section: 'L10', source_lines: 'L1-L100' }], schema: [], events: { emits: [], subscribes: [] } } }),
    makeDoc('b', { touches: { files: [{ path: 'x.js', mode: 'modify', spec_section: 'L20', source_lines: 'L50-L150' }], schema: [], events: { emits: [], subscribes: [] } } }),
  ];
  const r = detectFileCollisions(docs);
  assert.equal(r[0].severity, 'hard');
});

test('detectFileCollisions ignores single-doc files', () => {
  const docs = [
    makeDoc('a', { touches: { files: [{ path: 'x.js', mode: 'modify', spec_section: 'L10' }], schema: [], events: { emits: [], subscribes: [] } } }),
  ];
  assert.deepEqual(detectFileCollisions(docs), []);
});

test('detectSchemaCollisions flags same-table hits', () => {
  const docs = [
    makeDoc('a', { touches: { files: [], schema: [{ table: 'notifications', change: 'add_columns', spec_section: 'L10' }], events: { emits: [], subscribes: [] } } }),
    makeDoc('b', { touches: { files: [], schema: [{ table: 'notifications', change: 'add_indexes', spec_section: 'L20' }], events: { emits: [], subscribes: [] } } }),
  ];
  const r = detectSchemaCollisions(docs);
  assert.equal(r.length, 1);
  assert.equal(r[0].table, 'notifications');
  assert.equal(r[0].severity, 'hard');
});

test('detectDanglingSubscribes flags unowned events', () => {
  const docs = [
    makeDoc('a', { touches: { files: [], schema: [], events: { emits: [], subscribes: [{ name: 'ghost.event', spec_section: 'L10' }] } } }),
  ];
  const r = detectDanglingSubscribes(docs);
  assert.equal(r.length, 1);
  assert.equal(r[0].eventName, 'ghost.event');
});

test('detectDanglingSubscribes accepts in-scope emit', () => {
  const docs = [
    makeDoc('a', { touches: { files: [{ path: 'x.js', mode: 'modify', spec_section: 'L5' }], schema: [], events: { emits: [{ name: 'x.event', from_file: 'x.js', spec_section: 'L10' }], subscribes: [] } } }),
    makeDoc('b', { touches: { files: [], schema: [], events: { emits: [], subscribes: [{ name: 'x.event', spec_section: 'L20' }] } } }),
  ];
  assert.deepEqual(detectDanglingSubscribes(docs), []);
});

test('detectDanglingSubscribes accepts codebase emit', () => {
  const docs = [
    makeDoc('a', { touches: { files: [], schema: [], events: { emits: [], subscribes: [{ name: 'existing.event', spec_section: 'L10' }] } } }),
  ];
  assert.deepEqual(detectDanglingSubscribes(docs, new Set(['existing.event'])), []);
});

test('detectDoubleEmits flags same-file same-name emits', () => {
  const docs = [
    makeDoc('a', { touches: { files: [{ path: 'x.js', mode: 'modify', spec_section: 'L5' }], schema: [], events: { emits: [{ name: 'foo', from_file: 'x.js', spec_section: 'L10' }], subscribes: [] } } }),
    makeDoc('b', { touches: { files: [{ path: 'x.js', mode: 'modify', spec_section: 'L5' }], schema: [], events: { emits: [{ name: 'foo', from_file: 'x.js', spec_section: 'L20' }], subscribes: [] } } }),
  ];
  const r = detectDoubleEmits(docs);
  assert.equal(r.length, 1);
  assert.equal(r[0].eventName, 'foo');
});

test('detectDependencyOrderIssues flags in-flight depending on proposed', () => {
  const docs = [
    makeDoc('a', { status: 'in-flight', depends_on: [{ doc: 'b', reason: 'needs it' }] }),
    makeDoc('b', { status: 'proposed' }),
  ];
  const r = detectDependencyOrderIssues(docs);
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, 'order_violation');
});

test('detectDependencyOrderIssues flags missing dependency', () => {
  const docs = [
    makeDoc('a', { status: 'in-flight', depends_on: [{ doc: 'nonexistent', reason: 'x' }] }),
  ];
  const r = detectDependencyOrderIssues(docs);
  assert.equal(r.length, 1);
  assert.equal(r[0].kind, 'missing_dependency');
});

test('detectAll runs every rule', () => {
  const docs = [makeDoc('a')];
  const r = detectAll(docs);
  assert.ok('fileCollisions' in r);
  assert.ok('schemaCollisions' in r);
  assert.ok('danglingSubscribes' in r);
  assert.ok('doubleEmits' in r);
  assert.ok('dependencyOrderIssues' in r);
});
```

- [ ] **Step 2: Run the tests.**

```bash
node --test hippocampus/lib/spec-check/collision-detector.test.js
```

Expected: 12 passing. Report counts.

---

## Chunk 4 — Report formatter

**Goal:** Land `report-formatter.js` with two rendering functions — `renderHumanSummary(collisions, docs)` and `renderClaudeIndex(collisions, docs)` — plus a top-level `renderReport(collisions, docs, meta)` that assembles the two-section output exactly as specified in the spec's §L270-L374 example. Pure string-building; no filesystem access.

**Non-goals (do NOT do these):**

- Do NOT add filesystem access — string building only. The CLI in Chunk 5 handles all I/O.
- Do NOT modify Chunks 1, 2, or 3 files.
- Do NOT deviate from the spec's example output shape (§L270-L374). Match it exactly: banner → docs found list → headerless section (conditional) → human summary with `[C1][C2]` numbered collisions → Claude-readable index → final `exit_code` line.
- Do NOT add ANSI color codes, terminal styling, emojis, or Unicode decorations beyond the `✓` and `⚠` already specified.
- Do NOT reorder sections. The order is fixed and downstream tooling parses it.
- Do NOT add a JSON output mode or any alternative format. Two-section text is the entire v1 contract.
- Do NOT compute exit codes inside the formatter — `computeExitCode` lives here as a pure helper but the CLI in Chunk 5 owns the actual `process.exit` call and the `--strict` override.

**Read first (line ranges only):**

- `thebrain-package/docs/superpowers/specs/2026-04-07-spec-cross-check-tool-design.md:270-374` — the example output. The formatter must produce output matching this shape.

**Touched files:**
- Create: `thebrain-package/hippocampus/lib/spec-check/report-formatter.js`
- Create: `thebrain-package/hippocampus/lib/spec-check/report-formatter.test.js`

### Task 4.1: Write `report-formatter.js`

- [ ] **Step 1: Write the module.**

Three exports:

1. `renderReport({ docs, collisions, headerless, meta })` — full output. Returns a string.
2. `renderHumanSummary({ collisions, docs })` — human narrative section only. Returns a string.
3. `renderClaudeIndex({ collisions, docs, headerless })` — structured Claude-readable section only. Returns a string.

The `meta` argument carries `{ folderCount, docCount }` for the header line.

Match the spec example exactly:

- Top banner: `=== SPEC CHECK ===` and `Scanned: N folders, M docs`
- "Docs found:" list: bullet with ✓ or ⚠ (headerless), `[doc_type, status, N lines]`, plus `→ implements: <id>` if plan with implements.
- "=== HEADERLESS DOCS ===" section when any exist, numbered `[H1]`, `[H2]`.
- "=== HUMAN SUMMARY ===" section with numbered `[C1]`, `[C2]`, ... collisions. Each has:
  - Title line: kind + subject + severity tag in parens.
  - Indented per-doc lines with spec section refs.
  - "Impact:" line(s) with a resolution hint.
- "Dependency ordering:" subsection if any order issues.
- "=== CLAUDE-READABLE INDEX ===" section with YAML-ish key/value structure.
- Final `exit_code: N` line.

Keep each rendering function focused and under ~80 lines. Helper functions (`formatFileCollision`, `formatSchemaCollision`, `formatDanglingSubscribe`, `formatDoubleEmit`) isolate the per-kind formatting.

Pseudocode for the main `renderReport`:

```js
function renderReport({ docs, collisions, headerless = [], meta }) {
  const parts = [];
  parts.push('=== SPEC CHECK ===');
  parts.push(`Scanned: ${meta.folderCount} folders, ${meta.docCount} docs`);
  parts.push('');
  parts.push('Docs found:');
  for (const d of docs) {
    const tag = d.data.implements ? `  → implements: ${d.data.implements}` : '';
    parts.push(`  ✓ ${d.id.padEnd(32)} [${d.data.doc_type}, ${d.data.status}, ${d.lineCount} lines]${tag}`);
  }
  for (const h of headerless) {
    parts.push(`  ⚠ ${h.id.padEnd(32)} [HEADERLESS, ${h.lineCount} lines]`);
  }
  parts.push('');
  if (headerless.length) {
    parts.push('=== HEADERLESS DOCS — need frontmatter before check can be trusted ===');
    parts.push('');
    headerless.forEach((h, i) => parts.push(`[H${i + 1}] ${h.filePath}`));
    parts.push('');
  }
  parts.push('=== HUMAN SUMMARY ===');
  parts.push('');
  parts.push(renderHumanSummary({ collisions, docs }));
  parts.push('');
  parts.push('=== CLAUDE-READABLE INDEX ===');
  parts.push('');
  parts.push(renderClaudeIndex({ collisions, docs, headerless }));
  parts.push('');
  parts.push(`exit_code: ${computeExitCode(collisions, headerless)}`);
  return parts.join('\n');
}
```

Implement `renderHumanSummary` and `renderClaudeIndex` to match the spec's example format. Use plain string concatenation, not template engines.

`computeExitCode(collisions, headerless)` returns:
- `1` if any collision has `severity: 'hard'`
- `0` otherwise (CLI applies `--strict` override to bump headerless to exit 2)

- [ ] **Step 2: Write `report-formatter.test.js`.**

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const { renderReport, renderHumanSummary, renderClaudeIndex } = require('./report-formatter.js');

const emptyCollisions = {
  fileCollisions: [],
  schemaCollisions: [],
  danglingSubscribes: [],
  doubleEmits: [],
  dependencyOrderIssues: [],
};

test('renderReport produces the banner and doc list', () => {
  const docs = [{
    id: 'test-spec',
    lineCount: 100,
    data: { doc_type: 'spec', status: 'proposed' },
  }];
  const out = renderReport({
    docs,
    collisions: emptyCollisions,
    headerless: [],
    meta: { folderCount: 1, docCount: 1 },
  });
  assert.match(out, /=== SPEC CHECK ===/);
  assert.match(out, /Scanned: 1 folders, 1 docs/);
  assert.match(out, /test-spec/);
  assert.match(out, /exit_code: 0/);
});

test('renderReport includes HEADERLESS section when present', () => {
  const out = renderReport({
    docs: [],
    collisions: emptyCollisions,
    headerless: [{ id: 'old-spec', filePath: '/fake/old-spec.md', lineCount: 200 }],
    meta: { folderCount: 1, docCount: 1 },
  });
  assert.match(out, /=== HEADERLESS DOCS/);
  assert.match(out, /\[H1\] \/fake\/old-spec\.md/);
});

test('renderReport returns exit_code 1 on hard collision', () => {
  const out = renderReport({
    docs: [],
    collisions: {
      ...emptyCollisions,
      fileCollisions: [{
        kind: 'file',
        path: 'x.js',
        severity: 'hard',
        entries: [
          { docId: 'a', entry: { spec_section: 'L10' } },
          { docId: 'b', entry: { spec_section: 'L20' } },
        ],
      }],
    },
    headerless: [],
    meta: { folderCount: 1, docCount: 2 },
  });
  assert.match(out, /exit_code: 1/);
  assert.match(out, /\[C1\]/);
  assert.match(out, /x\.js/);
});

test('renderHumanSummary emits zero collisions cleanly', () => {
  const out = renderHumanSummary({ collisions: emptyCollisions, docs: [] });
  assert.match(out, /0 collisions/i);
});

test('renderClaudeIndex emits structured keys', () => {
  const out = renderClaudeIndex({
    docs: [{ id: 'a', filePath: '/x/a.md', data: {} }],
    collisions: emptyCollisions,
    headerless: [],
  });
  assert.match(out, /^docs:/m);
  assert.match(out, /a: \/x\/a\.md/);
  assert.match(out, /conflicts\.files/);
});

test('renderClaudeIndex lists dependency_graph entries', () => {
  const out = renderClaudeIndex({
    docs: [{
      id: 'plan-a',
      filePath: '/x.md',
      data: { doc_type: 'plan', status: 'proposed', implements: 'spec-a', depends_on: [] },
    }],
    collisions: emptyCollisions,
    headerless: [],
  });
  assert.match(out, /dependency_graph/);
  assert.match(out, /plan-a/);
  assert.match(out, /implements: spec-a/);
});
```

- [ ] **Step 3: Run.**

```bash
node --test hippocampus/lib/spec-check/report-formatter.test.js
```

Expected: 6 passing.

---

## Chunk 5 — CLI entry point + chunk-extractor + observations + integration test

**Goal:** Land two things: (1) `scripts/spec-check.js` — the CLI entry point that wires every lib module together, supporting `--dir <path>` (repeatable), `--template spec|plan`, `--strict`, and orchestrating walk → parse → validate → detect → render → print → exit; (2) `lib/spec-check/chunk-extractor.js` — a separate module that extracts plan-header + chunk body + prior agent observations from a plan markdown file, exposed via three new CLI flags `--list-chunks <plan>`, `--chunk-range <plan> <n>`, `--chunk-content <plan> <n>`. The `--chunk-content` output is the **self-sufficient Sonnet assignment** that all future plans use as their handoff — preamble (standing rules) + plan header (architecture decisions context) + prior observations + chunk body, all assembled in one shell command. Integration tests in `scripts/spec-check.test.js` drive both surfaces against synthetic fixtures.

**Non-goals (do NOT do these):**

- Do NOT modify the lib modules from Chunks 1-4. The CLI consumes them; it does not change their interfaces.
- Do NOT add caching or incremental scanning. Re-parse on every run is the contract — fine at current scale, deferred per the spec.
- Do NOT add a `--watch` flag or any long-running mode. One-shot only.
- Do NOT add a `--max-depth N` flag for the walker. Walk to leaves; defer the depth cap until performance issues actually appear.
- Do NOT add a `--record-observation` flag or any observation-write tool. Agents append to the observations file directly using their own filesystem tools — the tool only READS observations, it does not write them. This keeps the write path under agent control and the format light.
- Do NOT widen the standing-rules preamble beyond what is specified in this chunk. The preamble is small, stable, and tool-injected; do not let it grow into a doctrine.
- Do NOT add `--auto-fix`, `--merge`, or any mutation flag for any collision type. Detection only.
- Do NOT add an `--all-known-projects` convenience wrapper. The spec defers this; not v1.
- Do NOT add JSON output mode, machine-readable diff mode, or any output format besides the two-section human + Claude-readable text from Chunk 4.
- Do NOT modify the chunk-extractor's plan-header detection rule. The rule is "everything from line 1 through the line before the first `## Chunk N` heading." Do not try to be clever about skipping frontmatter or detecting subsections — that brittleness defeats the simplicity.

**Read first (line ranges only):**

- `thebrain-package/docs/superpowers/specs/2026-04-07-spec-cross-check-tool-design.md:208-225` — CLI interface definition.
- `thebrain-package/hippocampus/scripts/query.js:1-40` — existing hippocampus CLI style for argument parsing reference.
- `thebrain-package/hippocampus/lib/spec-check/report-formatter.js:1-20` — the `renderReport` signature the CLI will call.

**Touched files:**
- Create: `thebrain-package/hippocampus/lib/spec-check/chunk-extractor.js`
- Create: `thebrain-package/hippocampus/lib/spec-check/chunk-extractor.test.js`
- Create: `thebrain-package/hippocampus/scripts/spec-check.js`
- Create: `thebrain-package/hippocampus/scripts/spec-check.test.js`

### Task 5.0: Write `chunk-extractor.js`

The chunk-extractor is the foundation of the entire future-handoff workflow. Land it first, test it in isolation, then wire it into the CLI in Task 5.1.

- [ ] **Step 1: Write the module.**

Create `thebrain-package/hippocampus/lib/spec-check/chunk-extractor.js`. It exports four functions:

1. `listChunks(planContents)` — returns `[{ number, name, startLine, endLine, lineCount }, ...]` for every `## Chunk N — <name>` heading found in the file. `startLine`/`endLine` are 1-indexed inclusive line numbers; `endLine` is the line before the next chunk heading (or the line before the first terminal section: `## Sonnet handoff prompts`, `## Post-implementation notes`).
2. `extractPlanHeader(planContents)` — returns the plan header string: lines from the start of the file through the line immediately before the first `## Chunk N` heading. This is everything the planner wrote once at the top: title, goal, architecture, tech stack, architecture decisions, file structure, pre-flight.
3. `extractChunkBody(planContents, chunkNumber)` — returns the verbatim content of the named chunk (heading line through `endLine` per `listChunks`).
4. `assembleAssignment({ planPath, planContents, chunkNumber, observations })` — returns the full Sonnet assignment string: preamble + plan header + prior observations (if any) + chunk body, joined with `\n---\n` separators. `observations` is a string (possibly empty) representing the relevant prior chunks' sections from the observations file.

The standing-rules preamble is a fixed template:

```
## Sonnet assignment — Chunk N of <plan-path>

Work in the repo root containing this plan.

Standing rules:
  - Do NOT restart services. The user verifies behavior themselves.
  - Do NOT commit. The user handles all commits.
  - Do NOT modify any file not listed in your chunk's "Touched files" section. No drive-by refactors.
  - Read any prior agent observations below before starting — they flag compounding issues you should account for.
  - When done, append a "## Chunk N — <YYYY-MM-DD>" section to <plan-stem>.observations.md noting anything you saw but did not fix (out-of-scope smells, conventions that drifted, things the next chunk should know). Do NOT fix them — just note them.
  - When done, report what changed and what the user needs to test.
```

Substitute `<plan-path>`, `<plan-stem>.observations.md`, and the chunk number `N` at assembly time.

The assembly output structure:

```
<preamble>

---

<plan header — verbatim>

---

## Prior agent observations

<observations content if non-empty, else "(none)">

---

<chunk body — verbatim>
```

When `chunkNumber === 1` OR the observations file does not exist OR contains no prior chunk sections, omit the `## Prior agent observations` block entirely (do not emit an empty section).

Implementation notes:

- Use a single regex to find chunk headings: `/^## Chunk (\d+)(?:\s+—\s+(.*))?$/m`. Capture the number and the name.
- Use a single regex to find terminal section headings: `/^## (Sonnet handoff prompts|Post-implementation notes|Architecture decisions|File structure overview|Pre-flight)$/m`. Only `Sonnet handoff prompts` and `Post-implementation notes` are terminal — the others are part of the plan header.
- Plan header end = line before the first `## Chunk` heading.
- Chunk body end = line before the next `## Chunk` heading OR the line before the first terminal section heading (whichever comes first), whichever applies for the named chunk.
- All line counts are 1-indexed for human readability in `--list-chunks` output.

Add a plain-language one-line comment above each exported function.

```js
// Extracts plan headers, chunk bodies, and prior agent observations from a plan markdown file.
// Used by --list-chunks, --chunk-range, and --chunk-content to assemble self-sufficient
// Sonnet assignments without requiring agents to read the whole plan file.

const CHUNK_HEADING_RE = /^## Chunk (\d+)(?:\s+—\s+(.*))?$/;
const TERMINAL_HEADING_RE = /^## (Sonnet handoff prompts|Post-implementation notes)$/;

// Return a sorted list of chunks found in the plan, with line ranges.
function listChunks(planContents) {
  const lines = planContents.split('\n');
  const headings = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(CHUNK_HEADING_RE);
    if (m) headings.push({ number: parseInt(m[1], 10), name: m[2] || '', lineIndex: i });
  }
  // Find first terminal section (if any) — caps the last chunk's range.
  let terminalLine = lines.length;
  for (let i = 0; i < lines.length; i++) {
    if (TERMINAL_HEADING_RE.test(lines[i])) { terminalLine = i; break; }
  }
  const out = [];
  for (let h = 0; h < headings.length; h++) {
    const startLine = headings[h].lineIndex + 1; // 1-indexed
    const nextStart = h + 1 < headings.length ? headings[h + 1].lineIndex : terminalLine;
    const endLine = nextStart; // 1-indexed line BEFORE the next heading
    out.push({
      number: headings[h].number,
      name: headings[h].name,
      startLine,
      endLine,
      lineCount: endLine - startLine + 1,
    });
  }
  return out;
}

// Return the plan header — everything before the first chunk heading.
function extractPlanHeader(planContents) {
  const lines = planContents.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (CHUNK_HEADING_RE.test(lines[i])) {
      return lines.slice(0, i).join('\n').trimEnd();
    }
  }
  return planContents.trimEnd();
}

// Return the verbatim body of one chunk by number, or null if not found.
function extractChunkBody(planContents, chunkNumber) {
  const chunks = listChunks(planContents);
  const target = chunks.find(c => c.number === chunkNumber);
  if (!target) return null;
  const lines = planContents.split('\n');
  return lines.slice(target.startLine - 1, target.endLine).join('\n').trimEnd();
}

// Build the standing-rules preamble for a chunk.
function buildPreamble(planPath, chunkNumber) {
  const path = require('path');
  const stem = path.basename(planPath, '.md');
  const obsName = `${stem}.observations.md`;
  return [
    `## Sonnet assignment — Chunk ${chunkNumber} of ${planPath}`,
    '',
    'Work in the repo root containing this plan.',
    '',
    'Standing rules:',
    '  - Do NOT restart services. The user verifies behavior themselves.',
    '  - Do NOT commit. The user handles all commits.',
    '  - Do NOT modify any file not listed in your chunk\'s "Touched files" section. No drive-by refactors.',
    '  - Read any prior agent observations below before starting — they flag compounding issues you should account for.',
    `  - When done, append a "## Chunk ${chunkNumber} — <YYYY-MM-DD>" section to ${obsName} noting anything you saw but did not fix (out-of-scope smells, conventions that drifted, things the next chunk should know). Do NOT fix them — just note them.`,
    '  - When done, report what changed and what the user needs to test.',
  ].join('\n');
}

// Filter the observations file contents to only include sections for chunks 1..(chunkNumber-1).
// Returns the filtered string, or empty string if no prior sections exist.
function filterPriorObservations(observationsContents, chunkNumber) {
  if (!observationsContents || chunkNumber <= 1) return '';
  const lines = observationsContents.split('\n');
  const sections = [];
  let current = null;
  for (const line of lines) {
    const m = line.match(/^## Chunk (\d+)/);
    if (m) {
      if (current) sections.push(current);
      current = { number: parseInt(m[1], 10), lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push(current);
  const prior = sections.filter(s => s.number < chunkNumber);
  if (prior.length === 0) return '';
  return prior.map(s => s.lines.join('\n').trimEnd()).join('\n\n');
}

// Assemble the full Sonnet assignment for one chunk.
function assembleAssignment({ planPath, planContents, chunkNumber, observations = '' }) {
  const preamble = buildPreamble(planPath, chunkNumber);
  const header = extractPlanHeader(planContents);
  const body = extractChunkBody(planContents, chunkNumber);
  if (body == null) {
    throw new Error(`assembleAssignment: chunk ${chunkNumber} not found in ${planPath}`);
  }
  const prior = filterPriorObservations(observations, chunkNumber);
  const parts = [preamble, '---', header, '---'];
  if (prior) {
    parts.push('## Prior agent observations\n\n' + prior, '---');
  }
  parts.push(body);
  return parts.join('\n\n');
}

module.exports = {
  listChunks,
  extractPlanHeader,
  extractChunkBody,
  buildPreamble,
  filterPriorObservations,
  assembleAssignment,
};
```

- [ ] **Step 2: Write `chunk-extractor.test.js`.**

Cover: `listChunks` finds all chunks with correct line ranges, `extractPlanHeader` stops at first chunk, `extractChunkBody` returns the right slice, `filterPriorObservations` filters by chunk number, `assembleAssignment` produces the expected structure with and without observations, terminal sections cap the last chunk's range.

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  listChunks,
  extractPlanHeader,
  extractChunkBody,
  filterPriorObservations,
  assembleAssignment,
} = require('./chunk-extractor.js');

const SAMPLE_PLAN = [
  '# Plan Title',
  '',
  '**Goal:** Build a thing.',
  '',
  '## Architecture decisions',
  '',
  '1. Decision one.',
  '2. Decision two.',
  '',
  '## Chunk 1 — First chunk',
  '',
  '**Goal:** First.',
  '',
  'Body of chunk 1.',
  '',
  '## Chunk 2 — Second chunk',
  '',
  '**Goal:** Second.',
  '',
  'Body of chunk 2.',
  '',
  '## Sonnet handoff prompts',
  '',
  'Trailing handoff content (should be excluded from chunk 2).',
].join('\n');

test('listChunks finds both chunks', () => {
  const chunks = listChunks(SAMPLE_PLAN);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].number, 1);
  assert.equal(chunks[0].name, 'First chunk');
  assert.equal(chunks[1].number, 2);
  assert.equal(chunks[1].name, 'Second chunk');
});

test('listChunks computes line ranges (1-indexed)', () => {
  const chunks = listChunks(SAMPLE_PLAN);
  // Chunk 1 starts at line 10 ("## Chunk 1 — First chunk")
  assert.equal(chunks[0].startLine, 10);
  // Chunk 2 starts at line 16
  assert.equal(chunks[1].startLine, 16);
  // Chunk 2 ends at line before "## Sonnet handoff prompts" (line 22) → line 21
  assert.equal(chunks[1].endLine, 21);
});

test('extractPlanHeader returns everything before first chunk', () => {
  const header = extractPlanHeader(SAMPLE_PLAN);
  assert.match(header, /# Plan Title/);
  assert.match(header, /Architecture decisions/);
  assert.match(header, /Decision one\./);
  assert.doesNotMatch(header, /Chunk 1/);
});

test('extractChunkBody returns the chunk slice', () => {
  const body = extractChunkBody(SAMPLE_PLAN, 1);
  assert.match(body, /## Chunk 1 — First chunk/);
  assert.match(body, /Body of chunk 1\./);
  assert.doesNotMatch(body, /Chunk 2/);
});

test('extractChunkBody returns null for missing chunk', () => {
  assert.equal(extractChunkBody(SAMPLE_PLAN, 99), null);
});

test('extractChunkBody for last chunk excludes terminal sections', () => {
  const body = extractChunkBody(SAMPLE_PLAN, 2);
  assert.match(body, /Body of chunk 2/);
  assert.doesNotMatch(body, /Trailing handoff content/);
  assert.doesNotMatch(body, /Sonnet handoff prompts/);
});

test('filterPriorObservations returns empty when chunkNumber is 1', () => {
  const obs = '## Chunk 1 — 2026-04-07\n\nNote.\n';
  assert.equal(filterPriorObservations(obs, 1), '');
});

test('filterPriorObservations returns only prior chunks', () => {
  const obs = [
    '## Chunk 1 — 2026-04-07',
    '',
    'First note.',
    '',
    '## Chunk 2 — 2026-04-07',
    '',
    'Second note.',
  ].join('\n');
  const filtered = filterPriorObservations(obs, 3);
  assert.match(filtered, /Chunk 1/);
  assert.match(filtered, /First note/);
  assert.match(filtered, /Chunk 2/);
  assert.match(filtered, /Second note/);
});

test('filterPriorObservations excludes own and future chunks', () => {
  const obs = [
    '## Chunk 1 — 2026-04-07',
    '',
    'First.',
    '',
    '## Chunk 2 — 2026-04-07',
    '',
    'Second.',
    '',
    '## Chunk 3 — 2026-04-07',
    '',
    'Third.',
  ].join('\n');
  const filtered = filterPriorObservations(obs, 2);
  assert.match(filtered, /First/);
  assert.doesNotMatch(filtered, /Second/);
  assert.doesNotMatch(filtered, /Third/);
});

test('assembleAssignment includes preamble, header, and chunk body', () => {
  const out = assembleAssignment({
    planPath: '/fake/plan.md',
    planContents: SAMPLE_PLAN,
    chunkNumber: 1,
  });
  assert.match(out, /## Sonnet assignment — Chunk 1/);
  assert.match(out, /Standing rules:/);
  assert.match(out, /Do NOT restart services/);
  assert.match(out, /Architecture decisions/);
  assert.match(out, /Body of chunk 1/);
});

test('assembleAssignment omits Prior agent observations section when chunk 1', () => {
  const out = assembleAssignment({
    planPath: '/fake/plan.md',
    planContents: SAMPLE_PLAN,
    chunkNumber: 1,
    observations: '## Chunk 1 — 2026-04-07\n\nFake.\n',
  });
  assert.doesNotMatch(out, /Prior agent observations/);
});

test('assembleAssignment includes Prior agent observations when relevant', () => {
  const out = assembleAssignment({
    planPath: '/fake/plan.md',
    planContents: SAMPLE_PLAN,
    chunkNumber: 2,
    observations: '## Chunk 1 — 2026-04-07\n\nPrior chunk note.\n',
  });
  assert.match(out, /## Prior agent observations/);
  assert.match(out, /Prior chunk note/);
});

test('assembleAssignment throws on missing chunk', () => {
  assert.throws(() => assembleAssignment({
    planPath: '/fake/plan.md',
    planContents: SAMPLE_PLAN,
    chunkNumber: 99,
  }), /chunk 99 not found/);
});
```

- [ ] **Step 3: Run.**

```bash
node --test hippocampus/lib/spec-check/chunk-extractor.test.js
```

Expected: 13 passing tests.

### Task 5.1: Write `spec-check.js`

- [ ] **Step 1: Write the CLI.**

```js
#!/usr/bin/env node
// spec-check — cross-check specs and plans in one or more folders for collisions,
// AND extract chunk assignments for Sonnet handoffs from a plan markdown file.

const fs = require('fs/promises');
const fsSync = require('fs');
const path = require('path');
const { walkSpecDir } = require('../lib/spec-check/walker.js');
const { parseFrontmatter } = require('../lib/spec-check/frontmatter-parser.js');
const { renderTemplate } = require('../lib/spec-check/schema.js');
const { detectAll } = require('../lib/spec-check/collision-detector.js');
const { renderReport } = require('../lib/spec-check/report-formatter.js');
const { listChunks, assembleAssignment } = require('../lib/spec-check/chunk-extractor.js');

// Parse argv into a structured options object.
function parseArgs(argv) {
  const opts = {
    dirs: [],
    template: null,
    strict: false,
    listChunks: null,       // plan path
    chunkRange: null,       // { plan, n }
    chunkContent: null,     // { plan, n }
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir') { opts.dirs.push(argv[++i]); }
    else if (a === '--template') { opts.template = argv[++i]; }
    else if (a === '--strict') { opts.strict = true; }
    else if (a === '--list-chunks') { opts.listChunks = argv[++i]; }
    else if (a === '--chunk-range') { opts.chunkRange = { plan: argv[++i], n: parseInt(argv[++i], 10) }; }
    else if (a === '--chunk-content') { opts.chunkContent = { plan: argv[++i], n: parseInt(argv[++i], 10) }; }
    else if (a === '--help' || a === '-h') { opts.help = true; }
    else { throw new Error(`unknown argument: ${a}`); }
  }
  return opts;
}

function printHelp() {
  console.log(`
spec-check — cross-check spec/plan markdown docs and extract chunk assignments

Usage:
  spec-check.js --dir <path> [--dir <path>...]   Scan folders for collisions
  spec-check.js --template spec                    Print spec frontmatter template
  spec-check.js --template plan                    Print plan frontmatter template
  spec-check.js --dir <path> --strict              Exit non-zero if headerless docs exist
  spec-check.js --list-chunks <plan>               List chunks in a plan with line ranges
  spec-check.js --chunk-range <plan> <n>           Print "L<start>-L<end>" for chunk n
  spec-check.js --chunk-content <plan> <n>         Print full Sonnet assignment for chunk n
`);
}

// Read the sibling observations file for a plan, or empty string if missing.
function readObservationsSync(planPath) {
  const dir = path.dirname(planPath);
  const stem = path.basename(planPath, '.md');
  const obsPath = path.join(dir, `${stem}.observations.md`);
  try { return fsSync.readFileSync(obsPath, 'utf8'); }
  catch { return ''; }
}

// Main orchestration.
async function main(argv) {
  let opts;
  try { opts = parseArgs(argv); }
  catch (err) { console.error(err.message); printHelp(); return 3; }

  if (opts.help) { printHelp(); return 0; }

  if (opts.template) {
    try { console.log(renderTemplate(opts.template)); return 0; }
    catch (err) { console.error(err.message); return 3; }
  }

  // Chunk-extractor surfaces — operate on a single plan file, not a folder.
  if (opts.listChunks) {
    try {
      const contents = await fs.readFile(path.resolve(opts.listChunks), 'utf8');
      const chunks = listChunks(contents);
      if (chunks.length === 0) { console.log('(no chunks found)'); return 0; }
      for (const c of chunks) {
        console.log(`Chunk ${c.number}: ${c.name}  [L${c.startLine}-L${c.endLine}, ${c.lineCount} lines]`);
      }
      return 0;
    } catch (err) { console.error(`spec-check: ${err.message}`); return 3; }
  }

  if (opts.chunkRange) {
    try {
      const contents = await fs.readFile(path.resolve(opts.chunkRange.plan), 'utf8');
      const chunks = listChunks(contents);
      const target = chunks.find(c => c.number === opts.chunkRange.n);
      if (!target) { console.error(`spec-check: chunk ${opts.chunkRange.n} not found`); return 3; }
      console.log(`L${target.startLine}-L${target.endLine}`);
      return 0;
    } catch (err) { console.error(`spec-check: ${err.message}`); return 3; }
  }

  if (opts.chunkContent) {
    try {
      const planPath = path.resolve(opts.chunkContent.plan);
      const contents = await fs.readFile(planPath, 'utf8');
      const observations = readObservationsSync(planPath);
      const out = assembleAssignment({
        planPath,
        planContents: contents,
        chunkNumber: opts.chunkContent.n,
        observations,
      });
      console.log(out);
      return 0;
    } catch (err) { console.error(`spec-check: ${err.message}`); return 3; }
  }

  if (opts.dirs.length === 0) {
    console.error('spec-check: must pass --dir, --template, --list-chunks, --chunk-range, or --chunk-content');
    printHelp();
    return 3;
  }

  const allFiles = [];
  for (const dir of opts.dirs) {
    try {
      const files = await walkSpecDir(path.resolve(dir));
      allFiles.push(...files);
    } catch (err) {
      console.error(`spec-check: ${err.message}`);
      return 3;
    }
  }

  const docs = [];
  const headerless = [];
  for (const filePath of allFiles) {
    const contents = await fs.readFile(filePath, 'utf8');
    const lineCount = contents.split('\n').length;
    const id = path.basename(filePath, '.md');
    const r = parseFrontmatter(contents, filePath);
    if (r.ok) {
      docs.push({ id, filePath, lineCount, data: r.data });
    } else if (r.errors[0].code === 'HEADERLESS') {
      headerless.push({ id, filePath, lineCount });
    } else {
      // Validation errors — surface them but do not add to docs.
      console.error(`spec-check: ${filePath} has errors:`);
      for (const e of r.errors) console.error(`  - [${e.code}] ${e.message}`);
    }
  }

  const collisions = detectAll(docs);
  const report = renderReport({
    docs, collisions, headerless,
    meta: { folderCount: opts.dirs.length, docCount: allFiles.length },
  });
  console.log(report);

  // Exit code logic.
  const hasHard =
    collisions.fileCollisions.some(c => c.severity === 'hard') ||
    collisions.schemaCollisions.length > 0 ||
    collisions.doubleEmits.length > 0;
  if (hasHard) return 1;
  if (opts.strict && headerless.length > 0) return 2;
  return 0;
}

// Only run if invoked directly.
if (require.main === module) {
  main(process.argv.slice(2)).then(code => process.exit(code)).catch(err => {
    console.error('spec-check: unexpected error:', err);
    process.exit(3);
  });
}

module.exports = { main, parseArgs };
```

- [ ] **Step 2: Write the integration test.**

Create `thebrain-package/hippocampus/scripts/spec-check.test.js`. Build a fixture folder with known docs and assert on the captured stdout / exit code.

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { main } = require('./spec-check.js');

// Capture console output for assertion.
function captureConsole(fn) {
  const origLog = console.log;
  const origErr = console.error;
  const chunks = { log: [], err: [] };
  console.log = (...args) => chunks.log.push(args.join(' '));
  console.error = (...args) => chunks.err.push(args.join(' '));
  return fn().then(code => {
    console.log = origLog;
    console.error = origErr;
    return { code, stdout: chunks.log.join('\n'), stderr: chunks.err.join('\n') };
  }).catch(err => {
    console.log = origLog;
    console.error = origErr;
    throw err;
  });
}

// Make a temp fixture folder with named files.
async function makeFixture(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-check-'));
  for (const [rel, contents] of Object.entries(files)) {
    const full = path.join(root, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, contents);
  }
  return root;
}

// Minimal valid frontmatter helper.
function validSpec(extras = '') {
  return [
    '---',
    'doc_type: spec',
    'date: 2026-04-07',
    'status: proposed',
    'feature_area: features/x',
    'touches:',
    '  files: []',
    '  schema: []',
    '  events:',
    '    emits: []',
    '    subscribes: []',
    'depends_on: []',
    extras,
    '---',
    '',
    '# Body',
  ].filter(l => l !== '').join('\n') + '\n';
}

test('CLI --template spec prints a template', async () => {
  const r = await captureConsole(() => main(['--template', 'spec']));
  assert.equal(r.code, 0);
  assert.match(r.stdout, /doc_type: spec/);
});

test('CLI --template plan prints a template with implements', async () => {
  const r = await captureConsole(() => main(['--template', 'plan']));
  assert.equal(r.code, 0);
  assert.match(r.stdout, /implements:/);
});

test('CLI --dir with clean docs returns 0', async () => {
  const root = await makeFixture({
    'a.md': validSpec(),
    'b.md': validSpec(),
  });
  const r = await captureConsole(() => main(['--dir', root]));
  assert.equal(r.code, 0);
  assert.match(r.stdout, /exit_code: 0/);
});

test('CLI --dir detects file collision as hard', async () => {
  // Both docs declare a modify on features/x.js — hard collision.
  const doc = [
    '---',
    'doc_type: spec',
    'date: 2026-04-07',
    'status: proposed',
    'feature_area: features/x',
    'touches:',
    '  files:',
    '    - path: features/x.js',
    '      mode: modify',
    '      spec_section: L1-L10',
    '  schema: []',
    '  events:',
    '    emits: []',
    '    subscribes: []',
    'depends_on: []',
    '---',
  ].join('\n') + '\n';
  const root = await makeFixture({ 'a.md': doc, 'b.md': doc });
  const r = await captureConsole(() => main(['--dir', root]));
  assert.equal(r.code, 1);
  assert.match(r.stdout, /features\/x\.js/);
});

test('CLI --strict returns 2 on headerless', async () => {
  const root = await makeFixture({
    'clean.md': validSpec(),
    'headerless.md': '# just a heading\n',
  });
  const r = await captureConsole(() => main(['--dir', root, '--strict']));
  assert.equal(r.code, 2);
});

test('CLI --dir bad path returns 3', async () => {
  const r = await captureConsole(() => main(['--dir', '/definitely/not/here']));
  assert.equal(r.code, 3);
});

test('CLI with no args prints help and returns 3', async () => {
  const r = await captureConsole(() => main([]));
  assert.equal(r.code, 3);
});

// --- Chunk-extractor surface tests ---

// A minimal plan fixture with two chunks for testing the extractor surfaces.
const SAMPLE_PLAN_FILE = [
  '# Sample Plan',
  '',
  '**Goal:** Test the chunk extractor.',
  '',
  '## Architecture decisions',
  '',
  '1. Use chunks.',
  '',
  '## Chunk 1 — First',
  '',
  '**Goal:** Do thing one.',
  '',
  'Body 1.',
  '',
  '## Chunk 2 — Second',
  '',
  '**Goal:** Do thing two.',
  '',
  'Body 2.',
  '',
  '## Sonnet handoff prompts',
  '',
  'Trailing.',
].join('\n');

test('CLI --list-chunks prints chunk list', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-check-plan-'));
  const planPath = path.join(root, 'sample-plan.md');
  await fs.writeFile(planPath, SAMPLE_PLAN_FILE);
  const r = await captureConsole(() => main(['--list-chunks', planPath]));
  assert.equal(r.code, 0);
  assert.match(r.stdout, /Chunk 1: First/);
  assert.match(r.stdout, /Chunk 2: Second/);
  assert.match(r.stdout, /L\d+-L\d+/);
});

test('CLI --chunk-range prints L<start>-L<end>', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-check-plan-'));
  const planPath = path.join(root, 'sample-plan.md');
  await fs.writeFile(planPath, SAMPLE_PLAN_FILE);
  const r = await captureConsole(() => main(['--chunk-range', planPath, '1']));
  assert.equal(r.code, 0);
  assert.match(r.stdout, /^L\d+-L\d+$/m);
});

test('CLI --chunk-range returns 3 on missing chunk', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-check-plan-'));
  const planPath = path.join(root, 'sample-plan.md');
  await fs.writeFile(planPath, SAMPLE_PLAN_FILE);
  const r = await captureConsole(() => main(['--chunk-range', planPath, '99']));
  assert.equal(r.code, 3);
});

test('CLI --chunk-content includes preamble, header, and chunk body', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-check-plan-'));
  const planPath = path.join(root, 'sample-plan.md');
  await fs.writeFile(planPath, SAMPLE_PLAN_FILE);
  const r = await captureConsole(() => main(['--chunk-content', planPath, '1']));
  assert.equal(r.code, 0);
  assert.match(r.stdout, /## Sonnet assignment — Chunk 1/);
  assert.match(r.stdout, /Standing rules:/);
  assert.match(r.stdout, /Architecture decisions/);
  assert.match(r.stdout, /Body 1\./);
  assert.doesNotMatch(r.stdout, /Body 2\./);
});

test('CLI --chunk-content omits Prior agent observations when chunk is 1', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-check-plan-'));
  const planPath = path.join(root, 'sample-plan.md');
  await fs.writeFile(planPath, SAMPLE_PLAN_FILE);
  // Create observations file with a Chunk 1 entry — should be ignored when requesting Chunk 1.
  await fs.writeFile(path.join(root, 'sample-plan.observations.md'),
    '## Chunk 1 — 2026-04-07\n\nNote.\n');
  const r = await captureConsole(() => main(['--chunk-content', planPath, '1']));
  assert.equal(r.code, 0);
  assert.doesNotMatch(r.stdout, /Prior agent observations/);
});

test('CLI --chunk-content includes Prior agent observations from sibling file', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-check-plan-'));
  const planPath = path.join(root, 'sample-plan.md');
  await fs.writeFile(planPath, SAMPLE_PLAN_FILE);
  await fs.writeFile(path.join(root, 'sample-plan.observations.md'),
    '## Chunk 1 — 2026-04-07\n\nFlagged a thing.\n');
  const r = await captureConsole(() => main(['--chunk-content', planPath, '2']));
  assert.equal(r.code, 0);
  assert.match(r.stdout, /## Prior agent observations/);
  assert.match(r.stdout, /Flagged a thing/);
});
```

- [ ] **Step 3: Run.**

```bash
node --test hippocampus/scripts/spec-check.test.js
```

Expected: 13 passing (7 original + 6 chunk-extractor surface tests).

- [ ] **Step 4: Full suite sanity check.**

```bash
node --test hippocampus/lib/spec-check/ hippocampus/scripts/spec-check.test.js
```

Expected: ~75 tests passing total across all chunks (Chunk 1: 14, Chunk 2: 24, Chunk 3: 12, Chunk 4: 6, Chunk 5 lib chunk-extractor: 13, Chunk 5 CLI integration: 13). Report counts.

---

## Chunk 6 — Rule file, tool-index entry, retroactive spec frontmatter (bootstrap closure)

**Goal:** Create the signpost rule file, add the tool-index entry that regenerates into `brain-tools.md`, and retroactively add frontmatter to the spec that this plan implements (closing the bootstrap loop). After Chunk 6 the tool can be run against `thebrain-package/docs/superpowers/` and report exactly one compliant plan (this plan), one compliant spec (the source spec), and zero headerless docs.

**Non-goals (do NOT do these):**

- Do NOT add frontmatter to the older 2026-03 specs in `thebrain-package/docs/superpowers/specs/` (`2026-03-28-multi-language-extractors-design.md`, `2026-03-29-namespace-connection-resolution-design.md`, `2026-04-02-flow-graph-design.md`). They are pre-existing and out of scope. The tool will list them as headerless on its first run; that is expected. They are backlog work.
- Do NOT restructure `thebrain-package/docs/tool-index.md`. Insert the new section in the right neighborhood and leave everything else alone.
- Do NOT modify the source spec's body content beyond: (a) striking `spec:` from the schema section, (b) renaming nested `spec:` → `doc:` in the `depends_on` example, (c) replacing the bootstrap-note paragraph with a status line, (d) prepending the frontmatter block. Do not "improve" prose, fix typos, or restructure sections.
- Do NOT change the source spec's filename or path.
- Do NOT add new fields to the schema while you are editing the schema section. Chunk 6 reflects locked decisions; it does not make new ones.
- Do NOT run the spec-check tool against `drip/docs/superpowers/` in this chunk. That is the next session's work and is intentionally out of scope here — running it now risks producing noise and discovering work that is not on this plan.
- Do NOT modify `~/.claude/rules/brain-tools.md` directly. That file is regenerated from `tool-index.md` on wrapup; the tool-index edit is the source of truth.
- Do NOT touch any code in `lib/spec-check/` or `scripts/spec-check.js`. Chunk 6 is documentation + bootstrap, not code.

**Read first (line ranges only):**

- `thebrain-package/docs/tool-index.md` (whole file, probably <200 lines — check with `wc -l` first) — to pick the right section insertion point.
- `thebrain-package/docs/superpowers/specs/2026-04-07-spec-cross-check-tool-design.md:72-196` — the schema section. Chunk 6 strikes the `spec:` field and renames nested `spec:` → `doc:` in the `depends_on` example.
- `thebrain-package/docs/superpowers/specs/2026-04-07-spec-cross-check-tool-design.md:1-10` — to know where to inject the retroactive frontmatter block.

**Touched files:**
- Create: `~/.claude/rules/spec-management.md`
- Modify: `thebrain-package/docs/tool-index.md`
- Modify: `thebrain-package/docs/superpowers/specs/2026-04-07-spec-cross-check-tool-design.md`

### Task 6.1: Create `~/.claude/rules/spec-management.md`

- [ ] **Step 1: Write the rule file.**

Create `/home/sonderbread/.claude/rules/spec-management.md` with this exact content:

```markdown
# Spec & Plan Management

When you are writing a spec, writing a plan, cross-checking before planning,
or executing a plan in a Sonnet session, follow this workflow.

## Frontmatter is required

Every spec and every plan must have a YAML frontmatter block at the top of the
file. The canonical template is published by the script — not inlined here, so
this rule file stays small.

Before writing a new spec or plan, run:

    node /home/sonderbread/websites/thebrain-package/hippocampus/scripts/spec-check.js --template spec
    node /home/sonderbread/websites/thebrain-package/hippocampus/scripts/spec-check.js --template plan

Copy the template verbatim into the new file and fill it in honestly. Document
ids are the filename stem (e.g. `2026-04-07-inbox-lifecycle-redesign`) — there
is no separate `spec:` field.

## Cross-check before planning

Before invoking writing-plans on any spec, cross-check the full collection of
specs and plans in the project's design folder:

    node /home/sonderbread/websites/thebrain-package/hippocampus/scripts/spec-check.js --dir <path>

The script reports collisions between docs (files, schema, events) and
dependency-order issues. Resolve any hard collisions before proceeding with
plan writing. Warnings and info notices are for human judgment.

## Plan structure: chunks must be self-sufficient

Each `## Chunk N — <name>` section in a plan must be self-contained: an agent
working that chunk should never need to read sibling chunks or trailing handoff
sections. A chunk has these required elements in this order:

1. `**Goal:**` — narrow, 2-3 sentences. What this chunk produces.
2. `**Non-goals:**` — bullet list of what NOT to do. The planner sees the whole
   picture and sets the boundaries the executing agent cannot see around. Things
   like "do not modify other chunks' files," "do not add this dependency," "do
   not refactor neighboring code." This is mandatory — Claude's helpfulness
   is a liability inside a chunk's narrow scope.
3. `**Read first (line ranges only):**` — bullet list of `path:start-end` refs
   for files the agent must read before starting. Always line ranges, never
   whole files.
4. `**Touched files:**` — explicit Create/Modify/Delete list. The agent must
   not touch any file outside this list.
5. `### Task N.M:` numbered tasks with `- [ ]` checkboxes. Each step is one
   small action with the exact code/command/expected output.

## Plans no longer need a trailing handoff section

The previous convention (a `## Sonnet handoff prompts` section at the bottom
of the plan with copyable per-chunk blocks) is obsolete. Sonnet agents now
receive their entire assignment from one shell command:

    node /home/sonderbread/websites/thebrain-package/hippocampus/scripts/spec-check.js --chunk-content <plan-path> <chunk-number>

That command output assembles four things automatically:

1. **Standing-rules preamble** (tool-injected) — no restarts, no commits,
   respect Touched files list, read prior observations, append observations
   when done.
2. **Plan header** — everything from the top of the plan through the line
   before the first `## Chunk` heading. Carries goal, architecture decisions,
   tech stack, file structure, pre-flight context. The agent sees the WHY
   behind locked architectural decisions and won't relitigate them mid-chunk.
3. **Prior agent observations** (if present) — sections from the sibling
   `<plan-stem>.observations.md` file for any earlier chunk. Lets compounding
   issues flagged by upstream agents reach downstream agents without manual
   relay.
4. **Chunk body** — the specific `## Chunk N` section verbatim.

## Agent observations file

When an agent finishes its chunk, it appends a section to a sibling file
named `<plan-stem>.observations.md` in the same directory as the plan. The
section format is:

    ## Chunk N — YYYY-MM-DD

    Things observed but NOT fixed (out of scope for this chunk):
    - <observation 1>
    - <observation 2>

Observations are intentionally append-only and intentionally NOT fixed by the
observing agent. The point is to surface compounding errors and convention
drift without scope creep. The next chunk's agent sees them automatically via
`--chunk-content` and can adjust behavior or note them again if still relevant.

Do NOT use the observations file for status updates, progress notes, or
implementation details. It is exclusively for things-not-fixed-because-out-of-scope.

## Headerless docs

Older specs and plans written before this tool existed will be flagged as
headerless. The fix is to add frontmatter — the script's `--template` output is
the starting point. Don't plan around a headerless doc; fix it first.

## Script reference

See `~/.claude/rules/brain-tools.md` for full script documentation and flags.
Regenerated on every session start from `thebrain-package/docs/tool-index.md`.
```

### Task 6.2: Add tool-index entry

- [ ] **Step 1: Read `tool-index.md` to find the right insertion point.**

```bash
wc -l thebrain-package/docs/tool-index.md
```

Then open the file, find the section where hippocampus content-search tools are documented (grep.js / classify.js / flow.js — if present) and insert the new section after them (or at the end of the hippocampus section if there's no clear neighbor).

- [ ] **Step 2: Append the section.**

Insert this markdown section verbatim:

```markdown
## Spec / Plan Cross-Check + Chunk Extractor (~variable tokens)

Two surfaces in one tool:

**1. Cross-check** — Detects collisions across specs and plans in a folder
before planning commits engineering effort. File overlaps, schema collisions,
dangling event subscribes, same-file double-emits, and dependency-order
violations. Produces a two-section report (human summary + Claude-readable
index) with line-range references for token-cheap follow-up reads.

**2. Chunk extractor** — Reads a plan markdown file and emits a self-sufficient
Sonnet assignment for one chunk. The output assembles a standing-rules preamble,
the plan header (architecture decisions and context), prior agent observations
(from the sibling `<plan-stem>.observations.md` file), and the chunk body.
This is the standard handoff mechanism for executing plans — Sonnet sessions
get their entire assignment from one shell command instead of from copy-pasted
blocks.

    node thebrain-package/hippocampus/scripts/spec-check.js <command>

| Flag | What it does |
|------|-------------|
| `--dir <path>` | Scan a folder recursively for specs/plans. Repeatable. |
| `--template spec\|plan` | Print a ready-to-fill frontmatter template (doubles as schema reference). |
| `--strict` | Exit non-zero (2) if headerless docs are present. |
| `--list-chunks <plan>` | List chunks in a plan with line ranges and line counts. |
| `--chunk-range <plan> <n>` | Print `L<start>-L<end>` for one chunk. |
| `--chunk-content <plan> <n>` | Print full Sonnet assignment for one chunk (preamble + plan header + prior observations + chunk body). |

**When to use cross-check:** before invoking `writing-plans` on a new spec, to
catch overlap with other in-flight or proposed work. Also useful when adding a
new spec to an already-busy folder.

**When to use chunk extractor:** every time you hand a plan chunk to a fresh
Sonnet session. The single command replaces the old "copy block at the bottom
of the plan" pattern.

**Paths** are anything — the tool is layout-agnostic. Works on
`docs/superpowers/specs/`, `docs/design/`, `planning/`, or anywhere else a
project parks its design docs.

**Id rule:** every doc is identified by its filename stem (basename without
`.md`). No separate `spec:` field in the frontmatter. Cross-references in
`depends_on` and `implements` use the filename stem directly.
```

### Task 6.3: Retroactive frontmatter on the source spec

- [ ] **Step 1: Amend the schema section.**

In `thebrain-package/docs/superpowers/specs/2026-04-07-spec-cross-check-tool-design.md`, edit the "Required fields" section (around §L78-L86). Remove the `spec:` field line entirely. The edited block should read:

```yaml
---
doc_type: spec                        # spec | plan
date: YYYY-MM-DD
status: proposed                      # proposed | in-plan | in-flight | shipped
feature_area: <short-path-or-label>   # e.g. features/alerts, or "cross-cutting"
---
```

Add a paragraph immediately after noting: "Doc ids are the filename stem (everything after any date prefix, minus the `.md` extension). Cross-references in `depends_on` and `implements` use this stem directly."

- [ ] **Step 2: Rename nested `spec:` → `doc:` in the `depends_on` example.**

Find the `depends_on` example block (around §L172-L178). Change:

```yaml
depends_on:
  - spec: spec-b-project-management
    reason: "requires project_thread_links table to exist"
```

To:

```yaml
depends_on:
  - doc: 2026-04-06-spec-b-project-management
    reason: "requires project_thread_links table to exist"
```

Update the prose below it: `spec` is the filename stem of another doc in the collection → `doc` is the filename stem of another doc in the collection.

- [ ] **Step 3: Remove `spec` field from depends_on prose.**

Find the paragraph that says "`spec` is the kebab-case identifier of another doc in the collection (matches the `spec` field in that doc's frontmatter)." and replace with: "`doc` is the filename stem of another doc in the collection (e.g., `2026-04-07-forums-design`)."

- [ ] **Step 4: Add frontmatter to the top of the spec.**

Prepend a frontmatter block immediately above the `# Spec/Plan Cross-Check Tool — Design Spec` line. Use this block:

```yaml
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
```

**Important:** after adding the frontmatter, remove the "Bootstrap note" paragraph (around §L5) that says "This spec intentionally has no YAML frontmatter..." — that condition is no longer true. Replace it with a one-line note: `**Status:** Frontmatter added 2026-04-07 after Chunk 6 of the implementation plan shipped.`

### Task 6.4: Run the tool against itself

- [ ] **Step 1: Run the tool on the brain docs folder.**

```bash
node thebrain-package/hippocampus/scripts/spec-check.js --dir thebrain-package/docs/superpowers
```

Expected: report shows 2 compliant docs (`2026-04-07-spec-cross-check-tool-design` and `2026-04-07-spec-cross-check-tool-plan`), 0 headerless docs in superpowers/, 0 hard collisions. Exit code 0.

If there are OTHER docs in `thebrain-package/docs/superpowers/specs/` that are headerless (the three from 2026-03-28, 2026-03-29, 2026-04-02), the report will list them as headerless. That's expected — they're pre-existing specs that predate this tool. Note them in the user-facing summary but do NOT add frontmatter to them in this chunk; that's separate backlog work.

- [ ] **Step 2: Report to user.**

Tell the user:
- Total tests passing (final count across all chunks).
- Final tool output pasted verbatim.
- Any headerless docs detected (pre-existing specs that need follow-up work).
- Confirm `~/.claude/rules/spec-management.md` was created and will be loaded on next session start.
- Confirm `thebrain-package/docs/tool-index.md` was amended and will regenerate into `brain-tools.md` on next wrapup.
- Remind the user that the tool is ready to run on `drip/docs/superpowers/` too — which was the driving use case from the original [d5968524] session.

Do NOT restart services. Do NOT commit.

---

## Sonnet handoff prompts

Each block below is a self-contained instruction for a fresh Sonnet session. Copy the block into a `/clear`ed session and run it. Each prompt tells the agent only the line ranges it needs from this plan, the spec, and any other reference files — no whole-file reads.

### Chunk 1 handoff

```
You're implementing Chunk 1 of the spec-check tool plan. Work in /home/sonderbread/websites.

Read only these ranges:
- /home/sonderbread/websites/thebrain-package/docs/superpowers/plans/2026-04-07-spec-cross-check-tool-plan.md:150-531 (this chunk's spec)
- /home/sonderbread/websites/thebrain-package/docs/superpowers/specs/2026-04-07-spec-cross-check-tool-design.md:72-196 (frontmatter schema source of truth)
- /home/sonderbread/websites/CLAUDE.md (whole file, ~60 lines — shared standards)

Your job: create four files in /home/sonderbread/websites/thebrain-package/hippocampus/lib/spec-check/:
- schema.js (canonical SCHEMA object + renderTemplate function + getValidTypes)
- schema.test.js (7 tests — see plan)
- walker.js (async walkSpecDir, symlink-safe, skip hidden/node_modules)
- walker.test.js (7 tests — see plan)

Code is spelled out in the plan. Follow it exactly. Add a plain-language comment on every exported function and the SCHEMA object per the websites/CLAUDE.md rule.

Run: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/lib/spec-check/`
Expected: 14 passing tests.

Do NOT restart services. Do NOT commit — the user handles commits. Report: files created, final test count.
```

### Chunk 2 handoff

```
You're implementing Chunk 2 of the spec-check tool plan. Work in /home/sonderbread/websites.

Read only these ranges:
- /home/sonderbread/websites/thebrain-package/docs/superpowers/plans/2026-04-07-spec-cross-check-tool-plan.md:532-1099 (this chunk's spec)
- /home/sonderbread/websites/thebrain-package/hippocampus/lib/spec-check/schema.js:1-80 (the SCHEMA object the validator checks against — created in Chunk 1)
- /home/sonderbread/websites/thebrain-package/docs/superpowers/specs/2026-04-07-spec-cross-check-tool-design.md:72-196 (frontmatter schema)

Your job: create four files in /home/sonderbread/websites/thebrain-package/hippocampus/lib/spec-check/:
- yaml-parser.js (hand-rolled subset parser — NO js-yaml dependency)
- yaml-parser.test.js (14 tests — see plan)
- frontmatter-parser.js (extracts ---...--- block, calls yaml-parser, validates via SCHEMA, enforces from_file cross-rule)
- frontmatter-parser.test.js (10 tests — see plan)

The YAML parser must handle: flat scalars, nested maps, lists of scalars, lists of maps with multiple keys, quoted strings with colons, null/~, [], {}, integers, comments (full-line only). NOT: anchors, aliases, multiline strings, inline comments, flow-style maps.

If the first pass fails on multi-key list items (test 10 or 11 in yaml-parser.test.js), refactor parseList's continuation loop per the plan's "Known subtlety" note.

The frontmatter-parser MUST enforce: every touches.events.emits[].from_file must also appear as a path in touches.files[] (decision 2 — see plan line ~93).

Run: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/lib/spec-check/`
Expected: 38 passing tests (14 from Chunk 1 + 14 yaml + 10 frontmatter).

Do NOT restart services. Do NOT commit. Report: files created, test counts.
```

### Chunk 3 handoff

```
You're implementing Chunk 3 of the spec-check tool plan. Work in /home/sonderbread/websites.

Read only these ranges:
- /home/sonderbread/websites/thebrain-package/docs/superpowers/plans/2026-04-07-spec-cross-check-tool-plan.md:1100-1456 (this chunk's spec)
- /home/sonderbread/websites/thebrain-package/docs/superpowers/specs/2026-04-07-spec-cross-check-tool-design.md:247-266 (detection rules source of truth)
- /home/sonderbread/websites/thebrain-package/hippocampus/lib/spec-check/frontmatter-parser.js:1-30 (confirms doc shape — created in Chunk 2)

Your job: create two files in /home/sonderbread/websites/thebrain-package/hippocampus/lib/spec-check/:
- collision-detector.js (pure functions: detectFileCollisions, detectSchemaCollisions, detectDanglingSubscribes, detectDoubleEmits, detectDependencyOrderIssues + detectAll)
- collision-detector.test.js (12 tests — see plan)

Every rule function takes a docs[] array and returns an array of collision records. Pure functions — no filesystem, no parsing. Use the makeDoc factory in the test file to build synthetic fixtures.

Run: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/lib/spec-check/collision-detector.test.js`
Expected: 12 passing.

Then full suite: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/lib/spec-check/`
Expected: 50 passing total (14+24+12).

Do NOT restart services. Do NOT commit. Report: files created, test counts.
```

### Chunk 4 handoff

```
You're implementing Chunk 4 of the spec-check tool plan. Work in /home/sonderbread/websites.

Read only these ranges:
- /home/sonderbread/websites/thebrain-package/docs/superpowers/plans/2026-04-07-spec-cross-check-tool-plan.md:1457-1656 (this chunk's spec)
- /home/sonderbread/websites/thebrain-package/docs/superpowers/specs/2026-04-07-spec-cross-check-tool-design.md:270-374 (example output — the formatter must match this shape)

Your job: create two files in /home/sonderbread/websites/thebrain-package/hippocampus/lib/spec-check/:
- report-formatter.js (renderReport, renderHumanSummary, renderClaudeIndex + helpers)
- report-formatter.test.js (6 tests — see plan)

Pure string-building. No filesystem. Match the spec's example output exactly — banner, doc list, HEADERLESS section (conditional), HUMAN SUMMARY with [C1][C2] numbered collisions, CLAUDE-READABLE INDEX with YAML-ish keys, final exit_code line.

computeExitCode returns 1 on any hard collision, 0 otherwise. The CLI adds --strict override for headerless (that's Chunk 5, not here).

Run: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/lib/spec-check/report-formatter.test.js`
Expected: 6 passing.

Full suite: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/lib/spec-check/`
Expected: 56 passing total.

Do NOT restart services. Do NOT commit. Report: files created, test counts.
```

### Chunk 5 handoff

```
You're implementing Chunk 5 of the spec-check tool plan. Work in /home/sonderbread/websites.

Read only these ranges:
- /home/sonderbread/websites/thebrain-package/docs/superpowers/plans/2026-04-07-spec-cross-check-tool-plan.md:1657-2480 (this chunk's spec)
- /home/sonderbread/websites/thebrain-package/docs/superpowers/specs/2026-04-07-spec-cross-check-tool-design.md:208-225 (CLI interface)
- /home/sonderbread/websites/thebrain-package/hippocampus/scripts/query.js:1-40 (existing CLI style reference — if it exists)

Your job: create two files in /home/sonderbread/websites/thebrain-package/hippocampus/scripts/:
- spec-check.js (CLI entry point — argument parsing, orchestration, exit codes)
- spec-check.test.js (7 integration tests using tmp fixture folders)

Wire together: walker → frontmatter-parser → collision-detector → report-formatter. Support --dir (repeatable), --template spec|plan, --strict, --help.

Exit codes: 0 clean, 1 hard collisions, 2 --strict with headerless, 3 arg/path errors.

Integration tests capture console.log/error, use makeFixture to build temp folders, assert on stdout shape and exit code.

Run: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/scripts/spec-check.test.js`
Expected: 7 passing.

Full suite: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/lib/spec-check/ hippocampus/scripts/spec-check.test.js`
Expected: ~63 passing total.

Then smoke-test manually:
  node /home/sonderbread/websites/thebrain-package/hippocampus/scripts/spec-check.js --template spec
  node /home/sonderbread/websites/thebrain-package/hippocampus/scripts/spec-check.js --template plan
  node /home/sonderbread/websites/thebrain-package/hippocampus/scripts/spec-check.js --dir /home/sonderbread/websites/thebrain-package/docs/superpowers

The last command will show the source spec as HEADERLESS (expected — Chunk 6 fixes it) and this plan as compliant.

Do NOT restart services. Do NOT commit. Report: files created, test counts, output from the three smoke commands.
```

### Chunk 6 handoff

```
You're implementing Chunk 6 of the spec-check tool plan (final chunk — bootstrap closure). Work in /home/sonderbread/websites.

Read only these ranges:
- /home/sonderbread/websites/thebrain-package/docs/superpowers/plans/2026-04-07-spec-cross-check-tool-plan.md:2481-2799 (this chunk's spec)
- /home/sonderbread/websites/thebrain-package/docs/superpowers/specs/2026-04-07-spec-cross-check-tool-design.md:1-10 (top of spec — where to inject frontmatter)
- /home/sonderbread/websites/thebrain-package/docs/superpowers/specs/2026-04-07-spec-cross-check-tool-design.md:72-196 (schema section — strike `spec:` field, rename nested `spec:` to `doc:`)
- /home/sonderbread/websites/thebrain-package/docs/tool-index.md (whole file — run `wc -l` first; insert a new section)

Your job — three sub-tasks:

1. CREATE /home/sonderbread/.claude/rules/spec-management.md with the exact content in the plan.

2. MODIFY /home/sonderbread/websites/thebrain-package/docs/tool-index.md — insert the "Spec / Plan Cross-Check" section (see plan) after existing hippocampus content-search tools (grep.js/classify.js/flow.js) or at the end of the hippocampus section.

3. MODIFY /home/sonderbread/websites/thebrain-package/docs/superpowers/specs/2026-04-07-spec-cross-check-tool-design.md:
   a. Strike the `spec: <kebab-case-identifier>` line from the Required fields block (around §L78-L86).
   b. Add a short paragraph after that block noting ids = filename stem.
   c. Rename nested `spec:` → `doc:` inside the `depends_on` example (around §L172-L178) AND update the value to a filename stem like `2026-04-06-spec-b-project-management`.
   d. Update prose: "`spec` is the kebab-case identifier..." → "`doc` is the filename stem of another doc in the collection".
   e. Prepend frontmatter block to the very top of the file (before `# Spec/Plan Cross-Check Tool — Design Spec`). Use the block in the plan's Task 6.3 Step 4.
   f. Remove the "Bootstrap note" paragraph (around §L5) — replace with `**Status:** Frontmatter added 2026-04-07 after Chunk 6 of the implementation plan shipped.`

Verify: run the tool on the brain docs folder:
  node /home/sonderbread/websites/thebrain-package/hippocampus/scripts/spec-check.js --dir /home/sonderbread/websites/thebrain-package/docs/superpowers

Expected: the source spec now shows as compliant, the plan shows as compliant, exit code 0 (unless pre-existing 2026-03 specs still show as HEADERLESS — that's expected and out of scope for this chunk; note them in your report).

Do NOT add frontmatter to the older 2026-03 specs in this chunk — that's separate backlog work.

Do NOT restart services. Do NOT commit. Report:
- Files created/modified.
- Final test count (run full suite one more time).
- Tool output on thebrain-package/docs/superpowers (paste verbatim).
- Any headerless pre-existing specs detected.
- Confirmation that ~/.claude/rules/spec-management.md exists and that tool-index.md was amended.
```

---

## Post-implementation notes

After Chunk 6 ships:

1. **Session-start regeneration.** The `~/.claude/rules/spec-management.md` file takes effect on the next session start (brain rule loader picks it up automatically from `~/.claude/rules/`). No manual wiring needed.

2. **`brain-tools.md` regeneration.** The `tool-index.md` edit takes effect on the next `/wrapup` when the wrapup script regenerates `brain-tools.md`. Tell the user to run wrapup to see the spec-check entry appear.

3. **Drip's design folder has real collisions waiting.** The original use case from [d5968524] was detecting collisions between `forums-design`, `inbox-lifecycle-redesign`, and `spec-b-project-management`. All three are currently headerless. Follow-up work: retroactively add frontmatter to the three active drip specs so the tool can actually catch the collisions it was designed for. Out of scope for this plan.

4. **Phase 2 hook.** The PreToolUse hook on `Write` (spec §L473-L485) is deferred to a follow-up. Once we've observed whether Claude reliably fetches templates under rule discretion alone, we'll know whether the hook is needed.

5. **Pre-existing spec cleanup.** Three older specs in `thebrain-package/docs/superpowers/specs/` (2026-03-28, 2026-03-29, 2026-04-02) are headerless. They're not blockers — the tool just lists them. Backlog them for retroactive frontmatter if/when the information is needed.

6. **This is the last plan with a trailing `## Sonnet handoff prompts` section.** Future plans drop that section entirely. The chunks themselves are self-sufficient (Goal, Non-goals, Read first, Touched files, Tasks), and the standard handoff is one shell command:

       node thebrain-package/hippocampus/scripts/spec-check.js --chunk-content <plan-path> <chunk-number>

   This plan keeps its trailing handoffs as a one-time bootstrap cost — Chunks 1-5 ship before the tool exists, so there is no script to invoke for those chunks. Chunk 6 is the first chunk that COULD use the new mechanism (the tool exists by then), but its handoff is also kept literal here for consistency. Once this plan is shipped, the convention shifts permanently.

7. **Update `websites/CLAUDE.md`.** The current rule says plans should have "made copyable text blocks that are the instruction for the sonnet subagent" at the bottom. After this plan ships, that rule needs revision: "chunks must be self-sufficient with explicit Non-goals; Sonnet handoffs use `spec-check --chunk-content <plan> <n>` instead of in-plan copy blocks." This is a one-line edit, but should land in the same session as Chunk 6 to keep guidance consistent. Add to the user-facing summary.
