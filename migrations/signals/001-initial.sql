-- signals.db v1 — initial schema
-- Existing databases already have this; migration runner skips if schema_version >= 1.

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
