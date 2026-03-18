-- recall.db v1 — initial schema
-- Existing databases already have this; migration runner skips if schema_version >= 1.

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
