-- Expand puzzle types without modifying historical rows or totals.
-- Applied to local/staging only for the Blood Ties demo; production needs separate authorization.

DROP VIEW admin_player_results;

DROP TRIGGER puzzle_attempts_update_aggregates;

CREATE TABLE player_daily_results_next (
  user_id TEXT NOT NULL REFERENCES player_profiles(user_id) ON DELETE CASCADE,
  puzzle_date TEXT NOT NULL CHECK (puzzle_date GLOB '????-??-??'),
  puzzle_id TEXT NOT NULL,
  selected_map_id TEXT NOT NULL,
  clues_used INTEGER NOT NULL CHECK (clues_used BETWEEN 1 AND 3),
  map_correct INTEGER NOT NULL CHECK (map_correct IN (0, 1)),
  map_points INTEGER NOT NULL DEFAULT 0 CHECK (map_points >= 0),
  bonus_status TEXT NOT NULL DEFAULT 'unavailable'
    CHECK (bonus_status IN ('unavailable', 'pending', 'correct', 'incorrect')),
  bonus_points INTEGER NOT NULL DEFAULT 0 CHECK (bonus_points >= 0),
  points_earned INTEGER NOT NULL DEFAULT 0 CHECK (points_earned >= 0),
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, score_awarded INTEGER NOT NULL DEFAULT 0
  CHECK (score_awarded >= 0), progression_applied INTEGER NOT NULL DEFAULT 0
  CHECK (progression_applied IN (0, 1)), puzzle_type TEXT NOT NULL DEFAULT 'easter'
  CHECK (puzzle_type IN ('easter', 'word', 'blood')), word_misses INTEGER NOT NULL DEFAULT 0
  CHECK (word_misses BETWEEN 0 AND 5),
  PRIMARY KEY (user_id, puzzle_date)
);

INSERT INTO player_daily_results_next SELECT * FROM player_daily_results;

DROP TABLE player_daily_results;

ALTER TABLE player_daily_results_next RENAME TO player_daily_results;

ALTER TABLE player_daily_results ADD COLUMN blood_misses INTEGER NOT NULL DEFAULT 0 CHECK (blood_misses BETWEEN 0 AND 3);

CREATE TABLE puzzle_attempts_next (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  puzzle_date TEXT NOT NULL CHECK (puzzle_date GLOB '????-??-??'),
  puzzle_type TEXT NOT NULL CHECK (puzzle_type IN ('easter', 'word', 'blood')),
  puzzle_id TEXT NOT NULL,
  player_hash TEXT NOT NULL,
  answer_id TEXT NOT NULL,
  answer_name TEXT NOT NULL,
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (puzzle_date, player_hash, puzzle_type)
);

INSERT INTO puzzle_attempts_next SELECT * FROM puzzle_attempts;

DROP TABLE puzzle_attempts;

ALTER TABLE puzzle_attempts_next RENAME TO puzzle_attempts;

CREATE TABLE puzzle_daily_stats_next (
  puzzle_date TEXT NOT NULL CHECK (puzzle_date GLOB '????-??-??'),
  puzzle_type TEXT NOT NULL CHECK (puzzle_type IN ('easter', 'word', 'blood')),
  attempts INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  answer_id TEXT NOT NULL,
  answer_name TEXT NOT NULL,
  PRIMARY KEY (puzzle_date, puzzle_type)
);

INSERT INTO puzzle_daily_stats_next SELECT * FROM puzzle_daily_stats;

DROP TABLE puzzle_daily_stats;

ALTER TABLE puzzle_daily_stats_next RENAME TO puzzle_daily_stats;

CREATE INDEX player_daily_results_date_idx
  ON player_daily_results (puzzle_date);

CREATE INDEX player_daily_results_user_idx
  ON player_daily_results (user_id);

CREATE INDEX puzzle_attempts_date_type_idx
  ON puzzle_attempts (puzzle_date, puzzle_type);

CREATE TRIGGER puzzle_attempts_update_aggregates
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

CREATE VIEW admin_player_results AS
SELECT profiles.username, profiles.account_id,
  identities.provider_subject AS supabase_user_id, results.*
FROM player_daily_results AS results
JOIN player_profiles AS profiles ON profiles.user_id = results.user_id
LEFT JOIN account_identities AS identities
  ON identities.account_id = profiles.account_id AND identities.provider = 'supabase';
