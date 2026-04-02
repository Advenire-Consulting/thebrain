#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { openDb, ensureSchema } = require('./lessons');

const SEED_DIR = path.join(__dirname, '..', 'seed');

function seed() {
  const db = openDb();
  ensureSchema(db);

  const now = new Date().toISOString();
  let lessonsAdded = 0;
  let forcesAdded = 0;
  let skipped = 0;

  // Seed lessons — skip any that already exist by title
  const lessonsData = JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'starter-lessons.json'), 'utf-8'));
  const checkLesson = db.prepare('SELECT id FROM lessons WHERE title = ? AND status = \'active\'');
  const insertLesson = db.prepare(`
    INSERT INTO lessons (brain_file, domain, title, entry_text, summary, polarity,
                         confirmation_count, first_confirmed, last_confirmed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const l of lessonsData.lessons) {
    if (checkLesson.get(l.title)) { skipped++; continue; }
    insertLesson.run(l.brain_file, l.domain, l.title, l.entry_text, l.summary || null, l.polarity, l.weight, now, now);
    lessonsAdded++;
  }

  // Seed forces — skip any that already exist by title
  const forcesData = JSON.parse(fs.readFileSync(path.join(SEED_DIR, 'starter-forces.json'), 'utf-8'));
  const checkForce = db.prepare('SELECT id FROM forces WHERE title = ? AND status = \'active\'');
  const insertForce = db.prepare(`
    INSERT INTO forces (force_type, title, description, summary, score,
                        first_observed, last_reinforced)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const f of forcesData.forces) {
    if (checkForce.get(f.title)) { skipped++; continue; }
    insertForce.run(f.force_type, f.title, f.description, f.summary || null, f.score, now, now);
    forcesAdded++;
  }

  db.close();
  console.log(`Seeded: ${lessonsAdded} lessons, ${forcesAdded} forces` + (skipped > 0 ? ` (${skipped} already existed)` : ''));
}

if (require.main === module) {
  seed();
}

module.exports = { seed };
