'use strict';

const WEIGHTS = { edit: 1.0, read: 0.3, reference: 0.5 };
const DECAY_FACTOR = 0.8;
const COLD_THRESHOLD = 1.0;

// Bump a file's heat score and optionally seed summary from DIR data
// Returns { reengaged: true, lastTouchedAt } if file was cold, null otherwise
function bumpFile(db, project, filePath, touchType, sessionId, dirData) {
  const weight = WEIGHTS[touchType] || WEIGHTS.reference;

  // Check current state before bumping
  const existing = db.getFileHeat(project, filePath);
  let reengagement = null;

  if (existing && existing.score < COLD_THRESHOLD && existing.last_touched_at) {
    reengagement = { reengaged: true, lastTouchedAt: existing.last_touched_at };
  }

  db.bumpFileHeat(project, filePath, weight, sessionId);

  // Seed summary from DIR on first touch (when no summary exists yet)
  if (dirData) {
    const row = db.getFileHeat(project, filePath);
    if (!row.summary && dirData.files && dirData.files[filePath]) {
      const purpose = dirData.files[filePath].purpose;
      if (purpose) db.updateSummary(project, filePath, purpose);
    }
  }

  return reengagement;
}

// Decay all scores and detect clusters from session co-occurrence
function decayAndCluster(db, sessionId) {
  db.decayAllScores(DECAY_FACTOR);

  const grouped = getSessionFiles(db, sessionId);
  for (const [project, files] of Object.entries(grouped)) {
    if (files.length >= 2) {
      for (let i = 0; i < files.length; i++) {
        for (let j = i + 1; j < files.length; j++) {
          db.upsertCluster(project, [files[i], files[j]]);
        }
      }
    }
  }
}

// Get files touched in a session, grouped by project
function getSessionFiles(db, sessionId) {
  const rows = db.getAllFilesForSession(sessionId);
  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.project]) grouped[row.project] = [];
    grouped[row.project].push(row.file_path);
  }
  return grouped;
}

module.exports = { bumpFile, decayAndCluster, getSessionFiles, WEIGHTS, DECAY_FACTOR, COLD_THRESHOLD };
