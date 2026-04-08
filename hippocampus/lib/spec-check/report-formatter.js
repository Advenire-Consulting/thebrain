// Report formatter — pure string-building, no filesystem access.
// Exports: renderReport, renderHumanSummary, renderClaudeIndex, computeExitCode

function computeExitCode(collisions) {
  const all = [
    ...collisions.fileCollisions,
    ...collisions.schemaCollisions,
    ...collisions.danglingSubscribes,
    ...collisions.doubleEmits,
  ];
  if (all.some((c) => c.severity === 'hard')) return 1;
  return 0;
}

// ── Per-kind human formatters ────────────────────────────────────────────────

function formatFileCollision(c, index) {
  const lines = [];
  lines.push(`[C${index}] File — ${c.path} (${c.severity})`);
  for (const e of c.entries) {
    const docId = e.docId.padEnd(30);
    lines.push(`    ${docId} declares ${e.entry.action || 'modify'}`);
    if (e.entry.spec_section) {
      lines.push(`      spec section: ${e.entry.spec_section}${e.entry.section_title ? ` ("${e.entry.section_title}")` : ''}`);
    }
    const sl = e.entry.source_lines ? e.entry.source_lines : 'not declared';
    lines.push(`      source lines: ${sl}`);
  }
  if (c.impact) {
    const wrapped = wrapImpact(c.impact, 12);
    lines.push(`    Impact: ${wrapped}`);
  }
  return lines.join('\n');
}

function formatSchemaCollision(c, index) {
  const lines = [];
  lines.push(`[C${index}] Schema — ${c.table} (${c.severity})`);
  for (const e of c.entries) {
    const docId = e.docId.padEnd(30);
    lines.push(`    ${docId} declares ${e.entry.action || 'modify'}`);
    if (e.entry.spec_section) {
      lines.push(`      spec section: ${e.entry.spec_section}`);
    }
  }
  if (c.impact) {
    lines.push(`    Impact: ${wrapImpact(c.impact, 12)}`);
  }
  return lines.join('\n');
}

function formatDanglingSubscribe(c, index) {
  const lines = [];
  lines.push(`[C${index}] Dangling subscribe — ${c.event} (${c.severity || 'warning'})`);
  for (const s of c.subscribers) {
    const docId = s.docId.padEnd(30);
    lines.push(`    Subscribed by: ${s.docId}`);
    if (s.entry && s.entry.spec_section) {
      lines.push(`      spec section: ${s.entry.spec_section}`);
    }
  }
  lines.push(`    Emitted by: none detected in specs or existing code`);
  if (c.impact) {
    lines.push(`    Impact: ${wrapImpact(c.impact, 12)}`);
  }
  return lines.join('\n');
}

function formatDoubleEmit(c, index) {
  const lines = [];
  lines.push(`[C${index}] Double emit — ${c.event} (${c.severity})`);
  for (const e of c.entries) {
    const docId = e.docId.padEnd(30);
    lines.push(`    ${docId} declares emit`);
    if (e.entry && e.entry.spec_section) {
      lines.push(`      spec section: ${e.entry.spec_section}`);
    }
  }
  if (c.impact) {
    lines.push(`    Impact: ${wrapImpact(c.impact, 12)}`);
  }
  return lines.join('\n');
}

function wrapImpact(text, indent) {
  // Simple: first line inline, subsequent lines indented
  const pad = ' '.repeat(indent);
  const words = text.split(' ');
  const lines = [];
  let current = '';
  const lineWidth = 80 - indent;
  for (const word of words) {
    if (current.length + word.length + 1 > lineWidth && current.length > 0) {
      lines.push(current);
      current = word;
    } else {
      current = current.length > 0 ? current + ' ' + word : word;
    }
  }
  if (current.length > 0) lines.push(current);
  return lines.join('\n' + pad);
}

// ── Human Summary ────────────────────────────────────────────────────────────

function renderHumanSummary({ collisions, docs }) {
  const parts = [];
  const all = [
    ...collisions.fileCollisions.map((c) => ({ kind: 'file', c })),
    ...collisions.schemaCollisions.map((c) => ({ kind: 'schema', c })),
    ...collisions.danglingSubscribes.map((c) => ({ kind: 'dangling', c })),
    ...collisions.doubleEmits.map((c) => ({ kind: 'double', c })),
  ];

  parts.push(`${all.length} collision${all.length === 1 ? '' : 's'} detected:`);
  parts.push('');

  all.forEach(({ kind, c }, i) => {
    const index = i + 1;
    let block;
    if (kind === 'file') block = formatFileCollision(c, index);
    else if (kind === 'schema') block = formatSchemaCollision(c, index);
    else if (kind === 'dangling') block = formatDanglingSubscribe(c, index);
    else block = formatDoubleEmit(c, index);
    parts.push(block);
    parts.push('');
  });

  // Dependency ordering subsection
  const orderIssues = collisions.dependencyOrderIssues || [];
  if (orderIssues.length > 0) {
    parts.push('Dependency ordering:');
    for (const issue of orderIssues) {
      const deps = Array.isArray(issue.depends_on) ? issue.depends_on : [issue.depends_on];
      parts.push(`  ${issue.docId} depends on [${deps.join(', ')}]`);
      if (issue.statusNote) {
        parts.push(`    status: ${issue.statusNote}`);
      }
      if (issue.action) {
        parts.push(`    action: ${issue.action}`);
      }
    }
  }

  return parts.join('\n').replace(/\n+$/, '');
}

