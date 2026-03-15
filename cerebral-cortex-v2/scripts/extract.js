const fs = require('fs');
const path = require('path');
const { extractWindow } = require('../lib/extractor');
const { detectDecisions } = require('../lib/decision-detector');
const { RecallDB } = require('../lib/db');
const { readIndex } = require('../lib/scanner');

async function extractAndStore(db, windowsIndex, filterLevel) {
  let extracted = 0;
  let skipped = 0;

  for (const [sessionId, session] of Object.entries(windowsIndex)) {
    for (const win of session.windows) {
      if (db.hasWindow(sessionId, win.seq)) {
        // Window already extracted — but check if decisions need adding
        const existingWin = db.getWindow(sessionId, win.seq);
        if (existingWin && !db.hasDecisions(existingWin.id)) {
          const filePath = path.join(session.dir, session.file);
          if (!fs.existsSync(filePath)) { skipped++; continue; }
          const decs = detectDecisions(filePath, win.startLine, win.endLine);
          if (decs.length > 0) {
            db.insertDecisions(existingWin.id, decs);
          }
          const existingSummary = db.getSummary(existingWin.id);
          if ((!existingSummary || !existingSummary.next) && decs.length > 0) {
            const projects = db.getProjects(existingWin.id);
            const topProject = projects.length > 0
              ? projects.sort((a, b) => b.frequency - a.frequency)[0].project
              : null;
            const summaryLines = decs.map(d => {
              const statusTag = d.status !== 'decided' ? ` (${d.status})` : '';
              return d.summary + statusTag;
            });
            db.insertSummary(existingWin.id, {
              scope: topProject,
              summary: summaryLines.join('; '),
              files: [...new Set(decs.filter(d => d.fileAnchors).flatMap(d => d.fileAnchors).map(f => f.split('/').pop()))].join(', ') || null,
              next: null,
            });
          }
        }
        skipped++;
        continue;
      }

      const filePath = path.join(session.dir, session.file);
      if (!fs.existsSync(filePath)) { skipped++; continue; }
      const result = await extractWindow(filePath, win.startLine, win.endLine, filterLevel);

      const winId = db.insertWindow({
        sessionId,
        seq: win.seq,
        startLine: win.startLine,
        endLine: win.endLine,
        startTime: win.startTime,
        endTime: win.endTime,
      });

      if (Object.keys(result.projects).length > 0) {
        db.insertProjects(winId, result.projects);
      }

      if (result.files.length > 0) {
        db.insertFiles(winId, result.files);
      }

      const termRows = [];
      for (const [term, data] of Object.entries(result.userTerms)) {
        termRows.push({ term, source: 'user', lines: data.lines, count: data.count });
      }
      for (const [term, data] of Object.entries(result.assistantTerms)) {
        termRows.push({ term, source: 'assistant', lines: data.lines, count: data.count });
      }
      if (termRows.length > 0) {
        db.insertTerms(winId, termRows);
      }

      // Decision detection + mechanical summary generation
      if (!db.hasDecisions(winId)) {
        const decs = detectDecisions(filePath, win.startLine, win.endLine);
        if (decs.length > 0) {
          db.insertDecisions(winId, decs);
        }

        if (!db.getSummary(winId) && decs.length > 0) {
          const projects = db.getProjects(winId);
          const topProject = projects.length > 0
            ? projects.sort((a, b) => b.frequency - a.frequency)[0].project
            : null;

          const summaryLines = decs.map(d => {
            const statusTag = d.status !== 'decided' ? ` (${d.status})` : '';
            return d.summary + statusTag;
          });
          const summary = summaryLines.join('; ');

          const allAnchors = decs
            .filter(d => d.fileAnchors)
            .flatMap(d => d.fileAnchors)
            .map(f => f.split('/').pop());
          const uniqueFiles = [...new Set(allAnchors)].join(', ');

          db.insertSummary(winId, {
            scope: topProject,
            summary: summary,
            files: uniqueFiles || null,
            next: null,
          });
        }
      }

      extracted++;
    }
  }

  return { extracted, skipped };
}

