# Flow Graph Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a queryable graph of runtime data flow — AST-based extraction produces nodes and edges stored in SQLite, queried via CLI.

**Architecture:** Pluggable flow extractors (auto-discovered by directory) parse ASTs and delegate to pattern modules. A two-phase scanner inserts nodes first, resolves edges second. Cross-project URL resolution runs as a separate post-scan pass. Query CLI provides `--trace` and `--flow` commands targeting 100-300 tokens of output.

**Tech Stack:** Node.js, acorn (AST parsing), better-sqlite3, node:test

**Spec:** `docs/superpowers/specs/2026-04-02-flow-graph-design.md`

---

## Chunk 1: Foundation — Database and Registry

### Task 1: flow-db.js — Schema and Write Operations

**Files:**
- Create: `hippocampus/lib/flow-db.js`
- Test: `hippocampus/test/flow-db.test.js`

- [ ] **Step 1: Write failing tests for FlowDB**

Test file: `hippocampus/test/flow-db.test.js`

Tests to cover:
- Creates tables on initialization (nodes, edges, annotations, file_hashes)
- Inserts and retrieves nodes (with metadata_json round-trip)
- Inserts edges with denormalized source_project/source_file
- Deletes nodes and edges for a file (verifies other files unaffected)
- Deletes edges by source file using denormalized columns
- File hash upsert and retrieval
- Resolves node by {name, file, type} tuple (disambiguates same-name different-type)
- Unique index prevents duplicate nodes (same project/file/name/type/line)
- Unique index handles NULL lines via COALESCE (two table nodes with NULL line collide)
- CASCADE: deleting nodes cascades to edges

Use `node:test` (describe/it/before/after), temp DB path `.test-flow.db`, cleanup in after().

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/test/flow-db.test.js`
Expected: FAIL — `Cannot find module '../lib/flow-db'`

- [ ] **Step 3: Implement flow-db.js**

File: `hippocampus/lib/flow-db.js`

FlowDB class with:
- Constructor: opens better-sqlite3 DB (default path `~/.claude/brain/hippocampus/flow.db`), enables WAL + foreign_keys, runs schema DDL, prepares statements
- Schema: exact SQL from spec (nodes, edges with source_project/source_file, annotations with ephemeral note, file_hashes, all indexes including COALESCE unique index)
- Methods: `insertNode()`, `insertEdge()`, `getNode()`, `resolveNode(project, file, name, type)`, `deleteNodesForFile()`, `deleteEdgesForFile()`, `deleteFileHash()`, `cleanOrphanedAnnotations()`, `getFileHash()`, `upsertFileHash()`, `transaction(fn)`, `close()`
- All prepared statements cached in `_prepareStatements()`

See spec schema section for exact DDL. Key details:
- `insertNode` stores metadata as `JSON.stringify(metadata)` if provided
- `insertEdge` takes `(sourceId, targetId, type, sourceProject, sourceFile, dataJson, sequence)`
- `upsertFileHash` uses `ON CONFLICT DO UPDATE` with `updated_at = CURRENT_TIMESTAMP`
- `deleteFileHash(project, file)` removes a file's hash entry (used when file is deleted)
- `resolveNode` returns first matching ID from `SELECT id FROM nodes WHERE project=? AND file=? AND name=? AND type=? LIMIT 1`. Note: may match multiple rows if same name+type exists at different lines — returns first. Pass optional `line` parameter for exact disambiguation if needed.
- **Delete ordering:** `deleteEdgesForFile()` deletes outbound edges using denormalized `source_project`/`source_file` columns (fast, no join). `deleteNodesForFile()` deletes nodes, and `ON DELETE CASCADE` on edges' `source_id`/`target_id` FKs handles any remaining inbound edges from other files. Call `deleteEdgesForFile()` first (fast path), then `deleteNodesForFile()` (cascades the rest).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/test/flow-db.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```
feat: add flow-db.js — schema and write operations for flow graph
```

---

### Task 2: flow-extractor-registry.js — Auto-Discovery

**Files:**
- Create: `hippocampus/lib/flow-extractor-registry.js`
- Test: `hippocampus/test/flow-extractor-registry.test.js`

- [ ] **Step 1: Write failing tests**

Test file: `hippocampus/test/flow-extractor-registry.test.js`

Setup: Create temp directory `.test-flow-extractors` with:
- `mock-lang/index.js` — valid extractor (exports extensions + extract)
- `bad-lang/index.js` — invalid (missing extract method)
- `stray-file.js` — non-directory entry

Tests:
- Discovers valid extractor directories (`.mock` and `.mk` extensions mapped)
- Skips directories without valid index.js
- Skips non-directory entries
- Returns empty map for non-existent directory

Cleanup: rmSync temp dir, clear require.cache for test modules.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/test/flow-extractor-registry.test.js`
Expected: FAIL

