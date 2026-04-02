// signals.db v2 — add summary column for compact prefrontal output
// Summary is a one-sentence distillation loaded at session start instead of full entry_text/description.
// Without it, the session-start hook output can exceed display limits and truncate the tool-index.

module.exports = function migrate(db) {
  // Safely add summary column to lessons (ignore if already exists)
  const lessonCols = db.pragma('table_info(lessons)').map(c => c.name);
  if (!lessonCols.includes('summary')) {
    db.exec('ALTER TABLE lessons ADD COLUMN summary TEXT');
  }

  // Safely add summary column to forces (ignore if already exists)
  const forceCols = db.pragma('table_info(forces)').map(c => c.name);
  if (!forceCols.includes('summary')) {
    db.exec('ALTER TABLE forces ADD COLUMN summary TEXT');
  }

  // Populate default summaries for known seed lessons (by title match, only if null)
  const lessonSummaries = [
    ['%calibrate effort%', 'Simple questions may not need tools; default to minimal, check in at 5 calls.'],
    ['%ask before deploying%', 'User often has more context; one question before acting saves wasted tool calls.'],
    ['%working directory%', 'Always prefix manual commands with cd or label the working directory.'],
    ['%green light%', 'Answer inline questions before executing a directive.'],
    ['%infrastructure location%', 'Ask the user rather than guessing at paths or directories.'],
    ['%know the target%', "User memory is faster than searching; ask which file before grep."],
    ['%pause before building%', 'Ask before switching from exploration to execution mode.'],
    ['%overview before applying%', 'Summarize all planned edits verbally before starting.'],
    ['Position over menu', 'Lead with a recommendation, not a list of options.'],
    ['%save-only option%', 'Offer execute now, save for later, or revise — not just execute vs no.'],
  ];

  const updateLesson = db.prepare('UPDATE lessons SET summary = ? WHERE title LIKE ? AND summary IS NULL');
  for (const [pattern, summary] of lessonSummaries) {
    updateLesson.run(summary, pattern);
  }

  // Populate default summaries for known seed forces (by title match, only if null)
  const forceSummaries = [
    ['Constraint-driven design', 'Start from true constraints; the connections reveal themselves.'],
    ['Second seat', 'During refinement, optimize for the next person who reads or uses this.'],
    ['%readability%', 'Comments and annotations are recall points to the invisible context of a moment.'],
    ['Perceptiveness is efficiency', 'Emotional attunement is faster than trial and error.'],
  ];

  const updateForce = db.prepare('UPDATE forces SET summary = ? WHERE title LIKE ? AND summary IS NULL');
  for (const [pattern, summary] of forceSummaries) {
    updateForce.run(summary, pattern);
  }
};
