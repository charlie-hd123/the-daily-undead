CREATE TABLE IF NOT EXISTS player_profiles (
  user_id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE,
  leaderboard_visible INTEGER NOT NULL DEFAULT 1 CHECK (leaderboard_visible IN (0, 1)),
  legacy_imported_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS player_profiles_username_idx
  ON player_profiles (username COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS player_saves (
  user_id TEXT PRIMARY KEY REFERENCES player_profiles(user_id) ON DELETE CASCADE,
  current_round INTEGER NOT NULL DEFAULT 0 CHECK (current_round >= 0),
  best_round INTEGER NOT NULL DEFAULT 0 CHECK (best_round >= 0),
  points_balance INTEGER NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
  total_rounds INTEGER NOT NULL DEFAULT 0 CHECK (total_rounds >= 0),
  revive_count INTEGER NOT NULL DEFAULT 0 CHECK (revive_count >= 0),
  last_played_date TEXT,
  missed_day_json TEXT,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS player_daily_saves (
  user_id TEXT NOT NULL REFERENCES player_profiles(user_id) ON DELETE CASCADE,
  puzzle_date TEXT NOT NULL CHECK (puzzle_date GLOB '????-??-??'),
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, puzzle_date)
);

CREATE TABLE IF NOT EXISTS player_daily_results (
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
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, puzzle_date)
);

CREATE INDEX IF NOT EXISTS player_daily_results_date_idx
  ON player_daily_results (puzzle_date);

CREATE INDEX IF NOT EXISTS player_daily_results_user_idx
  ON player_daily_results (user_id);
