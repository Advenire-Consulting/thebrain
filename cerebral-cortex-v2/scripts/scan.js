const fs = require('fs');
const path = require('path');
const { scanDirectory, readIndex, writeIndex } = require('../lib/scanner');
const { DEFAULT_WINDOWS_PATH } = require('../lib/db');
const { loadConfig } = require('../../lib/config');

async function main() {
  const config = loadConfig();
  const INDEX_PATH = DEFAULT_WINDOWS_PATH;

  console.log('Cerebral Cortex v2 — Window Scanner');
  console.log('====================================\n');

  if (config.conversationDirs.length === 0) {
    console.error('No conversation directories configured. Run setup or edit ~/.claude/brain/config.json');
    process.exit(1);
  }

  // Load existing index for incremental scanning
  let existingIndex = {};
  if (fs.existsSync(INDEX_PATH)) {
    try { existingIndex = readIndex(INDEX_PATH); } catch { /* rebuild from scratch */ }
  }

  const fullIndex = {};
  let totalSkipped = 0;

  for (const dir of config.conversationDirs) {
    const resolved = dir.replace(/^~/, require('os').homedir());
    console.log(`Scanning: ${resolved}`);
    try {
      const { index, skipped } = await scanDirectory(resolved, existingIndex);
      const count = Object.keys(index).length;
      const windowCount = Object.values(index).reduce((sum, s) => sum + s.windows.length, 0);
      const parsed = count - skipped;
      console.log(`  ${count} sessions, ${windowCount} windows (${parsed} parsed, ${skipped} unchanged)\n`);
      totalSkipped += skipped;
      Object.assign(fullIndex, index);
    } catch (err) {
      console.log(`  Error: ${err.message}\n`);
    }
  }

  writeIndex(INDEX_PATH, fullIndex);

  const sessions = Object.keys(fullIndex).length;
  const windows = Object.values(fullIndex).reduce((sum, s) => sum + s.windows.length, 0);
  const withCompact = Object.values(fullIndex).filter(s => s.windows.length > 1).length;

  console.log('--- Summary ---');
  console.log(`Sessions:      ${sessions}`);
  console.log(`Windows:       ${windows}`);
  console.log(`Multi-window:  ${withCompact} sessions`);
  console.log(`Single-window: ${sessions - withCompact} sessions`);
  console.log(`Skipped:       ${totalSkipped} (unchanged since last scan)`);
  console.log(`Index:         ${INDEX_PATH}`);
  console.log(`Size:          ${Math.round(JSON.stringify(fullIndex).length / 1024)}KB`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
