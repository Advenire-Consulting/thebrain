const path = require('path');
const { RecallDB, DEFAULT_RECALL_DB_PATH } = require('../lib/db');
const { resetDynamicCache } = require('../lib/stopwords');

const DB_PATH = DEFAULT_RECALL_DB_PATH;

function main() {
  const args = process.argv.slice(2);
  const db = new RecallDB(DB_PATH);

  if (args.includes('--noise')) {
    const idx = args.indexOf('--noise');
    const terms = (args[idx + 1] || '').split(',').map(t => t.trim()).filter(Boolean);
    if (terms.length === 0) { console.log('Usage: --noise "term1,term2"'); db.close(); return; }
    db.bumpNoise(terms);
    const promoted = db.promoteEligible();
    if (promoted > 0) resetDynamicCache();
    console.log('Noise bumped: ' + terms.join(', '));
    if (promoted > 0) console.log('Promoted ' + promoted + ' term(s) to dynamic filter');
    for (const t of terms) {
      const row = db.db.prepare('SELECT * FROM stopword_candidates WHERE term = ?').get(t.toLowerCase());
      if (row) console.log('  ' + row.term + ': noise=' + row.noise_count + ' relevant=' + row.relevant_count + (row.promoted ? ' [promoted]' : ''));
    }
  } else if (args.includes('--relevant')) {
    const idx = args.indexOf('--relevant');
    const terms = (args[idx + 1] || '').split(',').map(t => t.trim()).filter(Boolean);
    if (terms.length === 0) { console.log('Usage: --relevant "term1,term2"'); db.close(); return; }
    db.bumpRelevant(terms);
    resetDynamicCache();
    console.log('Relevant bumped (noise reset): ' + terms.join(', '));
  } else if (args.includes('--demote')) {
    const idx = args.indexOf('--demote');
    const term = (args[idx + 1] || '').trim();
    if (!term) { console.log('Usage: --demote "term"'); db.close(); return; }
    db.demoteStopword(term);
    resetDynamicCache();
    console.log('Demoted: ' + term + ' (removed from dynamic filter, noise reset)');
  } else if (args.includes('--list')) {
    const rows = db.listCandidates();
    if (rows.length === 0) { console.log('No stopword candidates yet.'); db.close(); return; }
    console.log('Stopword Candidates');
    console.log('='.repeat(50));
    const promoted = rows.filter(r => r.promoted);
    const pending = rows.filter(r => !r.promoted && r.noise_count > 0);
    if (promoted.length > 0) {
      console.log('\nPromoted (active in filter):');
      for (const r of promoted) console.log('  ' + r.term + ' | noise=' + r.noise_count + ' | relevant=' + r.relevant_count);
    }
    if (pending.length > 0) {
      console.log('\nPending (' + pending[0].noise_count + '/5 to promote):');
      for (const r of pending) console.log('  ' + r.term + ' | noise=' + r.noise_count + '/5 | relevant=' + r.relevant_count);
    }
  } else {
    console.log('CC2 Stopword Candidates');
    console.log('  --noise "term1,term2"     Flag terms as noise (+1 noise count)');
    console.log('  --relevant "term1,term2"  Flag terms as useful (resets noise streak)');
    console.log('  --demote "term"           Remove from dynamic filter');
    console.log('  --list                    Show all candidates and status');
  }

  db.close();
}

main();
