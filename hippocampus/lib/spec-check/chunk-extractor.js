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
    '  - Line numbers in "Read first" may have shifted if prior chunks modified these files. Run `node thebrain-package/hippocampus/scripts/query.js --structure <file>` to get current function/definition line numbers before reading.',
    '  - Read any prior agent observations below before starting — they flag compounding issues you should account for.',
    `  - When done, append a "## Chunk ${chunkNumber} — <YYYY-MM-DD>" section to ${obsName} noting anything you saw but did not fix (out-of-scope smells, conventions that drifted, things the next chunk should know). Do NOT fix them — just note them.`,
    '  - When done, report what changed and what the user needs to test.',
    `  - Final step: move this chunk file into a "completed" subfolder within the chunks directory (create it if it doesn't exist). Example: \`mkdir -p chunks/completed && mv chunks/${stem}-chunk-${chunkNumber}.md chunks/completed/\``,
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

// Compute the dispatch payloads for every chunk in a plan — one assembled
// assignment per chunk, targeted at `<plan-dir>/chunks/<plan-stem>-chunk-<N>.md`.
// Does NOT write files; returns the array of { chunkNumber, chunkName,
// fileName, filePath, content, readInstruction } so callers can decide
// how to persist and surface the output.
function computeDispatchPayloads({ planPath, planContents, observations = '' }) {
  const path = require('path');
  const planDir = path.dirname(planPath);
  const stem = path.basename(planPath, '.md');
  const chunksDir = path.join(planDir, 'chunks');
  const chunks = listChunks(planContents);
  return chunks.map(c => {
    const fileName = `${stem}-chunk-${c.number}.md`;
    const filePath = path.join(chunksDir, fileName);
    const content = assembleAssignment({
      planPath,
      planContents,
      chunkNumber: c.number,
      observations,
    });
    return {
      chunkNumber: c.number,
      chunkName: c.name,
      fileName,
      filePath,
      content,
      readInstruction: `Read ${filePath} and execute it.`,
    };
  });
}

module.exports = {
  listChunks,
  extractPlanHeader,
  extractChunkBody,
  buildPreamble,
  filterPriorObservations,
  assembleAssignment,
  computeDispatchPayloads,
};