- [ ] **Step 3: Implement flow-extractor-registry.js**

File: `hippocampus/lib/flow-extractor-registry.js`

`loadFlowExtractors(extractorsDir)` function:
- `readdirSync` with `withFileTypes: true`
- Skip non-directories
- Check for `index.js` in each directory
- Require it, validate `extensions` array + `extract` function
- Build `Map<extension, extractor>`
- Warn and skip on load failures or missing interface

Pattern matches existing `extractor-registry.js` style but adapted for directory-based discovery.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/test/flow-extractor-registry.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```
feat: add flow-extractor-registry — auto-discovery for flow extractors
```

---

### Task 3: Install acorn dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install acorn**

Run: `cd /home/sonderbread/websites/thebrain-package && npm install acorn`

- [ ] **Step 2: Verify installation**

Run: `node -e "const acorn = require('acorn'); console.log('acorn', acorn.version)"`
Expected: Prints acorn version

- [ ] **Step 3: Commit**

```
chore: add acorn dependency for AST-based flow extraction
```

---

## Chunk 2: JavaScript Extractor — Coordinator and Core Patterns

### Task 4: JavaScript extractor coordinator (index.js)

**Files:**
- Create: `hippocampus/flow-extractors/javascript/index.js`
- Create: `hippocampus/flow-extractors/javascript/patterns/` (directory)
- Test: `hippocampus/test/flow-extractor-js.test.js`

The coordinator parses the AST once with acorn, walks every node, and delegates to auto-discovered pattern modules in `patterns/`. Each pattern module uses a `create()` factory that returns `{ match(node, ancestors, ctx), extract(ctx) }` with isolated state per file.

- [ ] **Step 1: Write failing test for the coordinator**

Test file: `hippocampus/test/flow-extractor-js.test.js`

Tests:
- Exports extensions (.js, .mjs, .cjs) and extract function
- Returns empty `{ nodes: [], edges: [] }` for empty file
- Returns empty results on parse error instead of throwing
- Extracts function declarations via function-calls pattern (will fail until Task 5)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/test/flow-extractor-js.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Create directory structure**

Run: `mkdir -p /home/sonderbread/websites/thebrain-package/hippocampus/flow-extractors/javascript/patterns`

- [ ] **Step 4: Implement the coordinator**

File: `hippocampus/flow-extractors/javascript/index.js`

Key implementation details:
- `loadPatterns()`: reads `patterns/` directory, requires each `.js` file, validates `match`+`extract` interface (or `create` factory), warns and skips malformed
- `walkAST(node, ancestors, visitor)`: recursive walker tracking ancestor chain
- `posToLine(content, pos)`: converts acorn 0-indexed position to 1-indexed line number
- `extract(filePath, content, context)`:
  1. Return empty results for empty content
  2. Parse with `acorn.parse()` — ecmaVersion 'latest', sourceType 'module', allowReturnOutsideFunction, allowHashBang
  3. On parse error: log to stderr, return empty results (never throw)
  4. For each pattern with `create()`: call `create()` to get fresh state
  5. Walk AST — for each node, call `match()` on all patterns (try/catch per pattern)
  6. After walk: call `extract()` on all patterns, merge results

Pattern module interface (documented in the file):
```
// Option A (preferred): Factory pattern for per-file state
module.exports = { create() { return { match(node, ancestors, ctx), extract(ctx) }; } };

// Option B: Stateless module
module.exports = { match(node, ancestors, ctx), extract(ctx) };
```

The `ctx` object passed to match contains: `{ filePath, content, posToLine }`.
The `ctx` object passed to extract contains: `{ project, projectRoot, allProjects, filePath }`.

- [ ] **Step 5: Run tests — first 3 should pass, last fails (no patterns yet)**

