# Flow Graph — Design Spec

**Date:** 2026-04-02
**Status:** Reviewed
**Scope:** thebrain-package/hippocampus

**Problem:** The hippocampus DIR files map what files exist and what they export/import. But they don't capture how data flows at runtime — middleware chains, request property injection, config propagation, database access patterns, cross-project dependencies. Every new tool or migration requires expensive exploration (dozens of file reads and grep calls) to reconstruct these flows from scratch.

**Solution:** A second-level code intelligence system that builds a queryable graph of runtime data flow. AST-based extraction produces nodes (functions, middleware, routes, properties) and edges (calls, data flow, mounting, property access). Stored in SQLite for efficient incremental updates. Queried via CLI for tracing values through the codebase.

**Design principles:**
- **Plug-and-play modularity** — the container (DB, scanner, query engine) is permanent; extraction patterns are plugins you slot in
- **Sits alongside, not inside** — no changes to DIR files, term index, or existing extractors
- **Incremental by default** — post-edit hook updates per-file, wrapup catches stragglers
- **Query output is compact** — the DB holds the full graph, queries return only the relevant subgraph

---

## Data Model

### Node/Edge Type System

Types are **strings, not enums**. New extraction patterns register new types without schema changes. The query engine traverses edges regardless of type — it's the display layer that can be type-aware.

**Built-in node types (v1):**

| Type | What it represents | Example |
|------|-------------------|---------|
| `function` | A declared function | `createCompanyMiddleware` in company.js |
| `middleware` | Express middleware (app.use) | Rate limiter in server.js |
| `route` | A route handler (app.get, router.post) | `GET /api/runtime/theme` |
| `property` | A property on a shared object | `req.company`, `req.db`, `req.user` |
| `config` | A configuration value | `runtimeConfig.basePath`, `process.env.NODE_ENV` |
| `table` | A database table | `companies`, `booking_appointments` |
| `module` | A file's module boundary | The exports of company.js |

**Built-in edge types (v1):**

| Type | Meaning | Example |
|------|---------|---------|
| `calls` | Function A invokes Function B | `server.js` calls `createCompanyMiddleware()` |
| `passes_arg` | Data flows as a function argument | `db` passed to `createCompanyMiddleware(db, tools, config)` |
| `returns` | Function returns a value | `createCompanyMiddleware` returns middleware function |
| `attaches` | Middleware sets a property on req/res | company middleware sets `req.company` |
| `reads` | Code reads a property from req/res/config | Route handler reads `req.company.slug` |
| `mounts` | Express app/router mounting | `app.use('/runtime', innerApp)` |
| `mounts_route` | Route registration with method + path | `app.get('/api/runtime/theme', handler)` |
| `queries_table` | SQL query references a table | `SELECT * FROM companies WHERE slug = ?` |
| `mutates_table` | SQL write references a table | `INSERT INTO booking_appointments ...` |
| `sets_cookie` | Cookie write operation | `res.cookie('runtime_session', token, opts)` |
| `reads_cookie` | Cookie read operation | `req.cookies.runtime_session` |
| `cross_project` | Value flows across project boundary | booking2.js on advenire.consulting hits runtime API |

New types are just new strings. No migration needed.

### Schema

