const fs = require('fs');
const path = require('path');
const { RecallDB, DEFAULT_RECALL_DB_PATH } = require('../lib/db');

const KEEP_RECENT = 3;
const os = require('os');
const PFC_PATH = path.join(os.homedir(), '.claude', 'brain', 'prefrontal-cortex.md');
const DB_PATH = DEFAULT_RECALL_DB_PATH;

// Parse date+time from PFC entry header. Supports both formats:
//   ## YYYY-MM-DD HH:MM — scope [session_id]   (new)
//   ## HH:MM — scope [session_id]               (legacy, assumes today)
function parseEntryTimestamp(headerLine) {
  var dateMatch = headerLine.match(/^## (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) — /);
  if (dateMatch) {
    return { date: dateMatch[1], time: dateMatch[2], sortKey: dateMatch[1] + ' ' + dateMatch[2] };
  }
  var timeMatch = headerLine.match(/^## (\d{2}:\d{2}) — /);
  if (timeMatch) {
    // Legacy format — no date, sort after dated entries with same time
    return { date: null, time: timeMatch[1], sortKey: '0000-00-00 ' + timeMatch[1] };
  }
  return null;
}

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
    if (s.match(/^## (?:\d{4}-\d{2}-\d{2} )?\d{2}:\d{2} — /)) {
      sessionEntries.push(s);
    } else {
      otherSections.push(s);
    }
  }

  // Sort chronologically — oldest first, newest last
  sessionEntries.sort(function(a, b) {
    var tsA = parseEntryTimestamp(a);
    var tsB = parseEntryTimestamp(b);
    if (!tsA || !tsB) return 0;
    return tsA.sortKey < tsB.sortKey ? -1 : tsA.sortKey > tsB.sortKey ? 1 : 0;
  });

  if (sessionEntries.length <= KEEP_RECENT) {
    console.log('PFC has ' + sessionEntries.length + ' entries (keeping ' + KEEP_RECENT + '). Nothing to trim.');
    return;
  }

  // Migrate overflow entries to CC2 recall.db
  var toMigrate = sessionEntries.slice(0, sessionEntries.length - KEEP_RECENT);
  // Supports both date-prefixed and legacy formats
  var pfcRegex = /^## (?:(\d{4}-\d{2}-\d{2}) )?(\d{2}:\d{2}) — (.+?)(?:\s+\[([a-f0-9]+)\])?\nFiles: (.+)\nSummary: (.+)(?:\nNext: (.+))?/;

  try {
    if (fs.existsSync(DB_PATH)) {
      var cc2 = new RecallDB(DB_PATH);
      var migrated = 0;

      for (var entry of toMigrate) {
        var match = entry.match(pfcRegex);
        if (!match) continue;

        var date = match[1]; // may be undefined for legacy entries
        var hhmm = match[2];
        var scope = match[3];
        var sessionIdPrefix = match[4];
        var files = match[5];
        var summary = match[6];
        var next = match[7];

        if (!sessionIdPrefix) continue;

        var win = cc2.findWindowBySessionAndTime(sessionIdPrefix, hhmm, date);
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

  // Trim PFC to recent entries (already sorted chronologically, keep newest)
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
