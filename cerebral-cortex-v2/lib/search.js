'use strict';

const path = require('path');

function escapeLike(str) {
  return str.replace(/[%_\\]/g, '\\$&');
}

let _aliasMap = null;
function getAliasMap() {
  if (_aliasMap) return _aliasMap;
  _aliasMap = {};
  try {
    const { loadAllDIR } = require(path.join(__dirname, '..', '..', 'hippocampus', 'lib', 'dir-loader'));
    const dirs = loadAllDIR();
    for (const d of dirs) {
      _aliasMap[d.name] = d.name;
      if (d.aliases) {
        for (const alias of d.aliases) {
          const key = typeof alias === 'string' ? alias : alias.alias;
          if (key) {
            for (const word of key.toLowerCase().split(/\s+/)) {
              _aliasMap[word] = d.name;
            }
          }
        }
      }
    }
  } catch {}
  return _aliasMap;
}

function resolveProjectFromTerms(terms) {
  const aliases = getAliasMap();
  for (const term of terms) {
    if (aliases[term]) return aliases[term];
  }
  return null;
}

// FTS5-backed search: candidate retrieval via inverted index, then scoring
function search(db, clusters, options) {
  options = options || {};
  const anchorTime = options.anchorTime ? new Date(options.anchorTime) : new Date();
  const limit = options.limit || 10;
  const USER_WEIGHT = 2;
  const ASSISTANT_WEIGHT = 1;
  const PROJECT_BOOST = 3;
  const FILE_BOOST = 2;

  // 1. Collect all unique terms across all clusters
  const allTerms = [];
  for (let c = 0; c < clusters.length; c++) {
    for (let t = 0; t < clusters[c].length; t++) {
      if (allTerms.indexOf(clusters[c][t]) === -1) {
        allTerms.push(clusters[c][t]);
      }
    }
  }
  if (allTerms.length === 0) return [];

  // 2. FTS5 candidate retrieval — single indexed query
  const candidates = db.searchCandidates(allTerms);
  if (candidates.length === 0) return [];

  // 3. Load full window records for candidates only
  const windowsById = {};
  for (let ci = 0; ci < candidates.length; ci++) {
    const wid = candidates[ci].windowId;
    if (!windowsById[wid]) {
      const win = db.db.prepare('SELECT * FROM windows WHERE id = ?').get(wid);
      if (win) windowsById[wid] = win;
    }
  }

  // 4. Score each candidate
  const scored = [];

  for (let i = 0; i < candidates.length; i++) {
    const cand = candidates[i];
    const win = windowsById[cand.windowId];
    if (!win) continue;

    let totalScore = 0;
    const allFocusLines = [];

    for (let cc = 0; cc < clusters.length; cc++) {
      const cluster = clusters[cc];
      let clusterHits = 0;
      const clusterMax = cluster.length;

      const resolvedProject = resolveProjectFromTerms(cluster);

      for (let ti = 0; ti < cluster.length; ti++) {
        const term = cluster[ti];

        const termRows = db.db.prepare(
          'SELECT * FROM window_terms WHERE window_id = ? AND term = ?'
        ).all(win.id, term);

        if (termRows.length > 0) {
          clusterHits++;
          for (let r = 0; r < termRows.length; r++) {
            const weight = termRows[r].source === 'user' ? USER_WEIGHT : ASSISTANT_WEIGHT;
            totalScore += termRows[r].count * weight;
            const lines = JSON.parse(termRows[r].lines);
            allFocusLines.push.apply(allFocusLines, lines);
          }
        }

        const fileRows = db.db.prepare(
          "SELECT * FROM window_files WHERE window_id = ? AND file_path LIKE ? ESCAPE '\\'"
        ).all(win.id, '%' + escapeLike(term) + '%');

        if (fileRows.length > 0) {
          clusterHits++;
          totalScore += FILE_BOOST * fileRows.length;
          for (let fr = 0; fr < fileRows.length; fr++) {
            const fLines = JSON.parse(fileRows[fr].lines);
            allFocusLines.push.apply(allFocusLines, fLines);
          }
        }
      }

      if (resolvedProject) {
        const projRow = db.db.prepare(
          'SELECT frequency FROM window_projects WHERE window_id = ? AND project = ?'
        ).get(win.id, resolvedProject);

        if (projRow) {
          totalScore += PROJECT_BOOST * Math.log2(projRow.frequency + 1);
          clusterHits++;
        }
      }

      const clusterScore = clusterMax > 0 ? clusterHits / clusterMax : 0;
      totalScore *= (0.5 + 0.5 * clusterScore);
    }

    if (totalScore === 0) continue;

    // Time decay
    const endTime = new Date(win.end_time);
    const daysSince = Math.max(0, (anchorTime - endTime) / (1000 * 60 * 60 * 24));
    const decay = 1 / (1 + daysSince * 0.1);
    totalScore *= decay;

    allFocusLines.sort((a, b) => a - b);
    const focusStart = allFocusLines.length > 0 ? allFocusLines[0] : win.start_line;
    const focusEnd = allFocusLines.length > 0 ? allFocusLines[allFocusLines.length - 1] : win.end_line;

    scored.push({
      sessionId: win.session_id,
      seq: win.seq,
      startLine: win.start_line,
      endLine: win.end_line,
      startTime: win.start_time,
      endTime: win.end_time,
      score: Math.round(totalScore * 100) / 100,
      focusStart: focusStart,
      focusEnd: focusEnd,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}

module.exports = { search, resolveProjectFromTerms };
