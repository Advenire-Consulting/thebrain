'use strict';

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Check if a directory is inside a git repo
function isGitRepo(dir) {
  try {
    execFileSync('git', ['-C', dir, 'rev-parse', '--is-inside-work-tree'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 3000
    });
    return true;
  } catch {
    return false;
  }
}

// Get git changes for a file since a given timestamp
// Returns a formatted string or null if no changes / not a git repo
function checkGitChanges(projectRoot, filePath, sinceTimestamp) {
  try {
    if (!isGitRepo(projectRoot)) return null;

    const output = execFileSync('git', [
      '-C', projectRoot,
      'log', '--oneline',
      '--since=' + sinceTimestamp,
      '--', filePath
    ], {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000
    }).trim();

    if (!output) return null;

    const lines = output.split('\n');
    if (lines.length === 1) {
      return lines[0];
    }
    return lines.length + ' commits: ' + lines[0] + ' ... ' + lines[lines.length - 1];
  } catch {
    return null;
  }
}

// File-based session dedup — one state file per session
// Returns true if this file has already been briefed this session
function hasBeenBriefed(sessionId, project, filePath) {
  const stateFile = path.join(os.homedir(), '.claude', 'git_briefing_state_' + sessionId + '.json');
  let state = [];
  try { state = JSON.parse(fs.readFileSync(stateFile, 'utf-8')); } catch {}

  const key = project + ':' + filePath;
  if (state.includes(key)) return true;

  state.push(key);
  const tmpPath = stateFile + '.tmp.' + process.pid;
  fs.writeFileSync(tmpPath, JSON.stringify(state), { mode: 0o600 });
  fs.renameSync(tmpPath, stateFile);
  return false;
}

module.exports = { checkGitChanges, isGitRepo, hasBeenBriefed };
