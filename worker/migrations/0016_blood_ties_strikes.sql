-- Local/staging Blood Ties: allow accumulated misses across strike resets.
-- Preserve every historical result and award; production needs separate authorization.

DROP VIEW admin_player_results;

CREATE TABLE player_daily_results_strikes (
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
  blood_misses INTEGER NOT NULL DEFAULT 0 CHECK (blood_misses BETWEEN 0 AND 7),
  PRIMARY KEY (user_id, puzzle_date)
);

INSERT INTO player_daily_results_strikes SELECT * FROM player_daily_results;

DROP TABLE player_daily_results;

ALTER TABLE player_daily_results_strikes RENAME TO player_daily_results;

CREATE INDEX player_daily_results_date_idx
  ON player_daily_results (puzzle_date);

CREATE INDEX player_daily_results_user_idx
  ON player_daily_results (user_id);

CREATE VIEW admin_player_results AS
SELECT profiles.username, profiles.account_id,
  identities.provider_subject AS supabase_user_id, results.*
FROM player_daily_results AS results
JOIN player_profiles AS profiles ON profiles.user_id = results.user_id
LEFT JOIN account_identities AS identities
  ON identities.account_id = profiles.account_id AND identities.provider = 'supabase';
