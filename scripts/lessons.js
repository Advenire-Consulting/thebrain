'use strict';

const path = require('path');
const fs = require('fs');
const os = require('os');
const Database = require('better-sqlite3');

// --- Constants ---

const BRAIN_DIR = path.join(os.homedir(), '.claude', 'brain');
const DEFAULT_DB_PATH = path.join(BRAIN_DIR, 'signals.db');

const WEIGHT_CAP = 100;
const DOPAMINE_INCREMENT = 50;
const TIER_RULE = 75;
const TIER_INCLINATION = 50;
const TIER_AWARENESS = 25;

function getDbPath() {
  return process.env.THEBRAIN_SIGNALS_DB || DEFAULT_DB_PATH;
}

function tierLabel(weight) {
  if (weight >= TIER_RULE) return 'Rule';
  if (weight >= TIER_INCLINATION) return 'Inclination';
  if (weight >= TIER_AWARENESS) return 'Awareness';
  return 'Data';
}

function openDb(dbPath) {
  const resolved = dbPath || getDbPath();
  const dir = path.dirname(resolved);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const db = new Database(resolved);
  db.pragma('journal_mode = WAL');
  return db;
}

function ensureSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      signal_type TEXT,
      signal_word TEXT,
      message_index INTEGER,
      user_text TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      brain_file TEXT NOT NULL,
      domain TEXT NOT NULL,
      title TEXT NOT NULL,
      entry_text TEXT NOT NULL,
      polarity TEXT DEFAULT 'negative',
      correction_text TEXT,
      confirmation_count INTEGER DEFAULT 0,
      initial_weight INTEGER DEFAULT 50,
      first_confirmed TEXT,
      last_confirmed TEXT,
      status TEXT DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS correction_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      mapped_rule TEXT
    );

    CREATE TABLE IF NOT EXISTS lesson_categories (
      lesson_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      PRIMARY KEY (lesson_id, category_id),
      FOREIGN KEY (lesson_id) REFERENCES lessons(id),
      FOREIGN KEY (category_id) REFERENCES correction_categories(id)
    );

    CREATE TABLE IF NOT EXISTS forces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      force_type TEXT NOT NULL DEFAULT 'force',
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      connections TEXT,
      score INTEGER DEFAULT 50,
      first_observed TEXT,
      last_reinforced TEXT,
      status TEXT DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    INSERT OR IGNORE INTO meta (key, value) VALUES ('schema_version', '1');
  `);
}

function insertLesson(db, brainFile, domain, title, entryText, severity, weightOverride) {
  severity = severity || 'moderate';
  const now = new Date().toISOString();

  const existing = db.prepare(`
    SELECT id, confirmation_count FROM lessons
    WHERE brain_file = ? AND domain = ? AND title = ? AND status = 'active'
  `).get(brainFile, domain, title);

  let action, lessonId, newCount;

  if (existing) {
    lessonId = existing.id;
    if (weightOverride != null) {
      newCount = Math.min(weightOverride, WEIGHT_CAP);
    } else {
      newCount = Math.min(existing.confirmation_count + DOPAMINE_INCREMENT, WEIGHT_CAP);
    }
    db.prepare(`
      UPDATE lessons SET confirmation_count = ?, last_confirmed = ? WHERE id = ?
    `).run(newCount, now, lessonId);
    action = 'reinforced';
  } else {
    if (weightOverride != null) {
      newCount = Math.min(weightOverride, WEIGHT_CAP);
    } else {
      newCount = Math.min(DOPAMINE_INCREMENT, WEIGHT_CAP);
    }
    const result = db.prepare(`
      INSERT INTO lessons (brain_file, domain, title, entry_text,
                           confirmation_count, first_confirmed, last_confirmed)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(brainFile, domain, title, entryText, newCount, now, now);
    lessonId = result.lastInsertRowid;
    action = 'created';
  }

  db.prepare(`
    INSERT INTO signals (session_id, signal_type, signal_word, message_index, user_text)
    VALUES ('dopamine', 'dopamine', ?, 0, ?)
  `).run(severity, entryText);

  return {
    action,
    lesson_id: lessonId,
    brain_file: brainFile,
    domain,
    title,
    confirmation_count: newCount,
    tier: tierLabel(newCount),
  };
}

