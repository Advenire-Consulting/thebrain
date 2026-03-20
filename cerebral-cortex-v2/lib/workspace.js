'use strict';

const path = require('path');
const { loadConfig } = require('../../lib/config');

// Workspace roots for path normalization — cached per process
let _workspaceRoots = null;
function getWorkspaceRoots() {
  if (_workspaceRoots) return _workspaceRoots;
  const config = loadConfig();
  _workspaceRoots = config.workspaces.map(w => {
    const p = path.resolve(w.path);
    return p.endsWith('/') ? p : p + '/';
  });
  return _workspaceRoots;
}

// Project roots from hippocampus DIR files — cached per process
let _projectRoots = null;
function getProjectRoots() {
  if (_projectRoots) return _projectRoots;
  try {
    const { loadAllDIR } = require(path.join(__dirname, '..', '..', 'hippocampus', 'lib', 'dir-loader'));
    _projectRoots = loadAllDIR().map(d => ({ name: d.name, root: d.root }));
  } catch {
    _projectRoots = [];
  }
  return _projectRoots;
}

module.exports = { getWorkspaceRoots, getProjectRoots };
