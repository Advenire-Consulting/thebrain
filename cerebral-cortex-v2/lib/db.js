const path = require('path');
const Database = require('better-sqlite3');

const os = require('os');
const BRAIN_DIR = path.join(os.homedir(), '.claude', 'brain');
const DEFAULT_RECALL_DB_PATH = process.env.THEBRAIN_RECALL_DB || path.join(BRAIN_DIR, 'recall.db');
const DEFAULT_WINDOWS_PATH = process.env.THEBRAIN_WINDOWS_JSON || path.join(BRAIN_DIR, 'windows.json');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS windows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    seq INTEGER NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, seq)
);

CREATE TABLE IF NOT EXISTS window_summaries (
    window_id INTEGER PRIMARY KEY REFERENCES windows(id) ON DELETE CASCADE,
    scope TEXT,
    summary TEXT NOT NULL,
    files TEXT,
    next TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS window_projects (
    window_id INTEGER NOT NULL REFERENCES windows(id) ON DELETE CASCADE,
    project TEXT NOT NULL,
    frequency INTEGER NOT NULL,
    PRIMARY KEY(window_id, project)
);

CREATE TABLE IF NOT EXISTS window_files (
    window_id INTEGER NOT NULL REFERENCES windows(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    lines TEXT NOT NULL,
    tool TEXT,
    PRIMARY KEY(window_id, file_path)
);

CREATE TABLE IF NOT EXISTS window_terms (
    window_id INTEGER NOT NULL REFERENCES windows(id) ON DELETE CASCADE,
    term TEXT NOT NULL,
    source TEXT NOT NULL,
    lines TEXT NOT NULL,
    count INTEGER NOT NULL,
    PRIMARY KEY(window_id, term, source)
);

CREATE TABLE IF NOT EXISTS window_decisions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    window_id INTEGER NOT NULL REFERENCES windows(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    summary TEXT NOT NULL,
    terms TEXT NOT NULL,
    file_anchors TEXT,
    status TEXT NOT NULL DEFAULT 'decided',
    continues_to_session TEXT,
    continues_to_seq INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(window_id, seq)
);

CREATE TABLE IF NOT EXISTS stopword_candidates (
    term TEXT PRIMARY KEY,
    noise_count INTEGER DEFAULT 0,
    relevant_count INTEGER DEFAULT 0,
    promoted INTEGER DEFAULT 0,
    last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE VIRTUAL TABLE IF NOT EXISTS window_search
USING fts5(user_terms, assistant_terms, content='');
`;

class RecallDB {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.exec(SCHEMA);
  }

  insertWindow({ sessionId, seq, startLine, endLine, startTime, endTime }) {
    const existing = this.db.prepare('SELECT id FROM windows WHERE session_id = ? AND seq = ?').get(sessionId, seq);
    if (existing) return existing.id;

    const result = this.db.prepare(
      'INSERT INTO windows (session_id, seq, start_line, end_line, start_time, end_time) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(sessionId, seq, startLine, endLine, startTime, endTime);
    return result.lastInsertRowid;
  }

  getWindow(sessionId, seq) {
    return this.db.prepare('SELECT * FROM windows WHERE session_id = ? AND seq = ?').get(sessionId, seq);
  }

  insertProjects(windowId, projectFreqs) {
    const stmt = this.db.prepare('INSERT OR REPLACE INTO window_projects (window_id, project, frequency) VALUES (?, ?, ?)');
    const tx = this.db.transaction((freqs) => {
      for (const [project, frequency] of Object.entries(freqs)) {
        stmt.run(windowId, project, frequency);
      }
    });
    tx(projectFreqs);
  }

  getProjects(windowId) {
    return this.db.prepare('SELECT * FROM window_projects WHERE window_id = ?').all(windowId);
  }

  insertFiles(windowId, files) {
    const stmt = this.db.prepare('INSERT OR REPLACE INTO window_files (window_id, file_path, lines, tool) VALUES (?, ?, ?, ?)');
    const tx = this.db.transaction((fileList) => {
      for (const f of fileList) {
        stmt.run(windowId, f.filePath, JSON.stringify(f.lines), f.tool || null);
      }
    });
    tx(files);
  }

  getFiles(windowId) {
    return this.db.prepare('SELECT * FROM window_files WHERE window_id = ?').all(windowId);
  }

  insertTerms(windowId, terms) {
    const stmt = this.db.prepare('INSERT OR REPLACE INTO window_terms (window_id, term, source, lines, count) VALUES (?, ?, ?, ?, ?)');
    const tx = this.db.transaction((termList) => {
      for (const t of termList) {
        stmt.run(windowId, t.term, t.source, JSON.stringify(t.lines), t.count);
      }
    });
    tx(terms);
  }

  getTerms(windowId) {
    return this.db.prepare('SELECT * FROM window_terms WHERE window_id = ?').all(windowId);
  }

  insertSummary(windowId, { scope, summary, files, next }) {
    this.db.prepare(
      'INSERT OR REPLACE INTO window_summaries (window_id, scope, summary, files, next) VALUES (?, ?, ?, ?, ?)'
    ).run(windowId, scope || null, summary, files || null, next || null);
  }

  // Alias — PFC summaries always overwrite mechanical ones
  upsertSummary(windowId, data) { return this.insertSummary(windowId, data); }

  getSummary(windowId) {
    return this.db.prepare('SELECT * FROM window_summaries WHERE window_id = ?').get(windowId);
  }

  findWindowBySessionAndTime(sessionIdPrefix, hhmm, dateStr) {
    // Find all windows for sessions starting with this prefix
    const windows = this.db.prepare(
      "SELECT * FROM windows WHERE session_id LIKE ? ORDER BY end_time"
    ).all(sessionIdPrefix + '%');

    if (windows.length === 0) return null;
    if (windows.length === 1) return windows[0];

    const [hh, mm] = hhmm.split(':').map(Number);

    // If date provided (YYYY-MM-DD format), use it directly.
    // Otherwise fall back to deriving date from session start time.
    let d1;
    if (dateStr) {
      const [y, m, d] = dateStr.split('-').map(Number);
      d1 = new Date(y, m - 1, d, hh, mm, 0, 0);
    } else {
      const sessionStart = new Date(windows[0].start_time);
      d1 = new Date(sessionStart);
      d1.setHours(hh, mm, 0, 0);
    }
    // Try entry date and next day (midnight crossing)
    const d2 = new Date(d1.getTime() + 86400000);

    const candidates = [d1.getTime(), d2.getTime()];

    // Find the window whose end_time is closest to either candidate
    let best = null;
    let bestDiff = Infinity;
    for (const w of windows) {
      const endMs = new Date(w.end_time).getTime();
      for (const target of candidates) {
        const diff = Math.abs(endMs - target);
        if (diff < bestDiff) {
          bestDiff = diff;
          best = w;
        }
      }
    }
    return best;
  }

  hasWindow(sessionId, seq) {
    return !!this.db.prepare('SELECT 1 FROM windows WHERE session_id = ? AND seq = ?').get(sessionId, seq);
  }

  insertDecision(windowId, decision) {
    return this.db.prepare(
      'INSERT OR REPLACE INTO window_decisions (window_id, seq, start_line, end_line, summary, terms, file_anchors, status, continues_to_session, continues_to_seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      windowId, decision.seq, decision.startLine, decision.endLine,
      decision.summary, JSON.stringify(decision.terms),
      decision.fileAnchors ? JSON.stringify(decision.fileAnchors) : null,
      decision.status || 'decided',
      decision.continuesToSession || null,
      decision.continuesToSeq != null ? decision.continuesToSeq : null
    ).lastInsertRowid;
  }

  insertDecisions(windowId, decisions) {
    const tx = this.db.transaction((decs) => {
      for (const d of decs) this.insertDecision(windowId, d);
    });
    tx(decisions);
  }

  getDecisions(windowId) {
    return this.db.prepare(
      'SELECT * FROM window_decisions WHERE window_id = ? ORDER BY seq'
    ).all(windowId);
  }

  getDecisionsBySession(sessionId) {
    return this.db.prepare(
      'SELECT d.* FROM window_decisions d JOIN windows w ON w.id = d.window_id WHERE w.session_id = ? ORDER BY w.seq, d.seq'
    ).all(sessionId);
  }

  hasDecisions(windowId) {
    return !!this.db.prepare('SELECT 1 FROM window_decisions WHERE window_id = ?').get(windowId);
  }

  bumpNoise(terms) {
    const stmt = this.db.prepare(
      'INSERT INTO stopword_candidates (term, noise_count, last_seen) VALUES (?, 1, CURRENT_TIMESTAMP) ON CONFLICT(term) DO UPDATE SET noise_count = noise_count + 1, last_seen = CURRENT_TIMESTAMP'
    );
    const tx = this.db.transaction((list) => {
      for (const t of list) stmt.run(t.toLowerCase());
    });
    tx(terms);
  }

  bumpRelevant(terms) {
    const stmt = this.db.prepare(
      'INSERT INTO stopword_candidates (term, relevant_count, last_seen) VALUES (?, 1, CURRENT_TIMESTAMP) ON CONFLICT(term) DO UPDATE SET relevant_count = relevant_count + 1, noise_count = 0, promoted = 0, last_seen = CURRENT_TIMESTAMP'
    );
    const tx = this.db.transaction((list) => {
      for (const t of list) stmt.run(t.toLowerCase());
    });
    tx(terms);
  }

  getPromotedStopwords() {
    return this.db.prepare(
      'SELECT term FROM stopword_candidates WHERE noise_count >= 5 AND promoted = 1'
    ).all().map(r => r.term);
  }

  promoteEligible() {
    return this.db.prepare(
      'UPDATE stopword_candidates SET promoted = 1 WHERE noise_count >= 5 AND relevant_count = 0 AND promoted = 0'
    ).run().changes;
  }

  demoteStopword(term) {
    this.db.prepare(
      'UPDATE stopword_candidates SET promoted = 0, noise_count = 0 WHERE term = ?'
    ).run(term.toLowerCase());
  }

  listCandidates() {
    return this.db.prepare(
      'SELECT * FROM stopword_candidates ORDER BY noise_count DESC'
    ).all();
  }

  // ── FTS5 Search Index ──────────────────────────────────────────────────────

  // Populate the FTS5 index for a window with deduplicated term lists
  insertSearchTerms(windowId, { userTerms, assistantTerms }) {
    this.db.prepare(
      'INSERT INTO window_search(rowid, user_terms, assistant_terms) VALUES (?, ?, ?)'
    ).run(windowId, userTerms.join(' '), assistantTerms.join(' '));
  }

  // Remove a window's entry from the FTS5 index (contentless delete syntax)
  deleteSearchTerms(windowId) {
    this.db.prepare(
      "INSERT INTO window_search(window_search, rowid, user_terms, assistant_terms) VALUES('delete', ?, '', '')"
    ).run(windowId);
  }

  // Query FTS5 for candidate windows matching any of the given terms
  searchCandidates(terms) {
    if (terms.length === 0) return [];
    const query = terms
      .map(t => '"' + t.replace(/[^a-z0-9_-]/gi, '') + '"')
      .join(' OR ');
    try {
      return this.db.prepare(
        'SELECT rowid as windowId FROM window_search WHERE window_search MATCH ?'
      ).all(query);
    } catch (err) {
      process.stderr.write(`[recall-db] FTS5 query failed for "${query}": ${err.message}\n`);
      return [];
    }
  }

  // Rebuild the FTS5 index from existing window_terms data (for upgrades/backfill)
  rebuildSearchIndex() {
    this.db.exec('DROP TABLE IF EXISTS window_search');
    this.db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS window_search USING fts5(user_terms, assistant_terms, content='')");

    const windows = this.db.prepare('SELECT DISTINCT window_id FROM window_terms').all();
    const insertFts = this.db.prepare(
      'INSERT INTO window_search(rowid, user_terms, assistant_terms) VALUES (?, ?, ?)'
    );

    const rebuild = this.db.transaction(() => {
      for (const row of windows) {
        const wid = row.window_id;
        const userTerms = this.db.prepare(
          "SELECT DISTINCT term FROM window_terms WHERE window_id = ? AND source = 'user'"
        ).all(wid).map(r => r.term);

        const assistantTerms = this.db.prepare(
          "SELECT DISTINCT term FROM window_terms WHERE window_id = ? AND source = 'assistant'"
        ).all(wid).map(r => r.term);

        if (userTerms.length > 0 || assistantTerms.length > 0) {
          insertFts.run(wid, userTerms.join(' '), assistantTerms.join(' '));
        }
      }
    });
    rebuild();
    return windows.length;
  }

  close() {
    this.db.close();
  }
}

module.exports = { RecallDB, SCHEMA, DEFAULT_RECALL_DB_PATH, DEFAULT_WINDOWS_PATH };
