const readline = require('readline');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

async function scanFile(filePath) {
  const sessionId = path.basename(filePath, '.jsonl');
  const boundaryLines = [];
  let firstTimestamp = null;
  let lastTimestamp = null;
  let lineNum = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) { lineNum++; continue; }
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      lineNum++;
      continue;
    }

    const ts = obj.timestamp;

    if (ts) {
      if (!firstTimestamp) firstTimestamp = ts;
      lastTimestamp = ts;
    }

    if (obj.type === 'system' && obj.subtype === 'compact_boundary' && ts) {
      boundaryLines.push({ line: lineNum, timestamp: ts });
    }

    lineNum++;
  }

  if (!firstTimestamp) return null;

  const totalLines = lineNum;
  const date = firstTimestamp.split('T')[0];
  const windows = [];

  if (boundaryLines.length === 0) {
    windows.push({
      seq: 0,
      startLine: 0,
      endLine: totalLines - 1,
      startTime: firstTimestamp,
      endTime: lastTimestamp,
    });
  } else {
    // First window: start to boundary (inclusive)
    windows.push({
      seq: 0,
      startLine: 0,
      endLine: boundaryLines[0].line,
      startTime: firstTimestamp,
      endTime: boundaryLines[0].timestamp,
    });

    // Middle windows
    for (let i = 0; i < boundaryLines.length - 1; i++) {
      windows.push({
        seq: i + 1,
        startLine: boundaryLines[i].line + 1,
        endLine: boundaryLines[i + 1].line,
        startTime: null,
        endTime: boundaryLines[i + 1].timestamp,
      });
    }

    // Final window: after last boundary to end
    const lastB = boundaryLines[boundaryLines.length - 1];
    windows.push({
      seq: boundaryLines.length,
      startLine: lastB.line + 1,
      endLine: totalLines - 1,
      startTime: null,
      endTime: lastTimestamp,
    });
  }

  // Fill startTime for windows after boundaries — second pass
  if (boundaryLines.length > 0) {
    const needsStart = new Map();
    for (let i = 1; i < windows.length; i++) {
      needsStart.set(windows[i].startLine, i);
    }

    const rl2 = readline.createInterface({
      input: fs.createReadStream(filePath),
      crlfDelay: Infinity,
    });

    let ln = 0;
    const resolved = new Set();
    for await (const line of rl2) {
      if (resolved.size === needsStart.size) break;

      for (const [startLine, wIdx] of needsStart) {
        if (resolved.has(wIdx)) continue;
        if (ln >= startLine) {
          try {
            const obj = JSON.parse(line);
            if (obj.timestamp) {
              windows[wIdx].startTime = obj.timestamp;
              resolved.add(wIdx);
            }
          } catch {}
        }
      }

      ln++;
    }
  }

  return { sessionId, date, windows };
}

async function scanDirectory(dirPath) {
  const entries = await fsp.readdir(dirPath);
  const jsonlFiles = entries.filter(f => f.endsWith('.jsonl'));
  const index = {};

  for (const fname of jsonlFiles) {
    const result = await scanFile(path.join(dirPath, fname));
    if (result) {
      index[result.sessionId] = {
        date: result.date,
        file: fname,
        dir: dirPath,
        windows: result.windows,
      };
    }
  }

  return index;
}

function writeIndex(indexPath, data) {
  fs.writeFileSync(indexPath, JSON.stringify(data, null, 2) + '\n');
}

function readIndex(indexPath) {
  return JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
}

module.exports = { scanFile, scanDirectory, writeIndex, readIndex };
