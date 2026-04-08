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
const os = require('os');
const { listChunks, assembleAssignment, computeDispatchPayloads } = require('../lib/spec-check/chunk-extractor.js');

// Parse argv into a structured options object.
function parseArgs(argv) {
  const opts = {
    dirs: [],
    template: null,
    strict: false,
    listChunks: null,       // plan path
    chunkRange: null,       // { plan, n }
    chunkContent: null,     // { plan, n }
    dispatch: null,         // plan path
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir') { opts.dirs.push(argv[++i]); }
    else if (a === '--template') { opts.template = argv[++i]; }
    else if (a === '--strict') { opts.strict = true; }
    else if (a === '--list-chunks') { opts.listChunks = argv[++i]; }
    else if (a === '--chunk-range') { opts.chunkRange = { plan: argv[++i], n: parseInt(argv[++i], 10) }; }
    else if (a === '--chunk-content') { opts.chunkContent = { plan: argv[++i], n: parseInt(argv[++i], 10) }; }
    else if (a === '--dispatch') { opts.dispatch = argv[++i]; }
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
  spec-check.js --dispatch <plan>                  Write every chunk's assignment to <plan-dir>/chunks/
                                                   and append read instructions to ~/claude/command-log.txt
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

  if (opts.dispatch) {
    try {
      const planPath = path.resolve(opts.dispatch);
      const contents = await fs.readFile(planPath, 'utf8');
      const observations = readObservationsSync(planPath);
      const payloads = computeDispatchPayloads({ planPath, planContents: contents, observations });
      if (payloads.length === 0) {
        console.error(`spec-check: no chunks found in ${planPath}`);
        return 3;
      }
      // ensure the sibling chunks/ directory exists
      const chunksDir = path.dirname(payloads[0].filePath);
      fsSync.mkdirSync(chunksDir, { recursive: true });

      // write every chunk file
      for (const p of payloads) {
        fsSync.writeFileSync(p.filePath, p.content, 'utf8');
      }

      // append one read instruction per chunk to the clipboard log
      const commandLogPath = path.join(os.homedir(), 'claude', 'command-log.txt');
      fsSync.mkdirSync(path.dirname(commandLogPath), { recursive: true });
      const logLines = payloads.map(p => p.readInstruction).join('\n') + '\n';
      fsSync.appendFileSync(commandLogPath, logLines, 'utf8');

      // human-readable summary
      console.log(`Wrote ${payloads.length} chunk${payloads.length === 1 ? '' : 's'} to ${chunksDir}/`);
      for (const p of payloads) {
        console.log(`  Chunk ${p.chunkNumber}: ${p.fileName}${p.chunkName ? ` — ${p.chunkName}` : ''}`);
      }
      console.log(`Appended ${payloads.length} read instruction${payloads.length === 1 ? '' : 's'} to ${commandLogPath}`);
      return 0;
    } catch (err) { console.error(`spec-check: ${err.message}`); return 3; }
  }

  if (opts.dirs.length === 0) {
    console.error('spec-check: must pass --dir, --template, --list-chunks, --chunk-range, --chunk-content, or --dispatch');
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
