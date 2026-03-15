const fs = require('fs');
const path = require('path');
const { RecallDB, DEFAULT_RECALL_DB_PATH } = require('../lib/db');

const KEEP_RECENT = 3;
const os = require('os');
const PFC_PATH = path.join(os.homedir(), '.claude', 'brain', 'prefrontal-cortex.md');
const DB_PATH = DEFAULT_RECALL_DB_PATH;

function main() {
  if (!fs.existsSync(PFC_PATH)) {
    console.log('No prefrontal-cortex.md found.');
    return;
  }

  const content = fs.readFileSync(PFC_PATH, 'utf-8');
  const sections = content.split(/^(?=## )/m);
  var sessionEntries = [];
  var otherSections = [];

  for (var s of sections) {
    if (s.match(/^## \d{2}:\d{2} — /)) {
      sessionEntries.push(s);
    } else {
      otherSections.push(s);
    }
  }

  if (sessionEntries.length <= KEEP_RECENT) {
    console.log('PFC has ' + sessionEntries.length + ' entries (keeping ' + KEEP_RECENT + '). Nothing to trim.');
    return;
  }

  // Migrate overflow entries to CC2 recall.db
  var toMigrate = sessionEntries.slice(0, sessionEntries.length - KEEP_RECENT);
  var pfcRegex = /^## (\d{2}:\d{2}) — (.+?)(?:\s+\[([a-f0-9]+)\])?\nFiles: (.+)\nSummary: (.+)(?:\nNext: (.+))?/;

  try {
    if (fs.existsSync(DB_PATH)) {
      var cc2 = new RecallDB(DB_PATH);
      var migrated = 0;

      for (var entry of toMigrate) {
        var match = entry.match(pfcRegex);
        if (!match) continue;

        var hhmm = match[1];
        var scope = match[2];
        var sessionIdPrefix = match[3];
        var files = match[4];
        var summary = match[5];
        var next = match[6];

        if (!sessionIdPrefix) continue;

        var win = cc2.findWindowBySessionAndTime(sessionIdPrefix, hhmm);
        if (win && !cc2.getSummary(win.id)) {
          cc2.insertSummary(win.id, { scope: scope, summary: summary, files: files, next: next });
          migrated++;
        }
      }

      cc2.close();
      if (migrated > 0) console.log('Migrated ' + migrated + ' PFC entries to CC2 recall.db.');
    }
  } catch (err) {
    console.log('CC2 migration warning: ' + err.message);
  }

  // Trim PFC to recent entries
  var recentEntries = sessionEntries.slice(-KEEP_RECENT);
  var header = otherSections.filter(function(s) { return s.startsWith('# '); });
  var pendingForks = otherSections.filter(function(s) { return s.startsWith('## Pending Forks'); });
  var kept = [].concat(header, recentEntries, pendingForks);
  var trimmed = kept.join('').trimEnd() + '\n';

  if (trimmed !== content) {
    fs.writeFileSync(PFC_PATH, trimmed);
    var removed = sessionEntries.length - recentEntries.length;
    if (removed > 0) console.log('Cleared ' + removed + ' consumed PFC entries (kept ' + recentEntries.length + ' recent).');
  }
}

main();
