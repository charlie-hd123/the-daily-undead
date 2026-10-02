-- ONE-TIME OPENING SCORE WRITE.
-- Run only while the maintenance Worker is active and after migrations 0006-0008.
-- The approved estimate is identical to analysis/score-migration-preview.sql:
-- current Points are an absolute floor, provable removals are another floor,
-- verified points stay exact, and only unrecorded legacy solves are estimated.

CREATE TABLE IF NOT EXISTS score_migration_backup (
  user_id TEXT PRIMARY KEY,
  score_before INTEGER NOT NULL,
  points_balance_before INTEGER NOT NULL,
  current_round_before INTEGER NOT NULL,
  best_round_before INTEGER NOT NULL,
  total_rounds_before INTEGER NOT NULL,
  backed_up_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO score_migration_backup (
  user_id,
  score_before,
  points_balance_before,
  current_round_before,
  best_round_before,
  total_rounds_before
)
SELECT
  user_id,
  score,
  points_balance,
  current_round,
  best_round,
  total_rounds
FROM player_saves;

WITH
global_average AS (
  SELECT COALESCE(
    1.0 * SUM(points_earned) / NULLIF(SUM(map_correct), 0),
    0
  ) AS points_per_solve
  FROM player_daily_results
),
verified AS (
  SELECT
    user_id,
    SUM(points_earned) AS verified_score,
    SUM(map_correct) AS verified_solves
  FROM player_daily_results
  GROUP BY user_id
),
recorded_losses AS (
  SELECT
    user_id,
    SUM(
      CASE
        WHEN json_extract(state_json, '$.isCorrect') = 0
          AND COALESCE(json_extract(state_json, '$.revived'), 0) = 0
        THEN COALESCE(json_extract(state_json, '$.pointsBeforeLoss'), 0)
        ELSE COALESCE(json_extract(state_json, '$.reviveCostPaid'), 0)
      END
    ) AS provable_points_removed
  FROM player_daily_saves
  WHERE json_valid(state_json)
  GROUP BY user_id
),
estimates AS (
  SELECT
    saves.user_id,
    saves.points_balance AS current_balance,
    COALESCE(verified.verified_score, 0) AS verified_score,
    MAX(saves.total_rounds - COALESCE(verified.verified_solves, 0), 0)
      AS estimated_legacy_solves,
    COALESCE(losses.provable_points_removed, 0) AS provable_points_removed,
    (
      COALESCE(verified.verified_score, 0) + (global_average.points_per_solve * 5.0)
    ) / (COALESCE(verified.verified_solves, 0) + 5.0) AS smoothed_points_per_solve
  FROM player_saves AS saves
  CROSS JOIN global_average
  LEFT JOIN verified ON verified.user_id = saves.user_id
  LEFT JOIN recorded_losses AS losses ON losses.user_id = saves.user_id
),
proposals AS (
  SELECT
    user_id,
    MAX(
      current_balance,
      CAST(
        ROUND(
          MAX(
            current_balance,
            current_balance + provable_points_removed,
            verified_score + ROUND(estimated_legacy_solves * smoothed_points_per_solve)
          ) / 10.0
        ) * 10 AS INTEGER
      )
    ) AS opening_score
  FROM estimates
)
UPDATE player_saves
SET
  score = MAX(
    score,
    (SELECT opening_score FROM proposals WHERE proposals.user_id = player_saves.user_id)
  ),
  score_migration_method = 'lifetime-estimate-v1',
  score_migrated_at = CURRENT_TIMESTAMP
WHERE COALESCE(score_migration_method, '') <> 'lifetime-estimate-v1'
  AND EXISTS (
    SELECT 1 FROM proposals WHERE proposals.user_id = player_saves.user_id
  );
