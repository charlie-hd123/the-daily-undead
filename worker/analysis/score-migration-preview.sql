-- READ-ONLY, ANONYMISED PREVIEW. This never updates player data.
-- Run against an exported/temporary database first. Production execution must be
-- separately approved and its output reviewed before any migration is proposed.
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
    s.user_id,
    s.points_balance AS current_balance,
    s.total_rounds AS stored_solves,
    COALESCE(v.verified_score, 0) AS verified_score,
    COALESCE(v.verified_solves, 0) AS verified_solves,
    COALESCE(l.provable_points_removed, 0) AS provable_points_removed,
    MAX(s.total_rounds - COALESCE(v.verified_solves, 0), 0) AS estimated_legacy_solves,
    -- Five global-average solves prevent a tiny verified sample from producing
    -- an extreme lifetime estimate while still personalising established data.
    (
      COALESCE(v.verified_score, 0) + (g.points_per_solve * 5.0)
    ) / (COALESCE(v.verified_solves, 0) + 5.0) AS smoothed_points_per_solve
  FROM player_saves AS s
  CROSS JOIN global_average AS g
  LEFT JOIN verified AS v ON v.user_id = s.user_id
  LEFT JOIN recorded_losses AS l ON l.user_id = s.user_id
),
preview AS (
  SELECT
    user_id,
    current_balance,
    stored_solves,
    verified_score,
    verified_solves,
    estimated_legacy_solves,
    provable_points_removed,
    current_balance + provable_points_removed AS provable_lower_bound,
    smoothed_points_per_solve,
    -- Keep every verified point exact. Only the older solves that pre-date the
    -- verified result ledger need an estimated value.
    verified_score
      + ROUND(estimated_legacy_solves * smoothed_points_per_solve)
      AS performance_estimate
  FROM estimates
),
ranked AS (
  SELECT
    ROW_NUMBER() OVER (ORDER BY user_id) AS anonymous_player,
    *,
    MAX(current_balance, provable_lower_bound, performance_estimate) AS unrounded_opening_score
  FROM preview
)
SELECT
  printf('Player %03d', anonymous_player) AS player,
  current_balance,
  stored_solves AS solves,
  verified_score,
  verified_solves,
  estimated_legacy_solves,
  provable_points_removed,
  provable_lower_bound,
  ROUND(smoothed_points_per_solve, 1) AS estimated_points_per_solve,
  performance_estimate,
  MAX(
    current_balance,
    CAST(ROUND(unrounded_opening_score / 10.0) * 10 AS INTEGER)
  ) AS proposed_opening_score,
  MAX(
    current_balance,
    CAST(ROUND(unrounded_opening_score / 10.0) * 10 AS INTEGER)
  ) - current_balance AS estimated_recovered_score
FROM ranked
ORDER BY proposed_opening_score DESC, player;
