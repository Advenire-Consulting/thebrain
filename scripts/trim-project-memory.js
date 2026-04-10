#!/usr/bin/env node
'use strict';

// Trims dated log sections from a project memory file, moving old entries
// to a sibling <project>-history.md. Sections are identified by having a
// (YYYY-MM-DD) date pattern in their ### header. Sections without dates
// (architecture, commands, reference material) are always kept.

const fs = require('fs');
const path = require('path');

const MAX_AGE_DAYS = 14;
const DATE_PATTERN = /\((\d{4}-\d{2}-\d{2})\)/;

function parseIntoSections(content) {
  // Split file into sections by ## or ### headers
  const lines = content.split('\n');
  const sections = [];
  let current = { header: null, level: 0, lines: [] };

  for (const line of lines) {
    const headerMatch = line.match(/^(#{2,3})\s+(.+)/);
    if (headerMatch) {
      // Save previous section
      if (current.header !== null || current.lines.length > 0) {
        sections.push(current);
      }
      current = { header: line, level: headerMatch[1].length, headerText: headerMatch[2], lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  // Save last section
  if (current.header !== null || current.lines.length > 0) {
    sections.push(current);
  }

  return sections;
}

function sectionToString(section) {
  // Reconstruct a section as text
  const parts = [];
  if (section.header) parts.push(section.header);
  parts.push(...section.lines);
  return parts.join('\n');
}

// Trim a single project memory file — returns count of archived sections
function trimFile(filePath, maxAge) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const sections = parseIntoSections(content);

  const now = new Date();
  const cutoff = new Date(now.getTime() - maxAge * 86400000);

  const keep = [];
  const archive = [];

  for (const section of sections) {
    if (!section.header) {
      // Preamble or content before first header — always keep
      keep.push(section);
      continue;
    }

    const dateMatch = section.headerText && section.headerText.match(DATE_PATTERN);
    if (!dateMatch) {
      // No date in header — reference section, always keep
      keep.push(section);
      continue;
    }

    const sectionDate = new Date(dateMatch[1] + 'T00:00:00');
    if (sectionDate < cutoff) {
      archive.push(section);
    } else {
      keep.push(section);
    }
  }

  if (archive.length === 0) return 0;

  // Build history file path as sibling
  const dir = path.dirname(filePath);
  const stem = path.basename(filePath, '.md');
  const historyPath = path.join(dir, `${stem}-history.md`);

  // Append archived sections to history file
  let historyContent = '';
  if (fs.existsSync(historyPath)) {
    historyContent = fs.readFileSync(historyPath, 'utf-8');
  } else {
    historyContent = `# ${stem} — Archived History\n\nDated log sections trimmed from ${path.basename(filePath)}.\nSearchable via hippocampus grep.\n`;
  }

  for (const section of archive) {
    historyContent += '\n' + sectionToString(section);
  }

  if (!historyContent.endsWith('\n')) historyContent += '\n';
  fs.writeFileSync(historyPath, historyContent);

  // Rewrite main file with only kept sections
  let result = '';
  for (let i = 0; i < keep.length; i++) {
    result += sectionToString(keep[i]);
    if (i < keep.length - 1 && !sectionToString(keep[i]).endsWith('\n')) {
      result += '\n';
    }
  }

  if (!result.endsWith('\n')) result += '\n';
  fs.writeFileSync(filePath, result);

  return archive.length;
}

function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: trim-project-memory.js <file.md | directory/> [--max-age N]');
    process.exit(1);
  }

  // Parse optional --max-age flag
  let maxAge = MAX_AGE_DAYS;
  const ageIdx = process.argv.indexOf('--max-age');
  if (ageIdx !== -1 && process.argv[ageIdx + 1]) {
    maxAge = parseInt(process.argv[ageIdx + 1], 10);
    if (isNaN(maxAge) || maxAge < 1) {
      console.error('--max-age must be a positive integer');
      process.exit(1);
    }
  }

  if (!fs.existsSync(target)) {
    console.error(`Not found: ${target}`);
    process.exit(1);
  }

  const stat = fs.statSync(target);

  if (stat.isFile()) {
    // Single file mode
    const count = trimFile(target, maxAge);
    if (count === 0) {
      console.log(`  ${path.basename(target)}: nothing to trim`);
    } else {
      const stem = path.basename(target, '.md');
      console.log(`  ${path.basename(target)}: trimmed ${count} sections (>${maxAge} days) → ${stem}-history.md`);
    }
  } else if (stat.isDirectory()) {
    // Directory mode — process all .md files, skip *-history.md
    const files = fs.readdirSync(target).filter(f =>
      f.endsWith('.md') && !f.endsWith('-history.md')
    );
    let totalTrimmed = 0;
    for (const f of files) {
      const filePath = path.join(target, f);
      const count = trimFile(filePath, maxAge);
      if (count > 0) {
        const stem = path.basename(f, '.md');
        console.log(`  ${f}: trimmed ${count} sections (>${maxAge} days) → ${stem}-history.md`);
        totalTrimmed += count;
      }
    }
    if (totalTrimmed === 0) {
      console.log('  Nothing to trim across all project files.');
    }
  }
}

main();