```sql
-- flow.db — lives at ~/.claude/brain/hippocampus/flow.db

-- A meaningful unit in the codebase
CREATE TABLE nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project TEXT NOT NULL,
    file TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    line INTEGER,
    -- Extensible metadata: parameter names, object shape, SQL columns, etc.
    metadata_json TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
);

-- A relationship between two nodes
CREATE TABLE edges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    target_id INTEGER NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    -- Denormalized for fast delete-by-file without joining nodes table
    source_project TEXT NOT NULL,
    source_file TEXT NOT NULL,
    -- Extensible data: argument names, property path, SQL column list, etc.
    data_json TEXT,
    -- Ordering matters for middleware chains
    sequence INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
);

-- Optional human/AI-authored context for non-obvious relationships.
-- EPHEMERAL: annotations are deleted when their target node/edge is deleted during re-scan.
-- This is intentional for v1 — annotations are lightweight notes, not durable knowledge.
-- If annotations prove valuable enough to survive re-scans, add re-attachment logic later.
CREATE TABLE annotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- Can annotate a node or an edge
    target_type TEXT NOT NULL CHECK(target_type IN ('node', 'edge')),
    target_id INTEGER NOT NULL,
    content TEXT NOT NULL,
    author TEXT DEFAULT 'human',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME
);

-- File hash tracking for incremental updates
CREATE TABLE file_hashes (
    project TEXT NOT NULL,
    file TEXT NOT NULL,
    hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME,
    PRIMARY KEY (project, file)
);

-- Indexes for common query patterns
-- Safety net: prevent duplicate nodes. COALESCE handles NULL lines (table, config nodes).
-- Primary dedup is delete-all-for-file then insert (transaction per file in scanner).
CREATE UNIQUE INDEX idx_nodes_unique ON nodes(project, file, name, type, COALESCE(line, -1));
CREATE INDEX idx_nodes_project_file ON nodes(project, file);
CREATE INDEX idx_nodes_project_type ON nodes(project, type);
CREATE INDEX idx_nodes_name ON nodes(name);
CREATE INDEX idx_edges_source ON edges(source_id);
CREATE INDEX idx_edges_target ON edges(target_id);
CREATE INDEX idx_edges_type ON edges(type);
CREATE INDEX idx_edges_source_file ON edges(source_project, source_file);
CREATE INDEX idx_annotations_target ON annotations(target_type, target_id);
```

### Shape Propagation

When the extractor sees an object being constructed or properties being assigned, it records the shape as metadata on the node:

```json
{
  "type": "property",
  "name": "req.company",
  "metadata_json": {
    "shape": {
      "id": "company.id",
      "slug": "company.slug",
      "name": "company.name",
      "db": "entry.db",
      "theme": "safeJsonParse(company.theme_json)",
      "assignedTools": "Set"
    }
  }
}
```

Downstream queries can answer "what properties are available on `req.company`?" without reading the source file.

### Cross-Project Edges

When a file in one project references a URL, API endpoint, or import that resolves to another project, the extractor creates a `cross_project` edge. The source and target nodes have different `project` values.

Example: `booking2.js` in `advenire-consulting` constructs a URL to `/runtime/advenire-consulting/api/public/booking/types`. The flow graph records an edge from the `fetch()` call node in booking2.js to the route handler node in sonder-runtime's public-routes.js.