Run: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/test/flow-extractor-js.test.js`
Expected: 3 PASS, 1 FAIL

- [ ] **Step 6: Commit coordinator**

```
feat: add JavaScript flow extractor coordinator — AST parse + pattern delegation
```

---

### Task 5: function-calls.js pattern module

**Files:**
- Create: `hippocampus/flow-extractors/javascript/patterns/function-calls.js`
- Test: `hippocampus/test/flow-patterns/function-calls.test.js`

Extracts: function declarations, function expressions, arrow functions, call sites, argument passing.

- [ ] **Step 1: Write failing tests**

Test file: `hippocampus/test/flow-patterns/function-calls.test.js`

Setup: Clear require.cache for flow-extractors/javascript, then require the extractor fresh.

Tests:
- Named function declarations → function node with line + params in metadata
- Assigned function expressions (`const handler = function(req, res) {}`) → function node
- Arrow functions (`const mw = (req, res, next) => {}`) → function node with params
- Call sites → `calls` edge from caller to callee
- Identifier arguments → `passes_arg` edges

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/test/flow-patterns/function-calls.test.js`
Expected: FAIL

- [ ] **Step 3: Implement function-calls.js**

File: `hippocampus/flow-extractors/javascript/patterns/function-calls.js`

Uses `create()` factory. Internal state: `functions[]`, `calls[]`, `currentFunction`, `functionStack[]`.

`match()` handles:
- `FunctionDeclaration` with `node.id` → push to functions, track as currentFunction
- `VariableDeclarator` where `init` is FunctionExpression or ArrowFunctionExpression → push to functions
- `CallExpression` → record caller (currentFunction or '<module>'), callee name, identifier args

`extract()` returns:
- `function` nodes with `{ params }` metadata
- `calls` edges: `source={callerName, file, type:'function'}` → `target={calleeName, file, type:'function'}`
- `passes_arg` edges for each identifier argument

Edge note: Call targets default to same-file. Cross-file resolution happens in the scanner's phase 2.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/test/flow-patterns/function-calls.test.js`
Expected: All PASS

- [ ] **Step 5: Run coordinator test — should now fully pass**

