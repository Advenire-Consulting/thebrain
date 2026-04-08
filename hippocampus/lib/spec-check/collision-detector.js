// Collision detector — pure functions over parsed spec/plan docs.
// Each rule takes docs[] and returns an array of collision records.

// Helper: is this pair of docs an implements-relationship? A plan that declares
// `implements: <spec-id>` is expected to touch everything the spec does, so their
// overlaps are not collisions.
function pairIsImplementsRelated(idA, idB, docsById) {
  const a = docsById.get(idA);
  const b = docsById.get(idB);
  if (a && a.data && a.data.implements === idB) return true;
  if (b && b.data && b.data.implements === idA) return true;
  return false;
}

// Helper: does a group of colliding entries contain at least two DISTINCT docs?
// A single doc declaring the same path/table/emit twice is not a collision —
// intra-doc duplicates are an authoring concern, not a cross-doc conflict.
function hasDistinctDocs(entries) {
  const ids = new Set(entries.map(e => e.docId));
  return ids.size >= 2;
}

// Helper: does a group of colliding entries contain any pair of DISTINCT docs that
// is NOT an implements-pair? If every cross-doc pair is implements-related (common
// case: 2 entries from a plan + its spec), the group is not a real collision. If any
// pair is unrelated (e.g. a third doc in the mix), it's a real collision.
function hasRealCollision(entries, docsById) {
  if (!hasDistinctDocs(entries)) return false;
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (entries[i].docId === entries[j].docId) continue;
      if (!pairIsImplementsRelated(entries[i].docId, entries[j].docId, docsById)) {
        return true;
      }
    }
  }
  return false;
}

// Rule: two or more docs declare touches.files entries with the same path.
// Soft warning if both have source_lines and they don't overlap; hard otherwise.
// Skipped entirely when the only overlap is between a plan and the spec it implements.
function detectFileCollisions(docs) {
  const docsById = new Map(docs.map(d => [d.id, d]));
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
    if (!hasRealCollision(entries, docsById)) continue;
    const allHaveSourceLines = entries.every(e => e.entry.source_lines);
    const severity = allHaveSourceLines && !anyOverlap(entries.map(e => e.entry.source_lines))
      ? 'soft'
      : 'hard';
    collisions.push({ kind: 'file', path, severity, entries });
  }
  return collisions;
}

// Rule: two or more docs touch the same table.
// Skipped when the only overlap is plan↔implemented-spec.
function detectSchemaCollisions(docs) {
  const docsById = new Map(docs.map(d => [d.id, d]));
  const byTable = new Map();
  for (const doc of docs) {
    for (const entry of (doc.data.touches?.schema || [])) {
      if (!byTable.has(entry.table)) byTable.set(entry.table, []);
      byTable.get(entry.table).push({ docId: doc.id, entry });
    }
  }
  const collisions = [];
  for (const [table, entries] of byTable) {
    if (entries.length < 2) continue;
    if (!hasRealCollision(entries, docsById)) continue;
    collisions.push({ kind: 'schema', table, severity: 'hard', entries });
  }
  return collisions;
}

// Rule: a doc subscribes to an event that no doc in scope emits AND no codebase emit exists.
// `codebaseEmits` is a Set<string> of event names found by an external grep (passed in by the CLI).
// Output is grouped by event — one record per dangling event, with all subscribing docs under `subscribers`.
function detectDanglingSubscribes(docs, codebaseEmits = new Set()) {
  const emitted = new Set([...codebaseEmits]);
  for (const doc of docs) {
    for (const emit of (doc.data.touches?.events?.emits || [])) {
      emitted.add(emit.name);
    }
  }
  const byEvent = new Map();
  for (const doc of docs) {
    for (const sub of (doc.data.touches?.events?.subscribes || [])) {
      if (emitted.has(sub.name)) continue;
      if (!byEvent.has(sub.name)) byEvent.set(sub.name, []);
      byEvent.get(sub.name).push({ docId: doc.id, entry: sub });
    }
  }
  const dangling = [];
  for (const [event, subscribers] of byEvent) {
    dangling.push({
      kind: 'dangling_subscribe',
      event,
      severity: 'warning',
      subscribers,
    });
  }
  return dangling;
}

// Rule: two or more docs declare emits with the same (from_file, name) pair.
// Skipped when the only overlap is plan↔implemented-spec.
function detectDoubleEmits(docs) {
  const docsById = new Map(docs.map(d => [d.id, d]));
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
    if (entries.length < 2) continue;
    if (!hasRealCollision(entries, docsById)) continue;
    const [fromFile, name] = key.split('::');
    collisions.push({ kind: 'double_emit', fromFile, event: name, severity: 'hard', entries });
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
