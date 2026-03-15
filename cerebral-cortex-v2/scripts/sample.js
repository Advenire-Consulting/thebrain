const path = require('path');
const { readIndex } = require('../lib/scanner');
const { extractWindow } = require('../lib/extractor');

const { DEFAULT_WINDOWS_PATH } = require('../lib/db');
const INDEX_PATH = DEFAULT_WINDOWS_PATH;
const FILTERS = ['light', 'medium', 'heavy'];

async function main() {
  const sampleCount = parseInt(process.argv[2] || '3', 10);
  const index = readIndex(INDEX_PATH);

  const allWindows = [];
  for (const [sessionId, session] of Object.entries(index)) {
    for (const win of session.windows) {
      allWindows.push({ sessionId, ...session, ...win, lineCount: win.endLine - win.startLine + 1 });
    }
  }
  allWindows.sort((a, b) => a.lineCount - b.lineCount);

  const picks = [
    allWindows[Math.floor(allWindows.length * 0.25)],
    allWindows[Math.floor(allWindows.length * 0.5)],
    allWindows[Math.floor(allWindows.length * 0.75)],
  ].slice(0, sampleCount);

  for (const win of picks) {
    const filePath = path.join(win.dir, win.file);
    console.log('\n' + '='.repeat(80));
    console.log('Session: ' + win.sessionId.slice(0, 8) + '... | Window seq ' + win.seq + ' | Lines ' + win.startLine + '-' + win.endLine + ' (' + win.lineCount + ' lines)');
    console.log('Time: ' + win.startTime + ' to ' + win.endTime);
    console.log('='.repeat(80));

    for (const level of FILTERS) {
      const result = await extractWindow(filePath, win.startLine, win.endLine, level);

      const userCount = Object.keys(result.userTerms).length;
      const assistantCount = Object.keys(result.assistantTerms).length;
      const fileCount = result.files.length;
      const projectList = Object.entries(result.projects).sort((a, b) => b[1] - a[1]);

      console.log('\n--- ' + level.toUpperCase() + ' ---');
      console.log('User terms: ' + userCount + ' | Assistant terms: ' + assistantCount + ' | Files: ' + fileCount);
      console.log('Projects: ' + (projectList.map(function(p) { return p[0] + '(' + p[1] + ')'; }).join(', ') || 'none'));

      const topUser = Object.entries(result.userTerms)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 15);
      console.log('Top user:      ' + topUser.map(function(e) { return e[0] + '(' + e[1].count + ')'; }).join(', '));

      const topAssistant = Object.entries(result.assistantTerms)
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 15);
      console.log('Top assistant: ' + topAssistant.map(function(e) { return e[0] + '(' + e[1].count + ')'; }).join(', '));
    }
  }
}

main().catch(function(err) {
  console.error('Fatal:', err.message);
  process.exit(1);
});