Run: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/test/flow-extractor-js.test.js`
Expected: All PASS

- [ ] **Step 6: Commit**

```
feat: add function-calls pattern — declarations, expressions, call sites, arg passing
```

---

### Task 6: module-exports.js pattern module

**Files:**
- Create: `hippocampus/flow-extractors/javascript/patterns/module-exports.js`
- Test: `hippocampus/test/flow-patterns/module-exports.test.js`

Extracts: `module.exports`, `exports.x`, `require()` calls. Produces `module` nodes and `calls` edges to required modules.

- [ ] **Step 1: Write failing tests**

Tests:
- `module.exports = { createApp, validateSlug }` → module node with exports list
- `require('./company')` → calls edge with resolved relative path
- `exports.createApp = function() {}` → module node with export name
- `module.exports = createApp` (single export) → module node

- [ ] **Step 2: Implement module-exports.js**

`match()` handles:
- `AssignmentExpression` where left is `module.exports` → extract from ObjectExpression properties or Identifier
- `AssignmentExpression` where left is `exports.name` → collect export name
- `CallExpression` where callee is `require` with string literal → collect local requires (starting with `.` or `/`)

`extract()` returns:
- `module` node named after filePath with `{ exports: [...] }` metadata
- `calls` edges from module to required modules, with path resolution:
  - Strip `./` prefix
  - Resolve `../` relative to current file's directory
  - Add `.js` extension if none present
  - Target type is `module`

- [ ] **Step 3: Run tests, verify pass**
- [ ] **Step 4: Commit**

```
feat: add module-exports pattern — exports, require() resolution
```

---

### Task 7: express-routes.js pattern module

**Files:**
- Create: `hippocampus/flow-extractors/javascript/patterns/express-routes.js`
- Test: `hippocampus/test/flow-patterns/express-routes.test.js`

Extracts: `app.get()`, `app.post()`, `router.delete()`, etc. Produces `route` nodes and `mounts_route` edges.

- [ ] **Step 1: Write failing tests**

Tests:
- `app.get('/api/items', handler)` → route node with method GET, path /api/items
- `app.post('/api/items', createHandler)` → route node with method POST
- `router.delete('/api/items/:id', deleteHandler)` → route node with method DELETE
- Each route produces a `mounts_route` edge

- [ ] **Step 2: Implement express-routes.js**

HTTP_METHODS set: get, post, put, patch, delete, all, options, head.

`match()`: CallExpression where callee is MemberExpression with property in HTTP_METHODS, first arg is string literal.

Route node name format: `"METHOD /path"` (e.g., `"GET /api/items"`).
Metadata: `{ method, path, app }`.
Edge: `mounts_route` from app variable to route node.

- [ ] **Step 3: Run tests, verify pass**
- [ ] **Step 4: Commit**

```
feat: add express-routes pattern — route registration with method/path
```

---

### Task 8: express-middleware.js pattern module

**Files:**
- Create: `hippocampus/flow-extractors/javascript/patterns/express-middleware.js`
- Test: `hippocampus/test/flow-patterns/express-middleware.test.js`

Extracts: `app.use()` calls with sequence tracking, sub-app mounting with path prefix.

- [ ] **Step 1: Write failing tests**

Tests:
- Three `app.use()` calls → middleware nodes with increasing sequence numbers
- `outerApp.use('/runtime', app)` → `mounts` edge with prefix '/runtime'
- `app.use('/api', apiRouter)` → `mounts` edge
- `app.use(cors())` → middleware node with null prefix

- [ ] **Step 2: Implement express-middleware.js**

Sequence counter: per-file, increments on each `app.use()` call.

`match()`: CallExpression where callee is `*.use()`. Parse args:
- First arg is string → path prefix, remaining args are handlers
- First arg is not string → no prefix, all args are handlers
- Handler is Identifier → possible sub-app mount (if has prefix)
- Handler is CallExpression → middleware factory invocation

`extract()`:
- `middleware` nodes with `{ app, prefix, sequence }` metadata
- `mounts` edges for sub-app mounting with `{ prefix }` data

- [ ] **Step 3: Run tests, verify pass**
- [ ] **Step 4: Commit**

```
feat: add express-middleware pattern — app.use() chains with sequence, sub-app mounts
```

---

## Chunk 3: Remaining Pattern Modules

### Task 9: sql-operations.js pattern module

**Files:**
- Create: `hippocampus/flow-extractors/javascript/patterns/sql-operations.js`
- Test: `hippocampus/test/flow-patterns/sql-operations.test.js`

Extracts: SQL strings in `.prepare()`, `.run()`, `.all()`, `.get()`, `.exec()`. Classifies as query vs mutation.

- [ ] **Step 1: Write failing tests**

Tests:
- `db.prepare('SELECT id, slug FROM companies WHERE slug = ?').get(slug)` → `companies` table node + `queries_table` edge with columns [id, slug]
- `INSERT INTO bookings` → `mutates_table` edge
- `UPDATE users SET` → `mutates_table` edge
- `DELETE FROM sessions` → `mutates_table` edge
- `CREATE TABLE IF NOT EXISTS items` → table node + `mutates_table` edge
- Template literal with interpolation → does not crash, returns array
- `SELECT c.id, c.slug FROM companies c JOIN tools t ON c.id = t.company_id` → extracts `companies` table (known limitation: JOINed table `tools` may not be captured by v1 regex — document as known gap)

- [ ] **Step 2: Implement sql-operations.js**

SQL regex patterns (all with `/gi` flags):
- `SELECT_RE`: `SELECT (.+?) FROM (\w+)` — extracts column list + table
- `INSERT_RE`: `INSERT INTO (\w+)`
- `UPDATE_RE`: `UPDATE (\w+) SET`
- `DELETE_RE`: `DELETE FROM (\w+)`
- `CREATE_RE`: `CREATE TABLE (IF NOT EXISTS )?(\w+)`

`match()`: Look for CallExpression where:
- Callee is `*.prepare/run/all/get/exec` with string literal first arg
- Or chained: `*.prepare('SQL').get/all/run(...)` (inner call has the SQL)

Parse the SQL string against all regex patterns. Record table name, edge type, columns.

Table nodes have `line: null` (file-level, not line-specific).
Source for edges: the file's module node.

- [ ] **Step 3: Run tests, verify pass**
- [ ] **Step 4: Commit**

```
feat: add sql-operations pattern — table references from prepare/run/all/get/exec
```

---

### Task 10: req-property-flow.js pattern module

**Files:**
- Create: `hippocampus/flow-extractors/javascript/patterns/req-property-flow.js`
- Test: `hippocampus/test/flow-patterns/req-property-flow.test.js`

Extracts: `req.x = ...` assignments → `property` nodes + `attaches` edges. `req.x.y` reads → `reads` edges. Object literal shapes in metadata.

- [ ] **Step 1: Write failing tests**

Tests:
- `req.company = { id: company.id, slug: company.slug }` → property node named `req.company`
- Object shape recorded in metadata (includes id, slug, name)
- `req.db = entry.db` → `attaches` edge targeting `req.db`
- `const slug = req.company.slug; const db = req.company.db;` → 2+ `reads` edges
- `res.locals.user = authenticatedUser` → property node `res.locals.user`

- [ ] **Step 2: Implement req-property-flow.js**

Helper functions:
- `buildMemberPath(node)`: walk MemberExpression chain → dotted string (e.g., `req.company.slug`)
- `isTrackedPath(path)`: root is `req` or `res`
- `isAssignmentTarget(node, ancestors)`: check if node is LHS of AssignmentExpression

`match()`:
- AssignmentExpression with tracked MemberExpression on left → record assignment with shape
- MemberExpression that is NOT an assignment target → record read (if 2+ dots deep)

`extract()`:
- Deduplicate property nodes by name
- `attaches` edges from module to property
- `reads` edges: normalize to base property (req.company.slug → req.company)

- [ ] **Step 3: Run tests, verify pass**
- [ ] **Step 4: Commit**

```
feat: add req-property-flow pattern — req/res injection, reads, shape propagation
```

---

### Task 11: cookie-operations.js pattern module

**Files:**
- Create: `hippocampus/flow-extractors/javascript/patterns/cookie-operations.js`
- Test: `hippocampus/test/flow-patterns/cookie-operations.test.js`

- [ ] **Step 1: Write failing tests**

Tests:
- `res.cookie('session_token', token, { httpOnly: true })` → `sets_cookie` edge with cookieName
- `res.clearCookie('session_token', opts)` → `sets_cookie` edge with operation 'clear'
- `req.cookies.runtime_session` → `reads_cookie` edge with cookieName

- [ ] **Step 2: Implement cookie-operations.js**

`match()`:
- `res.cookie(name, ...)` and `res.clearCookie(name, ...)` → sets_cookie
- `req.cookies.name` (MemberExpression chain) → reads_cookie

Creates `property` nodes for each cookie name (e.g., `cookie:session_token` with type `property`) so edges have valid targets. These are self-contained — the pattern does not depend on `req-property-flow.js` having created them first. Edge source is the file module node.

- [ ] **Step 3: Run tests, verify pass**
- [ ] **Step 4: Commit**

```
feat: add cookie-operations pattern — set/clear/read cookie detection
```

---

### Task 12: config-reads.js pattern module

**Files:**
- Create: `hippocampus/flow-extractors/javascript/patterns/config-reads.js`
- Test: `hippocampus/test/flow-patterns/config-reads.test.js`

- [ ] **Step 1: Write failing tests**

Tests:
- `process.env.PORT` → config node named `process.env.PORT`
- `runtimeConfig.basePath` → reads edge

- [ ] **Step 2: Implement config-reads.js**

CONFIG_OBJECTS set: `process.env`, `runtimeConfig`, `config`.

`match()`:
- `process.env.X` (nested MemberExpression) → config node
- `config.prop` or `runtimeConfig.prop` → config node

`extract()`: Deduplicated config nodes + reads edges.

- [ ] **Step 3: Run tests, verify pass**
- [ ] **Step 4: Commit**

```
feat: add config-reads pattern — process.env and config object access
```

---

### Task 13: cross-project-urls.js pattern module

**Files:**
- Create: `hippocampus/flow-extractors/javascript/patterns/cross-project-urls.js`
- Test: `hippocampus/test/flow-patterns/cross-project-urls.test.js`

- [ ] **Step 1: Write failing tests**

Tests:
- `'/runtime/advenire-consulting/api/public/booking'` → `url_reference` node with URL in metadata
- `fetch('/api/runtime/tools')` → `url_reference` node
- Non-API URLs (https://example.com, /assets/css/base.css) → no url_reference nodes

- [ ] **Step 2: Implement cross-project-urls.js**

`API_PATH_RE = /\/api\//` — simple heuristic for API paths.

