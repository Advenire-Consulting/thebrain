-- recall.db v2 — archived conversation content for JSONL expiry resilience

CREATE TABLE IF NOT EXISTS archived_messages (
    window_id INTEGER PRIMARY KEY REFERENCES windows(id) ON DELETE CASCADE,
    messages TEXT NOT NULL,
    archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
