'use strict';

const fs = require('fs');

const HOT_THRESHOLD = 2.0;
const WARM_THRESHOLD = 1.0;
const FILE_CAP = 15;
const CLUSTER_CAP = 3;
const CLUSTER_MIN_COUNT = 3;

// Generate the compact markdown output from working memory DB
function generate(db) {
  const projects = db.getActiveProjects(WARM_THRESHOLD);
  if (projects.length === 0) return '';

  const sections = [];

  for (const project of projects) {
    const files = db.getHotFiles(project, WARM_THRESHOLD, FILE_CAP);
    if (files.length === 0) continue;

    const lines = [`## Working Memory — ${project}`];

    for (const f of files) {
      const scoreStr = f.score.toFixed(1);
      const summaryPart = f.summary ? ` — ${f.summary}` : '';
      lines.push(`${f.file_path} [${scoreStr}]${summaryPart}`);

      // Hot files get context_note, warm files don't
      if (f.score > HOT_THRESHOLD && f.context_note) {
        lines.push(`  > ${f.context_note}`);
      }
    }

    // Append clusters with 3+ co-occurrences
    const clusters = db.getClusters(project, CLUSTER_CAP);
    const significantClusters = clusters.filter(c => c.co_occurrence_count >= CLUSTER_MIN_COUNT);
    if (significantClusters.length > 0) {
      const clusterStrs = significantClusters.map(c => {
        const paths = JSON.parse(c.file_paths);
        return `{${paths.join(', ')}}`;
      });
      lines.push(`  clusters: ${clusterStrs.join(' ')}`);
    }

    sections.push(lines.join('\n'));
  }

  return sections.join('\n\n');
}

// Write generated output to file, or delete if empty
function writeToFile(db, outputPath) {
  const content = generate(db);
  if (content) {
    fs.writeFileSync(outputPath, content + '\n');
  } else {
    try { fs.unlinkSync(outputPath); } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }
}

module.exports = { generate, writeToFile, HOT_THRESHOLD, WARM_THRESHOLD, FILE_CAP, CLUSTER_CAP };
