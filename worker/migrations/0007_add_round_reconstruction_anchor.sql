-- Snapshot the pre-redesign Round once. From this anchor forward, signed-in
-- players' Round can be reconstructed from verified results and protected dates.
ALTER TABLE player_saves ADD COLUMN round_anchor_date TEXT;
ALTER TABLE player_saves ADD COLUMN round_anchor_value INTEGER NOT NULL DEFAULT 0
  CHECK (round_anchor_value >= 0);

UPDATE player_saves
SET round_anchor_date = last_played_date,
    round_anchor_value = current_round;