async function main() {
  const filterLevel = process.argv[2] || 'medium';
  const force = process.argv.includes('--force');

  const { DEFAULT_RECALL_DB_PATH, DEFAULT_WINDOWS_PATH } = require('../lib/db');
  const INDEX_PATH = DEFAULT_WINDOWS_PATH;
  const DB_PATH = DEFAULT_RECALL_DB_PATH;

  console.log('CC2 - Metadata Extraction');
  console.log('Filter: ' + filterLevel + ' | Force: ' + force);
  console.log('='.repeat(40));

  const windowsIndex = readIndex(INDEX_PATH);
  const db = new RecallDB(DB_PATH);

  if (force) {
    console.log('Force mode - clearing existing data...');
    // Preserve Claude-written summaries (identified by non-null 'next' field)
    const claudeSummaries = db.db.prepare(
      'SELECT ws.*, w.session_id, w.seq FROM window_summaries ws JOIN windows w ON w.id = ws.window_id WHERE ws.next IS NOT NULL'
    ).all();
    if (claudeSummaries.length > 0) {
      console.log('Preserving ' + claudeSummaries.length + ' Claude-written summaries...');
    }
    db.db.exec('DELETE FROM window_decisions; DELETE FROM window_summaries; DELETE FROM window_terms; DELETE FROM window_files; DELETE FROM window_projects; DELETE FROM windows;');
    // Restore Claude summaries after re-extraction (keyed by session+seq, reinserted in post-pass)
    if (claudeSummaries.length > 0) {
      db._preservedSummaries = claudeSummaries;
    }
  }

  const stats = await extractAndStore(db, windowsIndex, filterLevel);

  // Restore preserved Claude summaries (overwrite mechanical ones)
  if (db._preservedSummaries && db._preservedSummaries.length > 0) {
    let restored = 0;
    for (const cs of db._preservedSummaries) {
      const win = db.getWindow(cs.session_id, cs.seq);
      if (!win) continue;
      db.db.prepare(
        'INSERT OR REPLACE INTO window_summaries (window_id, scope, summary, files, next) VALUES (?, ?, ?, ?, ?)'
      ).run(win.id, cs.scope, cs.summary, cs.files, cs.next);
      restored++;
    }
    console.log('Restored ' + restored + ' Claude-written summaries');
  }

  // Link decisions across compaction boundaries
  let linked = 0;
  for (const [sessionId, session] of Object.entries(windowsIndex)) {
    if (session.windows.length < 2) continue;

    for (let i = 0; i < session.windows.length - 1; i++) {
      const winA = db.getWindow(sessionId, i);
      const winB = db.getWindow(sessionId, i + 1);
      if (!winA || !winB) continue;

      const decsA = db.getDecisions(winA.id);
      const decsB = db.getDecisions(winB.id);
      if (decsA.length === 0 || decsB.length === 0) continue;

      const lastA = decsA[decsA.length - 1];
      if (lastA.continues_to_session) continue; // already linked

      const firstB = decsB[0];

      const anchorsA = lastA.file_anchors ? JSON.parse(lastA.file_anchors) : [];
      const anchorsB = firstB.file_anchors ? JSON.parse(firstB.file_anchors) : [];
      const termsA = JSON.parse(lastA.terms);
      const termsB = JSON.parse(firstB.terms);

      const fileOverlap = anchorsA.some(a => {
        const dirA = a.split('/').slice(0, -1).join('/');
        return anchorsB.some(b => b === a || b.split('/').slice(0, -1).join('/') === dirA);
      });
      const termOverlap = termsA.filter(t => termsB.includes(t)).length >= 2;

      if (fileOverlap || termOverlap) {
        db.db.prepare(
          'UPDATE window_decisions SET continues_to_session = ?, continues_to_seq = ? WHERE id = ?'
        ).run(sessionId, i + 1, lastA.id);
        linked++;
      }
    }
  }

  console.log('\nExtracted: ' + stats.extracted);
  console.log('Skipped:   ' + stats.skipped);
  if (linked > 0) console.log('Linked:    ' + linked + ' compaction seams');
  console.log('DB:        ' + DB_PATH);

  const totalTerms = db.db.prepare('SELECT COUNT(*) as c FROM window_terms').get().c;
  const totalFiles = db.db.prepare('SELECT COUNT(*) as c FROM window_files').get().c;
  const totalProjects = db.db.prepare('SELECT COUNT(DISTINCT project) as c FROM window_projects').get().c;
  const totalDecisions = db.db.prepare('SELECT COUNT(*) as c FROM window_decisions').get().c;
  const totalSummaries = db.db.prepare('SELECT COUNT(*) as c FROM window_summaries').get().c;
  console.log('Terms:     ' + totalTerms);
  console.log('Files:     ' + totalFiles);
  console.log('Projects:  ' + totalProjects);
  console.log('Decisions: ' + totalDecisions);
  console.log('Summaries: ' + totalSummaries);

  db.close();
}

module.exports = { extractAndStore };
if (require.main === module) {
  main().catch(function(err) {
    console.error('Fatal:', err.message);
    process.exit(1);
  });
}
