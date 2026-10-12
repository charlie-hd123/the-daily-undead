-- Additive multi-puzzle migration. Existing Quest Steps rows and totals are
-- preserved verbatim and identified as Easter egg puzzle results.
ALTER TABLE player_daily_results ADD COLUMN puzzle_type TEXT NOT NULL DEFAULT 'easter'
  CHECK (puzzle_type IN ('easter', 'word'));
ALTER TABLE player_daily_results ADD COLUMN word_misses INTEGER NOT NULL DEFAULT 0
  CHECK (word_misses BETWEEN 0 AND 5);

CREATE TABLE IF NOT EXISTS puzzle_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  puzzle_date TEXT NOT NULL CHECK (puzzle_date GLOB '????-??-??'),
  puzzle_type TEXT NOT NULL CHECK (puzzle_type IN ('easter', 'word')),
  puzzle_id TEXT NOT NULL,
  player_hash TEXT NOT NULL,
  answer_id TEXT NOT NULL,
  answer_name TEXT NOT NULL,
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (puzzle_date, player_hash, puzzle_type)
);

CREATE INDEX IF NOT EXISTS puzzle_attempts_date_type_idx
  ON puzzle_attempts (puzzle_date, puzzle_type);

CREATE TABLE IF NOT EXISTS puzzle_daily_stats (
  puzzle_date TEXT NOT NULL CHECK (puzzle_date GLOB '????-??-??'),
  puzzle_type TEXT NOT NULL CHECK (puzzle_type IN ('easter', 'word')),
  attempts INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  answer_id TEXT NOT NULL,
  answer_name TEXT NOT NULL,
  PRIMARY KEY (puzzle_date, puzzle_type)
);

-- Preserve the complete historical Quest Steps record without changing the
-- existing all-time total.
INSERT OR IGNORE INTO puzzle_attempts (
  id, puzzle_date, puzzle_type, puzzle_id, player_hash,
  answer_id, answer_name, is_correct, created_at
)
SELECT
  id, puzzle_date, 'easter', puzzle_id, player_hash,
  answer_map_id, answer_map_name, is_correct, created_at
FROM attempts;

INSERT OR IGNORE INTO puzzle_daily_stats (
  puzzle_date, puzzle_type, attempts, correct, answer_id, answer_name
)
SELECT
  puzzle_date, 'easter', attempts, correct, answer_map_id, answer_map_name
FROM daily_stats;

CREATE TRIGGER IF NOT EXISTS puzzle_attempts_update_aggregates
AFTER INSERT ON puzzle_attempts
BEGIN
  INSERT INTO puzzle_daily_stats (
    puzzle_date, puzzle_type, attempts, correct, answer_id, answer_name
  ) VALUES (
    NEW.puzzle_date, NEW.puzzle_type, 1, NEW.is_correct,
    NEW.answer_id, NEW.answer_name
  )
  ON CONFLICT (puzzle_date, puzzle_type) DO UPDATE SET
    attempts = attempts + 1,
    correct = correct + NEW.is_correct,
    answer_id = NEW.answer_id,
    answer_name = NEW.answer_name;

  UPDATE community_totals
  SET total_games = total_games + 1
  WHERE id = 1;
END;
