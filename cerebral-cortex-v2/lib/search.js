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

function search(db, clusters, options) {
  options = options || {};
  const anchorTime = options.anchorTime ? new Date(options.anchorTime) : new Date();
  const limit = options.limit || 10;
  const USER_WEIGHT = 2;
  const ASSISTANT_WEIGHT = 1;
  const PROJECT_BOOST = 3;
  const FILE_BOOST = 2;

  const allWindows = db.db.prepare('SELECT * FROM windows').all();
  if (allWindows.length === 0) return [];

  const scored = [];

  for (const win of allWindows) {
    let totalScore = 0;
    var allFocusLines = [];

    for (const cluster of clusters) {
      let clusterHits = 0;
      var clusterMax = cluster.length;

      const resolvedProject = resolveProjectFromTerms(cluster);

      for (const term of cluster) {
        const termRows = db.db.prepare(
          'SELECT * FROM window_terms WHERE window_id = ? AND term = ?'
        ).all(win.id, term);

        if (termRows.length > 0) {
          clusterHits++;
          for (const row of termRows) {
            var weight = row.source === 'user' ? USER_WEIGHT : ASSISTANT_WEIGHT;
            totalScore += row.count * weight;
            var lines = JSON.parse(row.lines);
            allFocusLines.push.apply(allFocusLines, lines);
          }
        }

        const fileRows = db.db.prepare(
          "SELECT * FROM window_files WHERE window_id = ? AND file_path LIKE ?"
        ).all(win.id, '%' + term + '%');

        if (fileRows.length > 0) {
          clusterHits++;
          totalScore += FILE_BOOST * fileRows.length;
          for (const row of fileRows) {
            var fLines = JSON.parse(row.lines);
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

      var clusterScore = clusterMax > 0 ? clusterHits / clusterMax : 0;
      totalScore *= (0.5 + 0.5 * clusterScore);
    }

    if (totalScore === 0) continue;

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