`match()`:
- String literals matching API_PATH_RE (skip require() paths)
- Template literal quasis matching API_PATH_RE (mark as partial)

`extract()`: `url_reference` nodes named `url_ref:<url truncated to 60 chars>` with `{ url, partial }` metadata. No edges — resolution is flow-resolve.js's job.

- [ ] **Step 3: Run tests, verify pass**
- [ ] **Step 4: Commit**

```
feat: add cross-project-urls pattern — unresolved API URL references
```

---

### Task 14: Run all pattern tests together

- [ ] **Step 1: Run all flow tests**

Run: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/test/flow-patterns/*.test.js hippocampus/test/flow-extractor-*.test.js hippocampus/test/flow-db.test.js`
Expected: All tests PASS

- [ ] **Step 2: Run the full test suite — no regressions**

Run: `cd /home/sonderbread/websites/thebrain-package && npm test`
Expected: All existing tests still PASS

---

## Chunk 4: Scanner

### Task 15: flow-scan.js — Incremental Scanner

**Files:**
- Create: `hippocampus/scripts/flow-scan.js`
- Test: `hippocampus/test/flow-scan.test.js`

Two-phase scanner: extract all nodes first, then resolve and insert edges.

- [ ] **Step 1: Write failing tests**

Test file: `hippocampus/test/flow-scan.test.js`

Setup: Create temp project directory `.test-flow-scan-project/` with:
- `server.js` — requires lib/middleware, registers routes, has SQL query
- `lib/middleware.js` — exports createMiddleware, assigns req.db

Tests:
- Scans project and produces function/route/table nodes
- Produces edges between nodes (calls, queries_table, etc.)
- Incremental: second scan of unchanged files skips all (scanned=0, skipped>0)
- Re-scans changed files (append to file, verify scanned=1)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/test/flow-scan.test.js`
Expected: FAIL

- [ ] **Step 3: Implement flow-scan.js**

File: `hippocampus/scripts/flow-scan.js`

Exported functions: `scanProject(db, projectDir, projectName)`, `scanSingleFile(db, projectDir, projectName, filePath)`, `hashContent(content)`

**`scanProject`:**
1. Load flow extractors via registry
2. Collect code files via `file-collector.js`
3. Phase 0: Check hashes, determine which files need scanning
4. Phase 1 — Nodes: For each changed file, delete old edges (by denormalized columns) + old nodes, extract and insert new nodes (transaction per file)
5. Phase 2 — Edges: For each file's edges, resolve `{name, file, type}` tuples to node IDs via `db.resolveNode()`, insert edges (transaction per file). Silently skip unresolved edges.

Note: Phase 2 must run after ALL Phase 1 files complete — all nodes must exist before cross-file edge resolution.
6. Update file hashes
7. Return `{ scanned, skipped }`

**`scanSingleFile`** (for post-edit hook):
- Same logic but single file. Delete old data, extract, insert nodes, resolve+insert edges, update hash.
- Handle file deletion: if file doesn't exist, delete its nodes/edges and its `file_hashes` entry (prevents stale hash comparison if a file with the same path is recreated later).

**CLI entry point:**
- `--file <project> <filePath>` → single file mode
- `--all` or no args → full scan all projects
- `<project>` → scan specific project

Project roster (explicit — matches `term-scan-cli.js` plus runtime and brain):

| Directory | Name |
|-----------|------|
| `advenire.consulting` | `advenire-portal` |
| `michaelortegon.com` | `michaelortegon` |
| `sonderos.org` | `sonderos` |
| `sondercontrols` | `sondercontrols` |
| `signal-assistant` | `signal-assistant` |
| `_shared` | `shared-library` |
| `SonderPlugins/thebrain` | `thebrain` |
| `SonderPlugins/sloppy` | `sloppy` |
| `conversation-explorer` | `conversation-explorer` |
| `sonder-runtime` | `sonder-runtime` |
| `thebrain-package` | `thebrain-package` |

Last two are additions vs `term-scan-cli.js` — `sonder-runtime` is the primary tool hosting platform, `thebrain-package` is this project itself.

Hash: SHA-1 via `crypto.createHash('sha1')` — matches term-scanner convention.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/sonderbread/websites/thebrain-package && node --test hippocampus/test/flow-scan.test.js`
Expected: All PASS

- [ ] **Step 5: Smoke test on sonder-runtime**

Run: `cd /home/sonderbread/websites/thebrain-package && node hippocampus/scripts/flow-scan.js sonder-runtime`
Expected: Prints scan results

- [ ] **Step 6: Commit**

```
feat: add flow-scan.js — two-phase incremental scanner with hash-based change detection
```

---

## Chunk 5: Query Layer

### Task 16: flow-queries.js — Read Operations

**Files:**
- Create: `hippocampus/lib/flow-queries.js`
- Test: `hippocampus/test/flow-queries.test.js`

- [ ] **Step 1: Write failing tests**

Test file: `hippocampus/test/flow-queries.test.js`

Setup: Create FlowDB with test data simulating a real project:
- Nodes: module, function (createCompanyMiddleware), property (req.company with shape), table (companies), function (main in server.js), route (GET /api/theme), middleware (companyMiddleware)
- Edges: main→createCompanyMiddleware (calls), fn→req.company (attaches), route→req.company (reads), fn→companies (queries_table)

Tests:
- `trace('req.company', 'proj')` → has setBy, has readBy entries
- `trace('createCompanyMiddleware', 'proj')` → has calledBy or attaches entries
- `fileFlow('lib/company.js', 'proj')` → has exports and/or nodes
- `trace('nonExistentThing', 'proj')` → returns null

- [ ] **Step 2: Implement flow-queries.js**

FlowQueries class with constructor taking raw `db` handle (not FlowDB wrapper).

Prepared statements:
- `_findByName(name, project)`, `_findByNameAny(name)`
- `_nodesInFile(project, file)` — ordered by line
- `_outEdges(nodeId)` — joins target node for name/type/file
- `_inEdges(nodeId)` — joins source node
- `_fileOutEdges(project, file)` — all edges originating from file
- `_fileInEdges(project, file)` — all edges targeting nodes in file
- `_nodeAnnotations(nodeId)`

**`trace(identifier, project)`:**
- Find nodes by name (+project if given)
- Return null if none found
- For each node: collect inEdges (calledBy, setBy) and outEdges (readBy, attaches, queries)
- For property nodes: also collect reads from inEdges
- Return structured result: `{ identifier, nodes, setBy, calledBy, readBy, attaches, queries }`

**`fileFlow(filePath, project)`:**
- Find all nodes in file
- Find module node for exports
- Collect outbound edges (including imports from require calls edges)
- Collect inbound edges from other files
- Return: `{ file, project, nodes, exports, imports, outbound, inbound }`

- [ ] **Step 3: Run tests, verify pass**
- [ ] **Step 4: Commit**

```
feat: add flow-queries.js — trace, fileFlow, annotation retrieval
```

---

### Task 17: flow.js — Query CLI

**Files:**
- Create: `hippocampus/scripts/flow.js`

- [ ] **Step 1: Implement flow.js**

CLI commands:
- `--trace <identifier> [--project P]` → call `queries.trace()`, format with `formatTrace()`
- `--flow <file> --project P` → call `queries.fileFlow()`, format with `formatFileFlow()`
- `--notes <file:name> [--project P]` → query annotations
- `--annotate <file:name> "note" [--project P]` → insert annotation (prompt on ambiguity)

**`formatTrace(result)`** (~100-300 tokens):
- Header: `identifier — type (file:line)`
- Shape/params/exports from metadata
- "Set by:" section
- "Called by:" section with file:line
- "Read by:" section with fullPath detail
- "Attaches:" section
- "Tables:" section

**`formatFileFlow(result)`** (~200-300 tokens):
- File name header
- Imports/Exports lines
- Nodes grouped by type (skip module type)
- "Consumed by:" section grouped by source file

**`showNotes`:** Query nodes by file:name, show annotations.
**`addAnnotation`:** Find node by file:name, insert annotation. List matches on ambiguity.

- [ ] **Step 2: Smoke test after scanning a project**

Run: `cd /home/sonderbread/websites/thebrain-package && node hippocampus/scripts/flow.js --trace req.company --project sonder-runtime`
Run: `cd /home/sonderbread/websites/thebrain-package && node hippocampus/scripts/flow.js --flow lib/company.js --project sonder-runtime`

- [ ] **Step 3: Commit**

```
feat: add flow.js query CLI — trace, flow, notes, annotate commands
```

---

## Chunk 6: Cross-Project Resolver and Integration

### Task 18: flow-resolve.js — Cross-Project URL Resolver

**Files:**
- Create: `hippocampus/scripts/flow-resolve.js`

- [ ] **Step 1: Implement flow-resolve.js**

`resolveUrlReferences(db)`:
1. Find all `url_reference` nodes
2. Find all `route` nodes across all projects
3. Build map of route paths → route nodes
4. Delete existing `cross_project` edges (will re-create)
5. For each URL ref: check if URL contains/ends with any known route path
6. Create `cross_project` edge only when source and target are in different projects
7. Return `{ resolved, unresolved }`

CLI: Open FlowDB, call resolve, print results, close.

- [ ] **Step 2: Commit**

```
feat: add flow-resolve.js — cross-project URL-to-route edge resolution
```

---

### Task 19: Integration — Wrapup

**Files:**
- Modify: `scripts/wrapup-mechanical.js:30` (after term scan step)

- [ ] **Step 1: Add flow scan steps to wrapup**

Add after `runStep('Updating term index...', ...)` (around line 30):

```js
// 0b-flow. Flow graph scan + cross-project resolution
runStep('Updating flow graph...', path.join(THEBRAIN_DIR, 'hippocampus', 'scripts', 'flow-scan.js'));
runStep('Resolving cross-project references...', path.join(THEBRAIN_DIR, 'hippocampus', 'scripts', 'flow-resolve.js'));
```

The existing `runStep` function handles errors gracefully. Note: `runStep` currently has no timeout parameter — per spec, the flow scan should have a 30-second timeout. Either add a `timeout` parameter to `runStep` or use a separate `execFileSync` call with `{ timeout: 30000 }` for the flow scan steps specifically.

Also ensure `flow-scan.js` CLI defaults to `--all` when no args given (update the CLI arg parsing: `const targetProject = (!args[0] || args[0] === '--all') ? null : args[0];`).

- [ ] **Step 2: Verify wrapup runs**

Run: `cd /home/sonderbread/websites/thebrain-package && node scripts/wrapup-mechanical.js`
Expected: Shows "Updating flow graph..." and "Resolving cross-project references..." steps

- [ ] **Step 3: Commit**

```
feat: integrate flow graph scan into wrapup pipeline
```

---

### Task 20: Integration — Post-Edit Hook

**Files:**
- Modify: `hooks/post-edit-hook.js:142` (after term index update, before DIR update)

- [ ] **Step 1: Add flow scan to post-edit hook**

After `updateSingleFile(db, filePath, matchedProject, projectDir);` (line ~142), add:

```js
// Update flow graph for edited file
try {
  const flowScanPath = path.join(__dirname, '../hippocampus/scripts/flow-scan.js');
  if (fs.existsSync(flowScanPath)) {
    const relativeToProject = path.relative(projectDir, filePath);
    const { execFileSync } = require('child_process');
    execFileSync('node', [flowScanPath, '--file', matchedProject, relativeToProject], {
      timeout: 10000,
      stdio: 'pipe',
    });
  }
} catch (err) {
  process.stderr.write(`[post-edit] Flow scan failed: ${err.message}\n`);
}
```

Uses `execFileSync` (not `exec`) to avoid shell injection per spec. 10 second timeout per spec.

- [ ] **Step 2: Commit**

```
feat: integrate flow graph into post-edit hook
```

---

### Task 21: Documentation — brain-tools.md

**Files:**
- Modify: `~/.claude/rules/brain-tools.md`

- [ ] **Step 1: Add flow graph section**

Add after the "Hippocampus — Content Search" section:

````markdown
## Hippocampus — Flow Graph (~100-300 tokens)

AST-based code intelligence — traces data flow, middleware chains, database access, and cross-project dependencies.

```
node /home/sonderbread/websites/thebrain-package/hippocampus/scripts/flow.js <command>
```

| Command | What it does |
|---------|-------------|
| `--trace <identifier> [--project P]` | Follow a value — where set, who reads it, what it calls |
| `--flow <file> --project P` | Everything flowing in/out of a file |
| `--notes <file:name> [--project P]` | Show annotations for a node |
| `--annotate <file:name> "note" [--project P]` | Add a note to a node |
````

Add to "What Answers What" table:
- "How does data flow through this file?" → `flow.js --flow <file>`
- "Where is this value set and who reads it?" → `flow.js --trace <identifier>`
- "What middleware runs before my route?" → `flow.js --trace req.<property>`
- "What tables does this file access?" → `flow.js --flow <file>`
- "What would break if I changed this?" → `flow.js --trace <function>`

- [ ] **Step 2: Commit**

```
docs: add flow graph commands to brain-tools.md
```

---

### Task 22: Final Verification

- [ ] **Step 1: Run the full test suite**

Run: `cd /home/sonderbread/websites/thebrain-package && npm test`
Expected: All tests PASS

- [ ] **Step 2: Full scan on sonder-runtime**

Run: `cd /home/sonderbread/websites/thebrain-package && node hippocampus/scripts/flow-scan.js sonder-runtime`

- [ ] **Step 3: Test trace**

Run: `cd /home/sonderbread/websites/thebrain-package && node hippocampus/scripts/flow.js --trace req.company --project sonder-runtime`

- [ ] **Step 4: Test file flow**

Run: `cd /home/sonderbread/websites/thebrain-package && node hippocampus/scripts/flow.js --flow server.js --project sonder-runtime`

- [ ] **Step 5: Verify output is compact (~100-300 tokens)**

Check that trace and flow output is useful and within token budget.
