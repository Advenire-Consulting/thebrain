'use strict';

const { FlowDB } = require('../lib/flow-db');

/**
 * Resolve url_reference nodes to route nodes across projects.
 * Creates cross_project edges when source and target are in different projects.
 */
function resolveUrlReferences(db) {
  // Find all url_reference nodes
  const urlRefs = db.db.prepare("SELECT * FROM nodes WHERE type = 'url_reference'").all();
  // Find all route nodes across all projects
  const routes = db.db.prepare("SELECT * FROM nodes WHERE type = 'route'").all();

  // Build map: route path → route nodes
  const routeMap = new Map();
  for (const route of routes) {
    const meta = route.metadata_json ? JSON.parse(route.metadata_json) : {};
    const routePath = meta.path;
    if (!routePath) continue;
    if (!routeMap.has(routePath)) routeMap.set(routePath, []);
    routeMap.get(routePath).push(route);
  }

  // Delete existing cross_project edges (will re-create)
  db.db.prepare("DELETE FROM edges WHERE type = 'cross_project'").run();

  let resolved = 0;
  let unresolved = 0;

  // Prepare insert statement
  const insertEdge = db.db.prepare(
    `INSERT INTO edges (source_id, target_id, type, source_project, source_file, data_json)
     VALUES (?, ?, 'cross_project', ?, ?, ?)`
  );

  for (const ref of urlRefs) {
    const meta = ref.metadata_json ? JSON.parse(ref.metadata_json) : {};
    const url = meta.url;
    if (!url) { unresolved++; continue; }

    let matched = false;

    // Check if URL contains or ends with any known route path
    for (const [routePath, routeNodes] of routeMap) {
      if (url.includes(routePath) || url.endsWith(routePath)) {
        for (const routeNode of routeNodes) {
          // Only create edge if source and target are in different projects
          if (ref.project !== routeNode.project) {
            try {
              insertEdge.run(ref.id, routeNode.id, ref.project, ref.file, JSON.stringify({ url, routePath }));
              matched = true;
            } catch (err) {
              // Duplicate or constraint error — skip
            }
          }
        }
      }
    }

    if (matched) resolved++;
    else unresolved++;
  }

  return { resolved, unresolved };
}

// CLI entry point
if (require.main === module) {
  const db = new FlowDB();
  try {
    const result = resolveUrlReferences(db);
    console.log(`Cross-project resolution: ${result.resolved} resolved, ${result.unresolved} unresolved`);
  } finally {
    db.close();
  }
}

module.exports = { resolveUrlReferences };
