CREATE TABLE IF NOT EXISTS account (email TEXT PRIMARY KEY, company TEXT, name TEXT, title TEXT, interests TEXT,
  status TEXT NOT NULL CHECK (status IN ('active','pending','rejected')), source TEXT, id TEXT,
  created TEXT NOT NULL, updated TEXT, decided_at TEXT, decided_by TEXT);
CREATE TABLE IF NOT EXISTS magic_token (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, next TEXT, ttl INTEGER NOT NULL,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, consumed_at TEXT);
CREATE INDEX IF NOT EXISTS idx_magic_token_email ON magic_token(email, created_at);
CREATE TABLE IF NOT EXISTS session (sid TEXT PRIMARY KEY, email TEXT NOT NULL, company TEXT, created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL, revoked_at TEXT, key_id TEXT);
CREATE INDEX IF NOT EXISTS idx_session_email ON session(email, created_at);
CREATE TABLE IF NOT EXISTS allow_entry (kind TEXT NOT NULL CHECK (kind IN ('dom','eml')), value TEXT NOT NULL, added_at TEXT, PRIMARY KEY (kind, value));
CREATE TABLE IF NOT EXISTS registration (id TEXT PRIMARY KEY, ts TEXT NOT NULL, email TEXT NOT NULL, company TEXT, name TEXT, title TEXT,
  interests TEXT, roster INTEGER NOT NULL DEFAULT 0, next TEXT, status TEXT,
  created TEXT, updated TEXT, source TEXT, decided_at TEXT, decided_by TEXT);
CREATE TABLE IF NOT EXISTS decision_link (id TEXT PRIMARY KEY, email TEXT NOT NULL, next TEXT, ts TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT);
CREATE TABLE IF NOT EXISTS event (id INTEGER PRIMARY KEY, ts TEXT NOT NULL, type TEXT NOT NULL, email TEXT, extra TEXT, company TEXT, name TEXT, page TEXT, fs_number TEXT, state TEXT);
CREATE INDEX IF NOT EXISTS idx_event_ts ON event(ts);
CREATE TABLE IF NOT EXISTS face_day (day TEXT NOT NULL, email TEXT NOT NULL, face TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, email, face));
CREATE TABLE IF NOT EXISTS rate_limit (email TEXT PRIMARY KEY, until TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS dl_count (day TEXT NOT NULL, sid TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, sid));
CREATE TABLE IF NOT EXISTS copy_request (key TEXT PRIMARY KEY, ts TEXT NOT NULL, id TEXT, email TEXT NOT NULL, company TEXT, fs_number TEXT, state TEXT, debtor TEXT,
  status TEXT NOT NULL CHECK (status IN ('requested','purchased','done','declined')), updated_at TEXT, note TEXT, updated TEXT);
CREATE TABLE IF NOT EXISTS copy_request_index (fs TEXT NOT NULL, email TEXT NOT NULL, ts TEXT NOT NULL, expires_at TEXT NOT NULL, PRIMARY KEY (fs, email));
CREATE TABLE IF NOT EXISTS copy_count (email TEXT NOT NULL, month TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (email, month));
