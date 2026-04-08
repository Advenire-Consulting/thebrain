// Canonical frontmatter schema for spec-check. Defines required fields, array shapes,
// and generates copy-paste-ready YAML templates. Used by the validator (Chunk 2) and CLI (Chunk 5).

// The complete field schema — required scalars, required arrays with their item shapes, and plan-only fields.
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

// Returns a list of valid doc_type values.
function getValidTypes() {
  return SCHEMA.required.doc_type.values.slice();
}

// Returns a ready-to-paste YAML frontmatter block for the given doc type ('spec' or 'plan').
// Throws if docType is not a known type.
function renderTemplate(docType) {
  if (!getValidTypes().includes(docType)) {
    throw new Error(`renderTemplate: unknown doc type "${docType}". Must be spec or plan.`);
  }

  const implementsLine = docType === 'plan'
    ? `implements: 2026-04-07-your-spec-name   # filename stem of the spec this plan implements\n`
    : '';

  return `---
# Every spec and plan needs this block. Fill in every field.
# Cross-reference other docs by their filename stem (no .md, no date prefix stripping).

doc_type: ${docType}                          # spec | plan
date: 2026-04-07                        # YYYY-MM-DD
status: proposed                        # proposed | in-plan | in-flight | shipped
feature_area: features/your-area        # short path or label
${implementsLine}
touches:
  files:
    # Every file this doc creates, modifies, or deletes.
    - path: path/to/file.js             # project-relative, no leading slash
      mode: modify                      # create | modify | delete
      spec_section: L120-L160           # where in THIS doc the rationale lives (format: L<start>-L<end>)
      source_lines: L575-L667           # optional — slice of the TARGET file this doc edits. Same L<start>-L<end> format (NOT bare numbers). Use null if unknown.

  schema:
    # Every database table change.
    # - table: your_table
    #   change: add_columns             # create | add_columns | add_indexes | drop_column | drop_table | modify_constraint
    #   spec_section: L200-L215
    []

  events:
    emits:
      # Events this doc plans to emit. \`from_file\` MUST appear in touches.files above.
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
`;
}

module.exports = { SCHEMA, renderTemplate, getValidTypes };