function surfaceLessons(db, { brainFilter, domainFilter, limit, categoryFilter, ruleFilter, showAll } = {}) {
  let query, params;

  if (ruleFilter) {
    query = `
      SELECT DISTINCT l.brain_file, l.domain, l.title, l.entry_text,
             l.polarity, l.correction_text, l.confirmation_count, l.initial_weight, l.last_confirmed
      FROM lessons l
      JOIN lesson_categories lc ON l.id = lc.lesson_id
      JOIN correction_categories cc ON lc.category_id = cc.id
      WHERE cc.mapped_rule = ? AND l.status = 'active'
      ORDER BY l.confirmation_count DESC
    `;
    params = [ruleFilter];
  } else if (categoryFilter) {
    query = `
      SELECT DISTINCT l.brain_file, l.domain, l.title, l.entry_text,
             l.polarity, l.correction_text, l.confirmation_count, l.initial_weight, l.last_confirmed
      FROM lessons l
      JOIN lesson_categories lc ON l.id = lc.lesson_id
      JOIN correction_categories cc ON lc.category_id = cc.id
      WHERE cc.name = ? AND l.status = 'active'
      ORDER BY l.confirmation_count DESC
    `;
    params = [categoryFilter];
  } else {
    query = `
      SELECT brain_file, domain, title, entry_text,
             polarity, correction_text, confirmation_count, initial_weight, last_confirmed
      FROM lessons WHERE status = 'active'
    `;
    params = [];
    if (brainFilter) { query += ' AND brain_file = ?'; params.push(brainFilter); }
    if (domainFilter) { query += ' AND domain = ?'; params.push(domainFilter); }
    query += ' ORDER BY confirmation_count DESC';
  }

  if (limit) { query += ' LIMIT ?'; params.push(limit); }

  const rows = db.prepare(query).all(...params);
  if (rows.length === 0) {
    console.log('No lessons found matching filters.');
    return;
  }

  const tiers = { Rule: [], Inclination: [], Awareness: [], Data: [] };
  for (const row of rows) {
    const tier = tierLabel(row.confirmation_count);
    tiers[tier].push(row);
  }

  console.log('\n# Surfaced Lessons');
  let shown = 0;

  const topTiers = [
    ['Rule', '## Rules (75-100) — Follow these. No exceptions.'],
    ['Inclination', '## Inclinations (50-74) — Strong defaults. Question if context demands it.'],
  ];

  for (const [tierName, header] of topTiers) {
    if (tiers[tierName].length > 0) {
      console.log('\n' + header + '\n');
      for (const l of tiers[tierName]) {
        const pol = l.polarity === 'positive' ? '(+) ' : l.polarity === 'negative' ? '(-) ' : '';
        const text = (l.polarity === 'positive' && l.correction_text) ? l.correction_text : l.entry_text;
        console.log(`- \`${l.confirmation_count}\` ${pol}**${l.title}** — ${text}`);
        shown++;
      }
    }
  }

  if (showAll) {
    const lowerTiers = [
      ['Awareness', '## Awareness (25-49) — Be aware. Not yet proven enough to follow blindly.'],
      ['Data', '## Data (<25) — Background signals. Accumulating evidence.'],
    ];
    for (const [tierName, header] of lowerTiers) {
      if (tiers[tierName].length > 0) {
        console.log('\n' + header + '\n');
        for (const l of tiers[tierName]) {
          const pol = l.polarity === 'positive' ? '(+) ' : l.polarity === 'negative' ? '(-) ' : '';
          const text = (l.polarity === 'positive' && l.correction_text) ? l.correction_text : l.entry_text;
          console.log(`- \`${l.confirmation_count}\` ${pol}**${l.title}** — ${text}`);
          shown++;
        }
      }
    }
  } else {
    const below = tiers.Awareness.length + tiers.Data.length;
    if (below > 0) console.log(`\n*${below} more lessons below threshold (use --all to see)*`);
  }

  console.log(`\n--- ${shown} lessons shown, ${rows.length} total ---`);
}

function showLessons(db) {
  const rows = db.prepare(`
    SELECT brain_file, domain, title, entry_text, confirmation_count, last_confirmed
    FROM lessons WHERE status = 'active'
    ORDER BY brain_file, domain, confirmation_count DESC
  `).all();

  if (rows.length === 0) { console.log('No lessons tracked.'); return; }

  let currentBrain = null;
  let currentDomain = null;
  for (const { brain_file, domain, title, confirmation_count, last_confirmed } of rows) {
    if (brain_file !== currentBrain) {
      currentBrain = brain_file;
      currentDomain = null;
      console.log(`\n${'='.repeat(60)}`);
      console.log(`  ${brain_file.toUpperCase()}`);
      console.log(`${'='.repeat(60)}`);
    }
    if (domain !== currentDomain) {
      currentDomain = domain;
      console.log(`\n  [${domain}]`);
    }
    const lastDate = last_confirmed ? last_confirmed.slice(0, 10) : '?';
    console.log(`    [${String(confirmation_count).padStart(3)}x] ${title} (${lastDate})`);
  }

  console.log(`\n--- ${rows.length} lessons total ---`);
}

module.exports = {
  BRAIN_DIR, DEFAULT_DB_PATH, WEIGHT_CAP, DOPAMINE_INCREMENT,
  TIER_RULE, TIER_INCLINATION, TIER_AWARENESS,
  tierLabel, openDb, ensureSchema, getDbPath,
  insertLesson, surfaceLessons, showLessons,
};