// ── Claude-Readable Index ────────────────────────────────────────────────────

function renderClaudeIndex({ collisions, docs, headerless = [] }) {
  const parts = [];

  // docs section
  parts.push('docs:');
  for (const d of docs) {
    parts.push(`  ${d.id}: ${d.filePath || d.id}`);
  }
  parts.push('');

  // conflicts.files
  parts.push('conflicts.files:');
  if (collisions.fileCollisions.length === 0) {
    parts.push('  []');
  } else {
    for (const c of collisions.fileCollisions) {
      parts.push(`  ${c.path}:`);
      for (const e of c.entries) {
        parts.push(`    - doc: ${e.docId}`);
        if (e.entry && e.entry.spec_section) {
          parts.push(`      spec_section: ${e.entry.spec_section}`);
        }
      }
    }
  }
  parts.push('');

  // conflicts.schema
  parts.push('conflicts.schema:');
  if (collisions.schemaCollisions.length === 0) {
    parts.push('  []');
  } else {
    for (const c of collisions.schemaCollisions) {
      parts.push(`  ${c.table}.${c.column}:`);
      for (const e of c.entries) {
        parts.push(`    - doc: ${e.docId}`);
        if (e.entry && e.entry.spec_section) {
          parts.push(`      spec_section: ${e.entry.spec_section}`);
        }
      }
    }
  }
  parts.push('');

  // conflicts.events.dangling_subscribes
  parts.push('conflicts.events.dangling_subscribes:');
  if (collisions.danglingSubscribes.length === 0) {
    parts.push('  []');
  } else {
    for (const c of collisions.danglingSubscribes) {
      parts.push(`  ${c.event}:`);
      parts.push(`    subscribers:`);
      for (const s of c.subscribers) {
        parts.push(`      - doc: ${s.docId}`);
        if (s.entry && s.entry.spec_section) {
          parts.push(`        spec_section: ${s.entry.spec_section}`);
        }
      }
    }
  }
  parts.push('');

  // conflicts.events.double_emits
  parts.push('conflicts.events.double_emits:');
  if (collisions.doubleEmits.length === 0) {
    parts.push('  []');
  } else {
    for (const c of collisions.doubleEmits) {
      parts.push(`  ${c.event}:`);
      for (const e of c.entries) {
        parts.push(`    - doc: ${e.docId}`);
        if (e.entry && e.entry.spec_section) {
          parts.push(`      spec_section: ${e.entry.spec_section}`);
        }
      }
    }
  }
  parts.push('');

  // dependency_graph — docs with depends_on or implements
  const graphDocs = docs.filter(
    (d) => d.data && (d.data.implements || (Array.isArray(d.data.depends_on) ? d.data.depends_on.length > 0 : d.data.depends_on))
  );
  parts.push('dependency_graph:');
  if (graphDocs.length === 0) {
    parts.push('  []');
  } else {
    for (const d of graphDocs) {
      parts.push(`  ${d.id}:`);
      if (d.data.depends_on !== undefined) {
        const dep = Array.isArray(d.data.depends_on) ? `[${d.data.depends_on.join(', ')}]` : d.data.depends_on;
        parts.push(`    depends_on: ${dep}`);
      }
      if (d.data.implements) {
        parts.push(`    implements: ${d.data.implements}`);
      }
      if (d.data.status) {
        parts.push(`    status: ${d.data.status}`);
      }
    }
  }
  parts.push('');

  // headerless
  parts.push('headerless:');
  if (headerless.length === 0) {
    parts.push('  []');
  } else {
    for (const h of headerless) {
      parts.push(`  - path: ${h.filePath}`);
      parts.push(`    lines: ${h.lineCount}`);
    }
  }

  return parts.join('\n');
}

// ── Top-level renderReport ───────────────────────────────────────────────────

function renderReport({ docs, collisions, headerless = [], meta }) {
  const parts = [];

  parts.push('=== SPEC CHECK ===');
  parts.push(`Scanned: ${meta.folderCount} folders, ${meta.docCount} docs`);
  parts.push('');

  parts.push('Docs found:');
  for (const d of docs) {
    const tag = d.data && d.data.implements ? `  → implements: ${d.data.implements}` : '';
    const status = d.data ? d.data.status || '' : '';
    const docType = d.data ? d.data.doc_type || '' : '';
    parts.push(`  ✓ ${d.id.padEnd(32)} [${docType}, ${status}, ${d.lineCount} lines]${tag}`);
  }
  for (const h of headerless) {
    parts.push(`  ⚠ ${h.id.padEnd(32)} [HEADERLESS, ${h.lineCount} lines]`);
  }
  parts.push('');

  if (headerless.length > 0) {
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
  parts.push(`exit_code: ${computeExitCode(collisions)}`);

  return parts.join('\n');
}

module.exports = { renderReport, renderHumanSummary, renderClaudeIndex, computeExitCode };
