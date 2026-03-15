'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { loadExtractors } = require('./extractor-registry');
const { collectCodeFiles } = require('./file-collector');

const EXTRACTORS_DIR = path.join(__dirname, '..', 'extractors');
const registry = loadExtractors(EXTRACTORS_DIR);

function hashContent(content) {
  return crypto.createHash('sha1').update(content).digest('hex');
}

/**
 * Scan a single file: extract identifiers + definitions, store in DB.
 */
function scanSingleFile(db, absolutePath, relativePath, project, content, stat) {
  const hash = hashContent(content);
  const fileId = db.upsertFile(project, relativePath, absolutePath, {
    size: stat.size,
    mtime: stat.mtimeMs,
    hash,
  });

  const ext = path.extname(relativePath);
  const extractor = registry.byExtension.get(ext);

  if (extractor) {
    const lines = content.split('\n');
    const allOccurrences = [];
    for (let i = 0; i < lines.length; i++) {
      const idents = extractor.extractIdentifiers(lines[i], i + 1);
      allOccurrences.push(...idents);
    }
    db.replaceOccurrences(fileId, allOccurrences);
    db.replaceDefinitions(fileId, extractor.extractDefinitions(content));
  }

  return { hash, fileId };
}

/**
 * Check if a file needs scanning based on stored metadata.
 */
function checkNeedsScan(absolutePath, storedMeta) {
  let stat;
  try { stat = fs.statSync(absolutePath); }
  catch { return { deleted: true }; }

  if (!storedMeta) {
    return { needsScan: true, content: fs.readFileSync(absolutePath, 'utf-8'), stat };
  }

  if (stat.size !== storedMeta.size) {
    return { needsScan: true, content: fs.readFileSync(absolutePath, 'utf-8'), stat };
  }

  if (stat.mtimeMs === storedMeta.mtime) {
    return { needsScan: false };
  }

  const content = fs.readFileSync(absolutePath, 'utf-8');
  const hash = hashContent(content);
  if (hash === storedMeta.hash) {
    return { updateMtimeOnly: true, stat };
  }

  return { needsScan: true, content, stat };
}

/**
 * Scan a project directory incrementally.
 */
function termScanProject(db, projectDir, projectName) {
  const files = collectCodeFiles(projectDir, registry.allExtensions);
  let scanned = 0, skipped = 0, removed = 0;
  const onDiskPaths = new Set();

  for (const file of files) {
    onDiskPaths.add(file.relative);
    const storedMeta = db.getFileMeta(projectName, file.relative);
    const check = checkNeedsScan(file.absolute, storedMeta);

    if (check.deleted) continue;

    if (check.needsScan) {
      scanSingleFile(db, file.absolute, file.relative, projectName, check.content, check.stat);
      scanned++;
    } else if (check.updateMtimeOnly) {
      db.updateMtime(projectName, file.relative, check.stat.mtimeMs);
      skipped++;
    } else {
      skipped++;
    }
  }

  const storedFiles = db.getProjectFiles(projectName);
  for (const stored of storedFiles) {
    if (!onDiskPaths.has(stored.path)) {
      db.removeFile(stored.id);
      removed++;
    }
  }

  return { scanned, skipped, removed };
}

module.exports = { termScanProject, scanSingleFile, collectCodeFiles, checkNeedsScan, hashContent };
