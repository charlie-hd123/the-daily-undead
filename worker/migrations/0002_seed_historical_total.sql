-- Estimated games completed before community tracking launched.
-- The guard preserves any genuine total that has already passed this baseline.
UPDATE community_totals
SET total_games = 100
WHERE id = 1
  AND total_games < 100;
