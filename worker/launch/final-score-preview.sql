-- READ-ONLY, USERNAME-LINKED FINAL REVIEW.
-- Keep the output private; never commit generated player data to this repository.
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
    profiles.username,
    saves.points_balance AS current_points,
    saves.total_rounds AS puzzle_solves,
    saves.current_round,
    saves.best_round AS highest_round,
    COALESCE(verified.verified_score, 0) AS verified_score,
    COALESCE(verified.verified_solves, 0) AS verified_solves,
    MAX(saves.total_rounds - COALESCE(verified.verified_solves, 0), 0)
      AS estimated_legacy_solves,
    COALESCE(losses.provable_points_removed, 0) AS provable_points_removed,
    (
      COALESCE(verified.verified_score, 0) + (global_average.points_per_solve * 5.0)
    ) / (COALESCE(verified.verified_solves, 0) + 5.0) AS smoothed_points_per_solve
  FROM player_saves AS saves
  JOIN player_profiles AS profiles ON profiles.user_id = saves.user_id
  CROSS JOIN global_average
  LEFT JOIN verified ON verified.user_id = saves.user_id
  LEFT JOIN recorded_losses AS losses ON losses.user_id = saves.user_id
),
proposals AS (
  SELECT
    *,
    MAX(
      current_points,
      CAST(
        ROUND(
          MAX(
            current_points,
            current_points + provable_points_removed,
            verified_score + ROUND(estimated_legacy_solves * smoothed_points_per_solve)
          ) / 10.0
        ) * 10 AS INTEGER
      )
    ) AS proposed_score
  FROM estimates
),
ranked AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      ORDER BY proposed_score DESC, puzzle_solves DESC, username COLLATE NOCASE
    ) AS proposed_rank,
    ROW_NUMBER() OVER (
      ORDER BY current_points DESC, puzzle_solves DESC, username COLLATE NOCASE
    ) AS current_rank
  FROM proposals
)
SELECT
  proposed_rank,
  current_rank,
  proposed_rank - current_rank AS rank_change,
  username,
  proposed_score,
  current_points,
  proposed_score - current_points AS recovered_score,
  puzzle_solves,
  current_round,
  highest_round,
  verified_score,
  verified_solves,
  estimated_legacy_solves,
  provable_points_removed,
  ROUND(smoothed_points_per_solve, 1) AS estimated_points_per_solve
FROM ranked
ORDER BY proposed_rank;
