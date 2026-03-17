const path = require('path');

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
  var anchorTime = options.anchorTime ? new Date(options.anchorTime) : new Date();
  var limit = options.limit || 10;
  var USER_WEIGHT = 2;
  var ASSISTANT_WEIGHT = 1;
  var PROJECT_BOOST = 3;
  var FILE_BOOST = 2;

  // 1. Collect all unique terms across all clusters
  var allTerms = [];
  for (var c = 0; c < clusters.length; c++) {
    for (var t = 0; t < clusters[c].length; t++) {
      if (allTerms.indexOf(clusters[c][t]) === -1) {
        allTerms.push(clusters[c][t]);
      }
    }
  }
  if (allTerms.length === 0) return [];

  // 2. FTS5 candidate retrieval — single indexed query
  var candidates = db.searchCandidates(allTerms);
  if (candidates.length === 0) return [];

  // 3. Load full window records for candidates only
  var windowsById = {};
  for (var ci = 0; ci < candidates.length; ci++) {
    var wid = candidates[ci].windowId;
    if (!windowsById[wid]) {
      var win = db.db.prepare('SELECT * FROM windows WHERE id = ?').get(wid);
      if (win) windowsById[wid] = win;
    }
  }

  // 4. Score each candidate using same logic as before
  var scored = [];

  for (var i = 0; i < candidates.length; i++) {
    var cand = candidates[i];
    var win = windowsById[cand.windowId];
    if (!win) continue;

    var totalScore = 0;
    var allFocusLines = [];

    for (var cc = 0; cc < clusters.length; cc++) {
      var cluster = clusters[cc];
      var clusterHits = 0;
      var clusterMax = cluster.length;

      var resolvedProject = resolveProjectFromTerms(cluster);

      for (var ti = 0; ti < cluster.length; ti++) {
        var term = cluster[ti];

        var termRows = db.db.prepare(
          'SELECT * FROM window_terms WHERE window_id = ? AND term = ?'
        ).all(win.id, term);

        if (termRows.length > 0) {
          clusterHits++;
          for (var r = 0; r < termRows.length; r++) {
            var weight = termRows[r].source === 'user' ? USER_WEIGHT : ASSISTANT_WEIGHT;
            totalScore += termRows[r].count * weight;
            var lines = JSON.parse(termRows[r].lines);
            allFocusLines.push.apply(allFocusLines, lines);
          }
        }

        var fileRows = db.db.prepare(
          "SELECT * FROM window_files WHERE window_id = ? AND file_path LIKE ?"
        ).all(win.id, '%' + term + '%');

        if (fileRows.length > 0) {
          clusterHits++;
          totalScore += FILE_BOOST * fileRows.length;
          for (var fr = 0; fr < fileRows.length; fr++) {
            var fLines = JSON.parse(fileRows[fr].lines);
            allFocusLines.push.apply(allFocusLines, fLines);
          }
        }
      }

      if (resolvedProject) {
        var projRow = db.db.prepare(
          'SELECT frequency FROM window_projects WHERE window_id = ? AND project = ?'
        ).get(win.id, resolvedProject);

        if (projRow) {
          totalScore += PROJECT_BOOST * Math.log2(projRow.frequency + 1);
          clusterHits++;
        }
      }

      var clusterScore = clusterMax > 0 ? clusterHits / clusterMax : 0;
      totalScore *= (0.5 + 0.5 * clusterScore);
    }

    if (totalScore === 0) continue;

    // Time decay
    var endTime = new Date(win.end_time);
    var daysSince = Math.max(0, (anchorTime - endTime) / (1000 * 60 * 60 * 24));
    var decay = 1 / (1 + daysSince * 0.1);
    totalScore *= decay;

    allFocusLines.sort(function(a, b) { return a - b; });
    var focusStart = allFocusLines.length > 0 ? allFocusLines[0] : win.start_line;
    var focusEnd = allFocusLines.length > 0 ? allFocusLines[allFocusLines.length - 1] : win.end_line;

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

  scored.sort(function(a, b) { return b.score - a.score; });
  return scored.slice(0, limit);
}

module.exports = { search, resolveProjectFromTerms };