Cross-project resolution uses the hippocampus project roster (which directories exist) combined with route matching (the target project's known routes from its flow graph).

---

## Flow Extractor Interface

### Contract

A flow extractor is a **directory** in `hippocampus/flow-extractors/` with an `index.js` that exports:

```js
module.exports = {
    // File extensions this extractor handles
    extensions: ['.js', '.mjs', '.cjs'],

    // Extract flow data from a file
    // Returns { nodes: [...], edges: [...] }
    extract(filePath, content, context) { ... }
};
```

**Parameters:**

- `filePath` — relative path within the project (e.g., `lib/company.js`)
- `content` — file content as string
- `context` — `{ project, projectRoot, allProjects }` for cross-project resolution

**Return value:**

```js
{
    nodes: [
        { name, type, line, metadata_json }
    ],
    edges: [
        // References use name+file+type tuples, not IDs — the scanner resolves them
        { source: { name, file, type }, target: { name, file, type, project? }, type, data_json, sequence? }
    ]
}
```

Edges reference nodes by `{ name, file, type }` tuples. The `type` field disambiguates when a file has multiple nodes with the same name (e.g., a `function` node and a `module` node both named `createCompanyMiddleware`). The scanner resolves these to database IDs after insertion. Cross-project edges include `project` on the target.

### Internal Structure — Pattern Modules

Each language extractor parses the AST **once** and fans out to pattern modules. The pattern modules don't parse — they match AST nodes and return extracted flow data. Adding a new detection capability is dropping a file into `patterns/`, not editing a monolith.

```
flow-extractors/
  javascript/
    index.js                  <- acorn parse, single AST walk, delegates to patterns
    patterns/
      express-routes.js       <- route registration, method + path
      express-middleware.js   <- app.use() chains, sequence tracking
      sql-operations.js       <- .prepare/.run/.all/.get with SQL parsing
      req-property-flow.js    <- req.X assignment and reads, shape propagation
      module-exports.js       <- require(), module.exports, import/export
      cookie-operations.js    <- res.cookie(), req.cookies reads
      config-reads.js         <- process.env, config object property access
      function-calls.js       <- declarations, expressions, call sites, argument passing
```

Each pattern module exports:

```js
module.exports = {
    // Called for each AST node during the single walk
    match(node, ancestors) { ... },

    // Called after the walk completes — return { nodes, edges }
    extract(context) { ... }
};
```

`index.js` auto-discovers pattern modules and walks the AST once:

```js
// javascript/index.js — pattern loading
function loadPatterns() {
    const dir = path.join(__dirname, 'patterns');
    const patterns = [];
    for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.js')) continue;
        const mod = require(path.join(dir, file));
        if (typeof mod.match !== 'function' || typeof mod.extract !== 'function') {
            console.warn(`[flow] skipping malformed pattern module: ${file}`);
            continue;
        }
        patterns.push(mod);
    }
    return patterns;
}
```

For each AST node, it calls `match()` on every pattern module — each module accumulates what it finds internally. After the walk, `index.js` calls `extract()` on each module and merges the results.

This means:
- **One parse, one walk, N pattern modules** — no performance cost for more granularity
- **Adding "detect EventEmitter flows"** = drop `event-emitter.js` into `patterns/`
- **Each pattern module is testable in isolation** — feed it an AST node, check what it extracts
- **Pattern modules can be shared** — if Python/Flask routes look similar to Express routes, factor out the common logic

When a new language extractor arrives (e.g., `python/`), it gets its own parser and its own `patterns/` directory:

```
flow-extractors/
  python/
    index.js                  <- tree-sitter parse, delegates to patterns
    patterns/
      flask-routes.js
      sqlalchemy.js
      ...
```

Same contract out, different parser in, own pattern set.

### Auto-Discovery

`flow-extractors/` follows the same pattern as `extractors/`:

```js
// hippocampus/lib/flow-extractor-registry.js
const fs = require('fs');
const path = require('path');

function loadFlowExtractors() {
    const dir = path.join(__dirname, '../flow-extractors');
    const map = new Map(); // extension -> extractor
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const modPath = path.join(dir, entry.name, 'index.js');
        if (!fs.existsSync(modPath)) continue;
        const mod = require(modPath);
        if (!mod.extensions || typeof mod.extract !== 'function') continue;
        for (const ext of mod.extensions) {
            map.set(ext, mod);
        }
    }
    return map;
}
```

Drop in a `python/` directory with `index.js` exporting the same interface, it works.

---

## JavaScript Flow Extractor

Uses `acorn` for AST parsing. If parsing fails (syntax errors, unsupported syntax), log a warning and return empty `{ nodes: [], edges: [] }` — never block the scan for one file.

Extracts the following patterns:

### Function declarations and expressions

```js
function createApp(opts) { ... }           // named declaration
const handler = function(req, res) { ... } // assigned expression
const mw = (req, res, next) => { ... }     // arrow function
```

Produces `function` nodes with parameter names in metadata.

### Function calls with arguments

```js
const mw = createCompanyMiddleware(db, tools, config);
app.use(mw);
```

Produces `calls` edges. When arguments are identifiers (not literals), produces `passes_arg` edges linking the argument's declaration to the function parameter.

### Express middleware and route registration

```js
app.use(securityHeaders({ ... }));
app.use(createRateLimiter({ ... }));
app.use(cookieParser());
app.get('/api/runtime/theme', handler);
companyApp.use(slugPrefix, requireAuth);
```

Produces `middleware` nodes with sequence numbers preserving registration order. Route registrations produce `mounts_route` edges with method and path.

### Sub-app mounting

```js
outerApp.use('/runtime', app);
app.use(companyMiddleware);
app.use(companyApp);
```

Produces `mounts` edges capturing the prefix and nesting hierarchy.

### Request/response property injection

```js
req.company = { id, slug, name, db, theme, assignedTools };
req.db = entry.db;
req.user = user;
req.toolConfig = resolveToolConfig(tool, runtimeConfig);
```

Produces `property` nodes and `attaches` edges. Object literal shapes are recorded in metadata.

### Property reads

```js
const token = req.cookies.runtime_session;
if (!req.company.assignedTools.has(tool.slug)) { ... }
const slug = req.company.slug;
```

Produces `reads` edges from the reading function to the property node.

### SQL table references

Detects SQL strings in `.prepare()`, `.run()`, `.all()`, `.get()` calls. Parses table names from `SELECT FROM`, `INSERT INTO`, `UPDATE`, `DELETE FROM`, `CREATE TABLE` patterns.

```js
db.prepare('SELECT id, slug FROM companies WHERE slug = ?').get(slug);
```

Produces a `table` node for `companies` and a `queries_table` edge with columns `[id, slug]` in data_json.

### Cookie operations

```js
res.cookie('runtime_session', token, cookieOpts);
res.clearCookie('runtime_session', clearOpts);
const token = req.cookies.runtime_session;
```

Produces `sets_cookie` and `reads_cookie` edges with cookie name and scope in data_json.

### Config reads

```js
const basePath = runtimeConfig.basePath || '';
const port = process.env.PORT || 3060;
```

Produces `config` nodes and `reads` edges.

### Module exports and requires

```js
module.exports = { createCompanyMiddleware, validateCompanySlug };
const { createCompanyMiddleware } = require('./company');
```

Produces `module` nodes for each file's export surface. `calls` edges link `require()` sites to the target module's exports. This is the bridge for cross-file resolution.

### Cross-project URL construction

Detects URL string construction that references paths matching other projects' known routes:

```js
apiBase: '/runtime/advenire-consulting/api/public/booking'
fetch(getContextRoot() + 'api/runtime/tools')
```

The pattern module records these as **unresolved URL reference nodes** (type `url_reference`) with the raw URL in metadata. It does not attempt to resolve them to target routes — that's the cross-project resolver's job (see Scanner section). This keeps the extractor self-contained and removes the dependency on other projects being scanned first.

### Middleware Sequence Numbers

Sequence numbers are assigned at the **call site**, not the definition site. When `server.js` calls `app.use(securityHeaders(...))` then `app.use(companyMiddleware)`, the sequence comes from the order of those `app.use()` calls in server.js — not from where `securityHeaders` or `companyMiddleware` are defined.

The extractor tracks a per-app counter that increments with each `app.use()`, `app.get()`, etc. call. Sub-app mounting (`outerApp.use('/runtime', app)`) records the mount point; the query engine stitches the outer and inner sequences together at query time by following `mounts` edges.

This means the sequence is file-scoped — `server.js` knows its own middleware order, and the query engine reconstructs the full chain across files by walking mount edges.

### Known V1 Extraction Gaps

The following Express/Node patterns are not extracted in v1. They can be added as extractor enhancements without schema or interface changes:

- **`router.param()` middleware** — pre-populates `req.params` values, invisible to the current pattern list
- **Error-handling middleware** — four-argument `(err, req, res, next)` functions that define error recovery flow
- **`res.redirect()`** — flow terminator that routes requests across URL boundaries
- **Dynamic route parameters** — extracting `:slug`, `:id` etc. from path patterns like `/api/companies/:slug/tools/:toolSlug`
- **EventEmitter / process.on** — event-driven flows that cross function boundaries without direct calls
- **Websocket message handlers** — `ws.on('message', ...)` patterns

These are documented here so implementers know they were considered and deferred, not overlooked.

---

## Scanner

### `hippocampus/scripts/flow-scan.js`

```
node hippocampus/scripts/flow-scan.js [project]
node hippocampus/scripts/flow-scan.js --all
node hippocampus/scripts/flow-scan.js --file <project> <filePath>
```

1. Loads project roster from hippocampus config (same source as scan.js)
2. For each project, walks files using `file-collector.js` (reuse existing)
3. Checks file hash against `file_hashes` table — skip if unchanged
4. Delegates to the appropriate flow extractor based on file extension
5. **Phase 1 — Nodes:** Deletes old nodes for changed files, inserts new nodes (transaction per project)
6. **Phase 2 — Edges:** Resolves edge `{name, file, type}` tuples to node IDs, inserts edges (transaction per project)
7. Updates file hashes

Two-phase insert ensures intra-project edge targets exist before resolution. A `calls` edge from `server.js` to a function in `company.js` resolves correctly regardless of file scan order — all nodes are in the DB before any edges are resolved.

The scanner does **not** resolve cross-project references. That's a separate script.

### Cross-Project Resolver — `flow-resolve.js`

```
node hippocampus/scripts/flow-resolve.js [--project P]
```

Runs after `flow-scan.js`. Finds all `url_reference` nodes, matches them against known `route` nodes across projects, and creates `cross_project` edges for successful matches. Unresolved references stay as-is — they can be resolved on the next run or manually annotated.

Separated because:
- Cross-project resolution requires all projects to be scanned first — it's a fundamentally different phase
- It can be triggered independently (e.g., after manually adding route annotations)
- It keeps the scanner simple — parse files, emit nodes and edges, done

### Incremental behavior

- **Post-edit hook** — calls `flow-scan.js --file` for the single file that was edited. Fast: one AST parse, one DB transaction. Does **not** run cross-project resolution (too expensive for a single edit).
- **Wrapup** — calls `flow-scan.js --all`, then `flow-resolve.js`. Only re-parses files whose hash changed since last scan. The first run is the only slow one.
- **Change detection** — SHA-1 hash of file content, stored in `file_hashes` table. Matches `term-scanner.js` convention (content dedup, not security).

---

## Query CLI

### `hippocampus/scripts/flow.js`

**`--trace <identifier> [--project P]`**

Follow a value through the graph. Shows where it's created, where it flows, who consumes it.

```
$ node hippocampus/scripts/flow.js --trace req.company --project sonder-runtime

req.company — set by createCompanyMiddleware (lib/company.js:105)
  shape: { id, slug, name, db, theme, assignedTools }
  
  Reads:
    server.js:851  -> req.company.assignedTools (tool allowlist check)
    server.js:869  -> req.company.db (public route DB injection)
    server.js:898  -> req.company.assignedTools (tool access gate)
    server.js:915  -> req.company.db (tool context DB injection)
    server.js:941  -> req.company.db (shell auth check)
    server.js:946  -> req.company.slug (shell response)

  Set by middleware registered at:
    server.js:996  -> app.use(companyMiddleware)
  
  Runs after:
    securityHeaders, rateLimiter, express.json, cookieParser
  
  Runs before:
    companyApp routes (auth, tools, shell)
```

**`--flow <file> [--project P]`**

Show everything flowing in and out of a file.

```
$ node hippocampus/scripts/flow.js --flow lib/company.js --project sonder-runtime

lib/company.js
  Imports: ./database, ./auth, ./server-utils
  Exports: COMPANY_SLUG_RE, RESERVED_PREFIXES, validateCompanySlug, createCompanyMiddleware

  createCompanyMiddleware(runtimeDb, tools, config)
    Receives: runtimeDb (runtime.db handle), tools (scanned manifests), config ({ companiesDir, cleanupIntervalMinutes })
    Attaches: req.company { id, slug, name, db, theme, assignedTools }, req.db
    Queries: companies (SELECT), company_tools (SELECT)
    Calls: getCompanyDb(), installToolSchema(), cleanupSessions(), safeJsonParse()
    
  Consumed by:
    server.js:610 -> createCompanyMiddleware(db, tools, { companiesDir, cleanupIntervalMinutes })
    server.js:996 -> app.use(companyMiddleware)
    
  Downstream dependents (read req.company):
    server.js (12 reads), tools/*/routes.js (via req.company.db)
```

**`--notes <file:name> [--project P]`**

Show annotations for a node or all nodes in a file. Nodes are addressed as `file:name` (e.g., `lib/company.js:createCompanyMiddleware`). Pass just a file path to see all annotations in that file.

**`--annotate <file:name> "note text" [--project P]`**

Add an annotation to a node. Uses the same `file:name` addressing. If the name is ambiguous (multiple node types with the same name in the same file), the CLI lists matches and prompts for selection.

### Output token budget

Queries target 100-300 tokens of output. The full graph stays in SQLite. Only the relevant subgraph is rendered. If a trace touches 50 nodes, the output shows the path, not every node's full detail.

---

## Integration

### Post-edit hook

Add flow extraction to the existing post-edit hook, calling `flow-scan.js --file` for the edited file. Use `execFileSync` (not `exec`) to avoid shell injection. Timeout of 10 seconds prevents blocking on parse errors or WAL contention.

### Wrapup

Add `flow-scan.js --all` to `wrapup-mechanical.js` after the term scan step. Timeout of 30 seconds for the full sweep.

### brain-tools.md

Add to the "What Answers What" table:

| Question | Tool |
|----------|------|
| "How does data flow through this file?" | `flow.js --flow <file>` |
| "Where is this value set and who reads it?" | `flow.js --trace <identifier>` |
| "What middleware runs before my route?" | `flow.js --trace req.<property>` |
| "What tables does this file access?" | `flow.js --flow <file>` (shows queries_table edges) |
| "What would break if I changed this?" | `flow.js --trace <function>` (shows all callers with args) |

### No changes to

- DIR files or scan.js
- Term index or term-scanner.js
- Existing extractors in `extractors/`
- query.js
- Any existing brain functionality

---

## File Structure

```
hippocampus/
  flow-extractors/
    javascript/
      index.js                  <- acorn parse, single AST walk, delegates to patterns
      patterns/
        express-routes.js       <- route registration, method + path
        express-middleware.js   <- app.use() chains, sequence tracking
        sql-operations.js       <- .prepare/.run/.all/.get with SQL parsing
        req-property-flow.js    <- req.X assignment and reads, shape propagation
        module-exports.js       <- require(), module.exports, import/export
        cookie-operations.js    <- res.cookie(), req.cookies reads
        config-reads.js         <- process.env, config object property access
        function-calls.js       <- declarations, expressions, call sites, argument passing
        cross-project-urls.js   <- URL string construction → url_reference nodes
  lib/
    flow-extractor-registry.js  <- auto-discovery of flow extractors (directory-based)
    flow-db.js                  <- connection, schema init, insert, delete (write side)
    flow-queries.js             <- traversal, subgraph extraction, trace logic (read side)
  scripts/
    flow-scan.js                <- incremental scanner CLI
    flow-resolve.js             <- cross-project URL → route edge resolver
    flow.js                     <- query CLI (--trace, --flow, --notes, --annotate)
```

New dependency: `acorn` (add to package.json).

### Files Changed

| File | Action | Description |
|------|--------|-------------|
| `hippocampus/flow-extractors/javascript/index.js` | Create | AST parse + pattern module coordinator |
| `hippocampus/flow-extractors/javascript/patterns/express-routes.js` | Create | Route registration detection |
| `hippocampus/flow-extractors/javascript/patterns/express-middleware.js` | Create | app.use() chains + sequence tracking |
| `hippocampus/flow-extractors/javascript/patterns/sql-operations.js` | Create | SQL query/mutation table detection |
| `hippocampus/flow-extractors/javascript/patterns/req-property-flow.js` | Create | req.X assignment/reads + shape propagation |
| `hippocampus/flow-extractors/javascript/patterns/module-exports.js` | Create | require/module.exports resolution |
| `hippocampus/flow-extractors/javascript/patterns/cookie-operations.js` | Create | res.cookie/req.cookies detection |
| `hippocampus/flow-extractors/javascript/patterns/config-reads.js` | Create | process.env + config object access |
| `hippocampus/flow-extractors/javascript/patterns/function-calls.js` | Create | Declarations, expressions, call sites, arg passing |
| `hippocampus/flow-extractors/javascript/patterns/cross-project-urls.js` | Create | URL construction → url_reference nodes |
| `hippocampus/lib/flow-extractor-registry.js` | Create | Auto-discovery of flow extractors (directory-based) |
| `hippocampus/lib/flow-db.js` | Create | Connection, schema init, insert, delete (write side) |
| `hippocampus/lib/flow-queries.js` | Create | Traversal, subgraph extraction, trace logic (read side) |
| `hippocampus/scripts/flow-scan.js` | Create | Incremental scanner CLI |
| `hippocampus/scripts/flow-resolve.js` | Create | Cross-project URL → route edge resolver |
| `hippocampus/scripts/flow.js` | Create | Query CLI (--trace, --flow, --notes, --annotate) |
| `package.json` | Edit | Add `acorn` dependency |
| Post-edit hook | Edit | Add `flow-scan.js --file` call |
| `scripts/wrapup-mechanical.js` | Edit | Add `flow-scan.js --all` + `flow-resolve.js` calls |

**DB layer split:** `flow-db.js` handles connection management, schema initialization, and write operations (insert nodes/edges, delete by file, update hashes). `flow-queries.js` handles read operations (graph traversal, subgraph extraction, trace path computation). The scanner imports the write side. The query CLI imports the read side. They share the same database file but have no code coupling.

---

## Migration Path — Replacing the Term Index

The flow graph sits alongside the existing hippocampus architecture initially. Over time, as it proves itself on real queries, it can subsume the mechanical parts of the current system.

### What the flow graph replaces (eventually)

| Current tool | Flow graph equivalent | When to migrate |
|---|---|---|
| `--blast-radius` | Edge traversal — callers, callees, data flow (deeper than import/export) | When `--trace` reliably answers "what breaks if I change this?" |
| `--structure` | Function/class nodes with line numbers | When flow graph nodes cover the same identifiers |
| `--find` | Node lookup by name across projects, with relationship context | When node coverage matches term index coverage |
| `--schema` | Table nodes with column metadata from actual query sites | When SQL extraction handles all query patterns in use |
| `--lookup` (exports, routes, db refs) | Module nodes + route nodes + table edges | When `--flow <file>` returns the same info plus more |

### What survives

| Current tool | Why it stays |
|---|---|
| `--map` / DIR files | **Narrative orientation.** "What does this project do and why" is human-authored context the graph can't generate. DIR files slim down — drop mechanical export/import/route/db-ref listings (the graph has those), keep descriptions and aliases. |
| `--resolve` / aliases | **Conversational shortcuts.** "booking routes" → file path. Fuzzy human naming doesn't come from a graph. |
| `scan.js` project discovery | **Still needed** to know what directories are projects. Flow scanner reuses this roster. |

### Migration sequence

1. **Ship alongside** — flow graph is additive, no existing tools change (current plan)
2. **Earn trust** — use both systems in real sessions. If `--trace` answers what `--blast-radius` used to, that's signal.
3. **Redirect commands** — once a flow graph query is strictly better, redirect the old command to it (e.g., `--blast-radius` calls `flow-queries.js` internally). No user-facing change.
4. **Slim DIR files** — drop mechanical sections (exports, imports, routes, db refs). Keep narrative descriptions and aliases only.
5. **Retire term scanner** — stop running `term-scanner.js` in wrapup. Flow scanner is the single source of structural truth. At this point, `file_hashes` in flow.db should inherit the richer metadata (size, mtime) that term-scanner uses for fast-path skip logic (check mtime before hashing, check size before reading content).

Each step is reversible. If the flow graph misses something the term index caught, that's a gap to fill in the pattern modules, not a reason to keep both running permanently.

---

## Content Guardrails

- No changes to existing hippocampus files except adding the flow scan call to post-edit hook and wrapup
- The flow.db is a new database, separate from terms.db
- Flow extractors are in their own directory, not mixed with existing extractors
- The query CLI is a separate script, not added to query.js
- AST parsing failures on a single file must not block the scan — log a warning, skip the file
- Cross-project resolution is a separate script, best-effort — unresolved references are not errors
- Annotations are opt-in, not required for the graph to be useful
- Pattern modules within a language extractor are auto-discovered — adding detection capability is dropping a file, not editing the coordinator
