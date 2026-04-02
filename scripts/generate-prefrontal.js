#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { BRAIN_DIR, getDbPath } = require('./lessons');

const LINE_CAP = 120;
const TIER_RULE = 75;
const TIER_INCLINATION = 50;
const TIER_ALWAYS_ON = 75;
const TIER_PLANNING = 50;

function getOutputPath() {
  return process.env.THEBRAIN_PFC_OUTPUT || path.join(BRAIN_DIR, 'prefrontal-live.md');
}

// Format a lesson for prefrontal output — title + summary only (not full entry_text)
function formatLesson(title, summary, polarity, weight) {
  const pol = polarity === 'positive' ? '(+)' : polarity === 'negative' ? '(-)' : '';
  const text = summary || title;
  return `- \`${weight}\` ${pol} **${title}** — ${text}`;
}

function getLessonsByTier(db, minWeight, maxWeight) {
  const query = maxWeight
    ? "SELECT title, summary, polarity, confirmation_count FROM lessons WHERE status = 'active' AND confirmation_count >= ? AND confirmation_count < ? ORDER BY confirmation_count DESC"
    : "SELECT title, summary, polarity, confirmation_count FROM lessons WHERE status = 'active' AND confirmation_count >= ? ORDER BY confirmation_count DESC";
  const params = maxWeight ? [minWeight, maxWeight] : [minWeight];
  return db.prepare(query).all(...params).map(r =>
    formatLesson(r.title, r.summary, r.polarity, r.confirmation_count)
  );
}

// Format forces using summary (falls back to description if no summary)
function getForcesByTier(db, minScore, maxScore) {
  const query = maxScore
    ? "SELECT title, summary, description, score FROM forces WHERE status = 'active' AND force_type = 'force' AND score >= ? AND score < ? ORDER BY score DESC"
    : "SELECT title, summary, description, score FROM forces WHERE status = 'active' AND force_type = 'force' AND score >= ? ORDER BY score DESC";
  const params = maxScore ? [minScore, maxScore] : [minScore];
  return db.prepare(query).all(...params).map(r =>
    `- \`${r.score}\` **${r.title}** — ${r.summary || r.description}`
  );
}

function generate() {
  const sections = [];
  const outputPath = getOutputPath();

  sections.push('# Prefrontal — Executive Function\n');
  sections.push('*Generated from signals.db. Do not edit manually.*\n');

  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    sections.push('*No signals.db found. Run setup to populate.*\n');
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(outputPath, sections.join('\n') + '\n');
    console.log(`Generated ${outputPath} (stub — no data)`);
    return;
  }

  const db = new Database(dbPath, { readonly: true });
  db.pragma('journal_mode = WAL');

  const rules = getLessonsByTier(db, TIER_RULE);
  if (rules.length > 0) {
    sections.push('## Behavioral Rules (75+)\n');
    sections.push(...rules);
    sections.push('');
  }

  const inclinations = getLessonsByTier(db, TIER_INCLINATION, TIER_RULE);
  if (inclinations.length > 0) {
    sections.push('## Inclinations (50-74) — Strong defaults. Question if context demands it.\n');
    sections.push(...inclinations);
    sections.push('');
  }

  const forces = getForcesByTier(db, TIER_ALWAYS_ON);
  if (forces.length > 0) {
    sections.push('## Relational Forces — Always-on (75+)\n');
    sections.push(...forces);
    sections.push('');
  }

  const planningForces = getForcesByTier(db, TIER_PLANNING, TIER_ALWAYS_ON);
  if (planningForces.length > 0) {
    sections.push('## Relational Forces — Planning-mode (50-74)\n');
    sections.push(...planningForces);
    sections.push('');
  }

  db.close();

  let output = sections.join('\n');
  const lines = output.split('\n');

  if (lines.length > LINE_CAP) {
    const capped = lines.slice(0, LINE_CAP);
    capped.push(`\n*[Truncated at ${LINE_CAP} lines — raise LINE_CAP or reduce sources]*`);
    output = capped.join('\n');
  }

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(outputPath, output + '\n');
  console.log(`Generated ${outputPath} (${lines.length} lines)`);
}

if (require.main === module) {
  generate();
}

module.exports = { generate };
