'use strict';

const path = require('path');
const { getBlastRadius } = require('../../hippocampus/lib/dir-loader');

const SENSITIVE_EXTENSIONS = new Set(['.db', '.sqlite', '.sqlite3', '.env', '.pem', '.key', '.cert']);
const SENSITIVE_FILENAMES = new Set(['.env', '.env.local', '.env.production', 'credentials.json', 'secrets.json']);

function classifyPath(absPath, dirs, websitesRoot, config) {
  config = config || {};
  const whitelisted = config.whitelisted_paths || [];
  const overrides = config.sensitivity_overrides || {};

  if (whitelisted.some(w => absPath === w || absPath.startsWith(w + '/'))) {
    return { level: 'GREEN', reason: 'Whitelisted path', project: null, tables: null, suggestion: null };
  }

  const relativePath = path.relative(websitesRoot, absPath);

  if (relativePath.startsWith('..')) {
    return { level: 'UNKNOWN', reason: `Targets a location outside known projects: ${absPath}`, project: null, tables: null, suggestion: null };
  }

  let matchedDir = null;
  let projectRelative = null;

  for (const dir of dirs) {
    const rootNormalized = dir.root.replace(/\/$/, '');
    if (relativePath === rootNormalized || relativePath.startsWith(dir.root)) {
      matchedDir = dir;
      if (relativePath === rootNormalized) {
        projectRelative = null;
      } else {
        projectRelative = relativePath.slice(dir.root.length);
      }
      break;
    }
  }

  if (!matchedDir) {
    return { level: 'UNKNOWN', reason: `Path is within workspace but not mapped to any known project: ${relativePath}`, project: null, tables: null, suggestion: null };
  }

  const projectName = matchedDir.name;

  if (projectRelative === null || projectRelative === '') {
    return { level: 'RED', reason: `Targets project root of ${projectName}`, project: projectName, tables: null, suggestion: 'Archive to marked-for-deletion/ instead? The folder can be restored later.' };
  }

  const ext = path.extname(projectRelative);
  const basename = path.basename(projectRelative);

  const overrideKey = matchedDir.root + projectRelative;
  if (overrides[overrideKey] === 'code') {
    return classifyAsCode(projectRelative, matchedDir, dirs, projectName);
  }

  if (ext === '.db' || ext === '.sqlite' || ext === '.sqlite3') {
    const tables = findTablesForDb(basename, matchedDir);
    const tableList = tables.length > 0 ? ` Contains tables: ${tables.join(', ')}.` : '';
    return { level: 'RED', reason: `Targets database file in ${projectName}.${tableList}`, project: projectName, tables: tables.length > 0 ? tables : null, suggestion: `Archive to marked-for-deletion/${basename} instead? Database files contain irreplaceable data.` };
  }

  if (SENSITIVE_FILENAMES.has(basename) || (SENSITIVE_EXTENSIONS.has(ext) && ext !== '.db' && ext !== '.sqlite' && ext !== '.sqlite3')) {
    return { level: 'RED', reason: `Targets sensitive file (${basename}) in ${projectName}`, project: projectName, tables: null, suggestion: 'Archive to marked-for-deletion/ instead? Sensitive files may contain credentials.' };
  }

  return classifyAsCode(projectRelative, matchedDir, dirs, projectName);
}

function classifyAsCode(projectRelative, matchedDir, dirs, projectName) {
  const blastRadius = getBlastRadius(dirs, projectRelative, projectName);
  const importedByCount = blastRadius.importedBy.length;

  if (importedByCount >= 1) {
    return { level: 'YELLOW', reason: `${path.basename(projectRelative)} has ${importedByCount} dependent(s) in ${projectName}`, project: projectName, tables: null, suggestion: null };
  }

  return { level: 'GREEN', reason: 'Known file, no dependents', project: projectName, tables: null, suggestion: null };
}

function findTablesForDb(dbFilename, dir) {
  if (!dir.schemas) return [];
  const schema = dir.schemas[dbFilename];
  if (!schema || !schema.tables) return [];
  return Object.keys(schema.tables);
}

module.exports = { classifyPath, findTablesForDb };
