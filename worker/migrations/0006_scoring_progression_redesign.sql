-- Permanent progression fields. Legacy points/revive columns remain in place so
-- the redesign can be rolled back and the eventual production migration can be
-- audited before any historical estimate is applied.
ALTER TABLE player_saves ADD COLUMN score INTEGER NOT NULL DEFAULT 0 CHECK (score >= 0);
ALTER TABLE player_saves ADD COLUMN score_migration_method TEXT;
ALTER TABLE player_saves ADD COLUMN score_migrated_at TEXT;

-- Preserve every existing balance as the minimum opening Score. A reviewed
-- production migration can only increase this estimate later; it must not reset
-- or reduce anybody's value.
UPDATE player_saves
SET score = MAX(score, points_balance),
    score_migration_method = 'current-balance-floor',
    score_migrated_at = CURRENT_TIMESTAMP;

-- Tracks exactly how many points from a verified daily result have already been
-- added to permanent Score. This makes map and bonus requests idempotent.
ALTER TABLE player_daily_results ADD COLUMN score_awarded INTEGER NOT NULL DEFAULT 0
  CHECK (score_awarded >= 0);

-- A single canonical UTC game-date calendar controls missed-day continuity.
-- Protected dates are skipped: they neither advance nor end a Round.
CREATE TABLE IF NOT EXISTS game_dates (
  game_date TEXT PRIMARY KEY CHECK (game_date GLOB '????-??-??'),
  counts_for_round INTEGER NOT NULL DEFAULT 1 CHECK (counts_for_round IN (0, 1)),
  protection_reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS game_dates_round_idx
  ON game_dates (counts_for_round, game_date);
