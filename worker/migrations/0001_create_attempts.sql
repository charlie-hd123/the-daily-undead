CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  puzzle_date TEXT NOT NULL CHECK (puzzle_date GLOB '????-??-??'),
  puzzle_id TEXT NOT NULL,
  player_hash TEXT NOT NULL,
  answer_map_id TEXT NOT NULL,
  answer_map_name TEXT NOT NULL,
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (puzzle_date, player_hash)
);

CREATE INDEX IF NOT EXISTS attempts_puzzle_date_idx
  ON attempts (puzzle_date);

CREATE TABLE IF NOT EXISTS daily_stats (
  puzzle_date TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  answer_map_id TEXT NOT NULL,
  answer_map_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS community_totals (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  total_games INTEGER NOT NULL DEFAULT 0
);

INSERT OR IGNORE INTO community_totals (id, total_games) VALUES (1, 0);

CREATE TRIGGER IF NOT EXISTS attempts_update_aggregates
AFTER INSERT ON attempts
BEGIN
  INSERT INTO daily_stats (
    puzzle_date,
    attempts,
    correct,
    answer_map_id,
    answer_map_name
  ) VALUES (
    NEW.puzzle_date,
    1,
    NEW.is_correct,
    NEW.answer_map_id,
    NEW.answer_map_name
  )
  ON CONFLICT (puzzle_date) DO UPDATE SET
    attempts = attempts + 1,
    correct = correct + NEW.is_correct,
    answer_map_id = NEW.answer_map_id,
    answer_map_name = NEW.answer_map_name;

  UPDATE community_totals
  SET total_games = total_games + 1
  WHERE id = 1;
END;
