'use strict';

const path = require('path');
const { loadExtractors } = require('./extractor-registry');

const EXTRACTORS_DIR = path.join(__dirname, '..', 'extractors');
const registry = loadExtractors(EXTRACTORS_DIR);

// Map legacy fileType strings ('js', 'css') to extensions
const LEGACY_TYPE_MAP = { js: '.js', css: '.css', html: '.js' };

/**
 * Resolve a fileType-or-filePath argument to the correct extractor.
 * Accepts: 'js', 'css', 'html' (legacy), or a file path like 'lib/server.js' (new).
 */
function resolveExtractor(fileTypeOrPath) {
  if (!fileTypeOrPath) return registry.byExtension.get('.js') || null;

  // Legacy: bare type string like 'js' or 'css'
  if (LEGACY_TYPE_MAP[fileTypeOrPath]) {
    return registry.byExtension.get(LEGACY_TYPE_MAP[fileTypeOrPath]) || null;
  }

  // New: file path — extract extension
  const ext = path.extname(fileTypeOrPath);
  if (ext) return registry.byExtension.get(ext) || null;

  // Fallback to JS
  return registry.byExtension.get('.js') || null;
}

/**
 * Extract identifiers from a single line of code.
 * Backward-compatible: accepts (line, lineNumber, fileType) where fileType is 'css' or 'js'.
 * New usage: (line, lineNumber, filePath)
 */
function extractIdentifiers(line, lineNumber, fileTypeOrPath) {
  const extractor = resolveExtractor(fileTypeOrPath);
  if (!extractor) return [];
  return extractor.extractIdentifiers(line, lineNumber);
}

/**
 * Extract function/class/CSS definitions from file content.
 * Backward-compatible: accepts (content, fileType) where fileType is 'css' or 'js'.
 * New usage: (content, filePath)
 */
function extractDefinitions(content, fileTypeOrPath) {
  const extractor = resolveExtractor(fileTypeOrPath);
  if (!extractor) return [];
  return extractor.extractDefinitions(content);
}

module.exports = { extractIdentifiers, extractDefinitions, resolveExtractor, registry };
