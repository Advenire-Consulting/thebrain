const path = require('path');
const { RecallDB, DEFAULT_RECALL_DB_PATH } = require('../lib/db');
const { search } = require('../lib/search');
const { loadAllDIR } = require('../../hippocampus/lib/dir-loader');

const DB_PATH = DEFAULT_RECALL_DB_PATH;

var _projectRoots = null;
function getProjectRoots() {
  if (_projectRoots) return _projectRoots;
  _projectRoots = {};
  try {
    var dirs = loadAllDIR();
    for (var d of dirs) {
      _projectRoots[d.name] = d.root;
    }
  } catch {}
  return _projectRoots;
}

var NOISE_NAMES = ['CLAUDE.md'];

function isFileEntry(filePath) {
  var basename = filePath.split('/').pop();
  return basename.indexOf('.') !== -1;
}

function filterProjectFiles(files, projectNames, verbose) {
  var roots = getProjectRoots();
  var activeRoots = [];
  for (var name of projectNames) {
    if (roots[name]) activeRoots.push(roots[name]);
  }

  return files.filter(function(f) {
    var basename = f.file_path.split('/').pop();
    if (NOISE_NAMES.indexOf(basename) !== -1) return false;
    if (!verbose && !isFileEntry(f.file_path)) return false;
    if (activeRoots.length === 0) return true;
    return activeRoots.some(function(root) {
      return f.file_path.startsWith(root);
    });
  });
}

function main() {
  var args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node search.js "term1,term2" "term3" "term4,term5"');
    console.log('Each argument is a cluster. Terms within a cluster are comma-separated.');
    console.log('Options: --anchor 2026-03-01 (set trust decay anchor)');
    console.log('         --limit 5 (max results, default 10)');
    console.log('         --verbose (show all files including directories)');
    process.exit(0);
  }

  var options = {};
  var clusterArgs = [];
  var verbose = false;

  for (var i = 0; i < args.length; i++) {
    if (args[i] === '--anchor' && args[i + 1]) {
      options.anchorTime = args[++i];
    } else if (args[i] === '--limit' && args[i + 1]) {
      options.limit = parseInt(args[++i], 10);
    } else if (args[i] === '--verbose') {
      verbose = true;
    } else {
      clusterArgs.push(args[i]);
    }
  }

  var clusters = clusterArgs.map(function(arg) {
    return arg.toLowerCase().split(',').map(function(t) { return t.trim(); });
  });

  console.log('CC2 Search');
  console.log('Clusters: ' + clusters.map(function(c) { return '[' + c.join(', ') + ']'; }).join(' + '));
  if (options.anchorTime) console.log('Anchor: ' + options.anchorTime);
  console.log('='.repeat(60));

  var db = new RecallDB(DB_PATH);

  // Auto-backfill FTS5 if empty but window_terms has data (first search after upgrade)
  var ftsCount = db.db.prepare("SELECT COUNT(*) as c FROM window_search").get().c;
  var termsCount = db.db.prepare("SELECT COUNT(DISTINCT window_id) as c FROM window_terms").get().c;
  if (ftsCount === 0 && termsCount > 0) {
    console.log('FTS5 search index empty — rebuilding from existing data...');
    db.rebuildSearchIndex();
    console.log('Rebuilt search index for ' + termsCount + ' windows.\n');
  }

  var results = search(db, clusters, options);

  if (results.length === 0) {
    console.log('\nNo results found.');
  } else {
    for (var r of results) {
      console.log('\n  ' + r.sessionId.slice(0, 8) + '... seq ' + r.seq + ' | score ' + r.score);
      console.log('  Time: ' + r.startTime + ' to ' + r.endTime);

      var win = db.getWindow(r.sessionId, r.seq);
      if (win) {
        var projects = db.getProjects(win.id);
        if (projects.length > 0) {
          console.log('  Projects: ' + projects.map(function(p) { return p.project + ' (' + p.frequency + ')'; }).join(', '));
        }

        var allFiles = db.getFiles(win.id);
        var projectNames = projects.map(function(p) { return p.project; });
        var filtered = filterProjectFiles(allFiles, projectNames, verbose);
        if (filtered.length > 0) {
          var filenames = filtered.map(function(f) {
            var parts = f.file_path.split('/');
            return parts[parts.length - 1];
          });
          var unique = filenames.filter(function(f, i) { return filenames.indexOf(f) === i; });
          console.log('  Files: ' + unique.join(', '));
        }

        var decisions = db.getDecisions(win.id);
        if (decisions.length > 0) {
          console.log('  Decisions:');
          for (var d of decisions) {
            var statusTag = d.status === 'parked' ? ' (parked)' : d.status === 'continued' ? ' (continued)' : '';
            console.log('    ' + d.seq + '. ' + d.summary + statusTag);
          }
        }
      }

      console.log('  Lines: ' + r.startLine + '-' + r.endLine + ' | Focus: ' + r.focusStart + '-' + r.focusEnd);
    }
  }

  console.log('\n' + results.length + ' results');
  db.close();
}

main();
