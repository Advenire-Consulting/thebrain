#!/usr/bin/env node
'use strict';

const { openDb, ensureSchema, insertLesson, surfaceLessons, showLessons } = require('./lessons');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--insert') args.insert = true;
    else if (arg === '--surface') args.surface = true;
    else if (arg === '--lessons') args.lessons = true;
    else if (arg === '--all') args.all = true;
    else if (arg === '--brain' && argv[i + 1]) args.brain = argv[++i];
    else if (arg === '--domain' && argv[i + 1]) args.domain = argv[++i];
    else if (arg === '--title' && argv[i + 1]) args.title = argv[++i];
    else if (arg === '--entry' && argv[i + 1]) args.entry = argv[++i];
    else if (arg === '--severity' && argv[i + 1]) args.severity = argv[++i];
    else if (arg === '--weight' && argv[i + 1]) args.weight = parseInt(argv[++i], 10);
    else if (arg === '--limit' && argv[i + 1]) args.limit = parseInt(argv[++i], 10);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const db = openDb();
  ensureSchema(db);

  if (args.insert) {
    if (!args.brain || !args.domain || !args.title || !args.entry) {
      console.error('Error: --insert requires --brain, --domain, --title, --entry');
      process.exit(1);
    }
    const result = insertLesson(db, args.brain, args.domain, args.title, args.entry,
                                args.severity || 'moderate', args.weight);
    console.log('\nDopamine signal stored:');
    console.log(`  Action: ${result.action}`);
    console.log(`  Brain: ${result.brain_file}`);
    console.log(`  Domain: ${result.domain}`);
    console.log(`  Title: ${result.title}`);
    console.log(`  Weight: ${result.confirmation_count}`);
    console.log(`  Tier: ${result.tier}`);
  } else if (args.surface) {
    surfaceLessons(db, {
      brainFilter: args.brain,
      domainFilter: args.domain,
      limit: args.limit,
      showAll: args.all,
    });
  } else if (args.lessons) {
    showLessons(db);
  } else {
    console.log('Usage: dopamine-helper.js --insert|--surface|--lessons [options]');
    console.log('  --insert   --brain <file> --domain <d> --title <t> --entry <e> [--severity <s>] [--weight <w>]');
    console.log('  --surface  [--brain <file>] [--domain <d>] [--limit <n>] [--all]');
    console.log('  --lessons  List all tracked lessons with counts');
  }

  db.close();
}

main();
