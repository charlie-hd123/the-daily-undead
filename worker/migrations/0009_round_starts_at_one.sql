-- Round is a player-facing survival level, not a completed-solve counter.
-- A fresh or ended run starts at Round 1; the first successful solve advances
-- it to Round 2. Legacy values counted completed survival days from zero, so
-- shift every stored current, highest and reconstruction-anchor value once.
UPDATE player_saves
SET current_round = current_round + 1,
    best_round = best_round + 1,
    round_anchor_value = round_anchor_value + 1;
