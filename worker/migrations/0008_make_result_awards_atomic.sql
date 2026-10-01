-- Existing verified results are already represented by the opening Score/Solves
-- migration and must never be credited again when an old browser retries them.
ALTER TABLE player_daily_results ADD COLUMN progression_applied INTEGER NOT NULL DEFAULT 0
  CHECK (progression_applied IN (0, 1));

UPDATE player_daily_results
SET score_awarded = points_earned,
    progression_applied = 1;
