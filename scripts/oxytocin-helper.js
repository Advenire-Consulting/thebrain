#!/usr/bin/env node
'use strict';

const { openDb, ensureSchema } = require('./lessons');

const TIER_ALWAYS_ON = 75;
const TIER_PLANNING = 50;
const SCORE_CAP = 100;
const OXYTOCIN_INCREMENT = 10;

function forceTierLabel(score) {
  if (score >= TIER_ALWAYS_ON) return 'Always-on';
  if (score >= TIER_PLANNING) return 'Planning-mode';
  return 'Deep context';
}

function insertForce(db, title, description, score, forceType, connections) {
  forceType = forceType || 'force';
  const now = new Date().toISOString();

  const existing = db.prepare(`
    SELECT id, score FROM forces WHERE title = ? AND force_type = ? AND status = 'active'
  `).get(title, forceType);

  let action, forceId, newScore;

  if (existing) {
    forceId = existing.id;
    newScore = (score != null) ? score : Math.min(existing.score + OXYTOCIN_INCREMENT, SCORE_CAP);
    db.prepare(`
      UPDATE forces SET score = ?, description = ?, last_reinforced = ? WHERE id = ?
    `).run(newScore, description, now, forceId);
    action = 'reinforced';
  } else {
    newScore = (score != null) ? score : 50;
    const connectionsJson = connections ? JSON.stringify(connections) : null;
    const result = db.prepare(`
      INSERT INTO forces (force_type, title, description, connections, score,
                          first_observed, last_reinforced)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(forceType, title, description, connectionsJson, newScore, now, now);
    forceId = result.lastInsertRowid;
    action = 'created';
  }

  return { action, force_id: forceId, force_type: forceType, title, score: newScore, tier: forceTierLabel(newScore) };
}

function printForce(f) {
  let prefix = '';
  if (f.force_type === 'connective_tissue') prefix = '[tissue] ';
  else if (f.force_type === 'behavioral_outcome') prefix = '[outcome] ';

  let connectionsNote = '';
  if (f.connections) {
    try {
      const conns = JSON.parse(f.connections);
      connectionsNote = ` Connects: ${conns.join(', ')}.`;
    } catch { /* ignore */ }
  }

  console.log(`- \`${f.score}\` ${prefix}**${f.title}** — ${f.description}${connectionsNote}`);
}

function surfaceForces(db, { forceType, showAll } = {}) {
  let query = "SELECT force_type, title, description, connections, score FROM forces WHERE status = 'active' AND force_type != 'connective_tissue'";
  const params = [];
  if (forceType) { query += ' AND force_type = ?'; params.push(forceType); }
  query += ' ORDER BY score DESC';

  const rows = db.prepare(query).all(...params);
  if (rows.length === 0) { console.log('No forces found.'); return; }

  const tiers = { 'Always-on': [], 'Planning-mode': [], 'Deep context': [] };
  for (const row of rows) {
    tiers[forceTierLabel(row.score)].push(row);
  }

  console.log('\n# Limbic Forces');
  let shown = 0;

  if (tiers['Always-on'].length > 0) {
    console.log('\n## Always-on (75-100) — Shapes every interaction.\n');
    for (const f of tiers['Always-on']) { printForce(f); shown++; }
  }

  if (tiers['Planning-mode'].length > 0) {
    console.log('\n## Planning-mode (50-74) — Active during design/brainstorming.\n');
    for (const f of tiers['Planning-mode']) { printForce(f); shown++; }
  }

  if (showAll) {
    if (tiers['Deep context'].length > 0) {
      console.log('\n## Deep context (<50) — Archive. Accessed on demand.\n');
      for (const f of tiers['Deep context']) { printForce(f); shown++; }
    }
  } else {
    const below = tiers['Deep context'].length;
    if (below > 0) console.log(`\n*${below} more forces below threshold (use --all to see)*`);
  }

  console.log(`\n--- ${shown} forces shown, ${rows.length} total ---`);
}

function showForces(db) {
  const rows = db.prepare(`
    SELECT force_type, title, score, last_reinforced
    FROM forces WHERE status = 'active'
    ORDER BY force_type, score DESC
  `).all();

  if (rows.length === 0) { console.log('No forces tracked.'); return; }

  let currentType = null;
  for (const { force_type, title, score, last_reinforced } of rows) {
    if (force_type !== currentType) {
      currentType = force_type;
      const label = { force: 'FORCES', connective_tissue: 'CONNECTIVE TISSUE',
                       behavioral_outcome: 'BEHAVIORAL OUTCOMES' }[force_type] || force_type.toUpperCase();
      console.log(`\n${'='.repeat(60)}`);
      console.log(`  ${label}`);
      console.log(`${'='.repeat(60)}`);
    }
    const lastDate = last_reinforced ? last_reinforced.slice(0, 10) : '?';
    console.log(`    [${String(score).padStart(3)}] ${title} (${lastDate})`);
  }

  console.log(`\n--- ${rows.length} forces total ---`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--insert') args.insert = true;
    else if (arg === '--surface') args.surface = true;
    else if (arg === '--forces') args.forces = true;
    else if (arg === '--all') args.all = true;
    else if (arg === '--title' && argv[i + 1]) args.title = argv[++i];
    else if (arg === '--description' && argv[i + 1]) args.description = argv[++i];
    else if (arg === '--score' && argv[i + 1]) args.score = parseInt(argv[++i], 10);
    else if (arg === '--type' && argv[i + 1]) args.type = argv[++i];
    else if (arg === '--connections') {
      args.connections = [];
      while (argv[i + 1] && !argv[i + 1].startsWith('--')) {
        args.connections.push(argv[++i]);
      }
    }
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = openDb();
  ensureSchema(db);

  if (args.insert) {
    if (!args.title || !args.description) {
      console.error('Error: --insert requires --title and --description');
      process.exit(1);
    }
    const result = insertForce(db, args.title, args.description,
                               args.score, args.type, args.connections);
    console.log('\nOxytocin signal stored:');
    console.log(`  Action: ${result.action}`);
    console.log(`  Type: ${result.force_type}`);
    console.log(`  Title: ${result.title}`);
    console.log(`  Score: ${result.score}`);
    console.log(`  Tier: ${result.tier}`);
  } else if (args.surface) {
    surfaceForces(db, { showAll: args.all });
  } else if (args.forces) {
    showForces(db);
  } else {
    console.log('Usage: oxytocin-helper.js --insert|--surface|--forces [options]');
    console.log('  --insert   --title <t> --description <d> [--score <n>] [--type <t>] [--connections <c1> <c2>]');
    console.log('  --surface  [--all]');
    console.log('  --forces   List all tracked forces with scores');
  }

  db.close();
}

main();

module.exports = { insertForce, surfaceForces, showForces, forceTierLabel, SCORE_CAP, OXYTOCIN_INCREMENT };
