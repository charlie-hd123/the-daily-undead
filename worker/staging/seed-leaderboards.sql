-- Staging-only fictional data for visual leaderboard review.
-- This file is deliberately outside the migrations directory and must never be
-- applied to the production database.

INSERT INTO player_profiles (
  user_id, username, leaderboard_visible, avatar_id, theme_id, favourite_map, bio, favourite_game
) VALUES
  ('stage_demo_01', 'DemoRichtofen', 1, 'richtofen', 'outbreak', 'Der Riese', 'The loop continues, but the leaderboard remembers.', 'World at War'),
  ('stage_demo_02', 'DemoDempsey', 1, 'dempsey', 'afterlife', 'Moon', 'One more round and one more terrible plan.', 'Black Ops'),
  ('stage_demo_03', 'DemoTakeo', 1, 'takeo', 'outbreak', 'Zetsubou No Shima', 'Honour survives beyond death.', 'Black Ops 3'),
  ('stage_demo_04', 'DemoNikolai', 1, 'nikolai', 'afterlife', 'Ascension', 'Still standing. Somehow.', 'Black Ops'),
  ('stage_demo_05', 'DemoSamantha', 1, 'samantha', 'outbreak', 'Origins', 'Every mystery has another layer.', 'Black Ops 2'),
  ('stage_demo_06', 'DemoMisty', 1, 'misty', 'afterlife', 'Buried', 'Nothing stays buried forever.', 'Black Ops 2'),
  ('stage_demo_07', 'DemoMarlton', 1, 'marlton', 'outbreak', 'TranZit', 'Statistically speaking, this should work.', 'Black Ops 2'),
  ('stage_demo_08', 'DemoRussman', 1, 'russman', 'afterlife', 'Die Rise', 'Been around longer than most of these corpses.', 'Black Ops 2')
ON CONFLICT(user_id) DO UPDATE SET
  username = excluded.username,
  leaderboard_visible = excluded.leaderboard_visible,
  avatar_id = excluded.avatar_id,
  theme_id = excluded.theme_id,
  favourite_map = excluded.favourite_map,
  bio = excluded.bio,
  favourite_game = excluded.favourite_game;

INSERT INTO player_saves (
  user_id, current_round, best_round, points_balance, total_rounds, revive_count,
  last_played_date, revision, score, score_migration_method, score_migrated_at,
  round_anchor_date, round_anchor_value
) VALUES
  ('stage_demo_01', 54, 91, 0, 387, 0, '2026-10-01', 1, 38750, 'staging-demo', CURRENT_TIMESTAMP, '2026-10-01', 54),
  ('stage_demo_02', 21, 64, 0, 342, 0, '2026-10-01', 1, 32640, 'staging-demo', CURRENT_TIMESTAMP, '2026-10-01', 21),
  ('stage_demo_03', 88, 88, 0, 301, 0, '2026-10-01', 1, 29120, 'staging-demo', CURRENT_TIMESTAMP, '2026-10-01', 88),
  ('stage_demo_04', 7, 47, 0, 264, 0, '2026-10-01', 1, 24480, 'staging-demo', CURRENT_TIMESTAMP, '2026-10-01', 7),
  ('stage_demo_05', 36, 72, 0, 221, 0, '2026-10-01', 1, 20890, 'staging-demo', CURRENT_TIMESTAMP, '2026-10-01', 36),
  ('stage_demo_06', 14, 39, 0, 178, 0, '2026-10-01', 1, 16520, 'staging-demo', CURRENT_TIMESTAMP, '2026-10-01', 14),
  ('stage_demo_07', 63, 63, 0, 151, 0, '2026-10-01', 1, 13970, 'staging-demo', CURRENT_TIMESTAMP, '2026-10-01', 63),
  ('stage_demo_08', 4, 26, 0, 104, 0, '2026-10-01', 1, 9140, 'staging-demo', CURRENT_TIMESTAMP, '2026-10-01', 4)
ON CONFLICT(user_id) DO UPDATE SET
  current_round = excluded.current_round,
  best_round = excluded.best_round,
  total_rounds = excluded.total_rounds,
  last_played_date = excluded.last_played_date,
  score = excluded.score,
  score_migration_method = excluded.score_migration_method,
  score_migrated_at = excluded.score_migrated_at,
  round_anchor_date = excluded.round_anchor_date,
  round_anchor_value = excluded.round_anchor_value;

INSERT INTO player_daily_results (
  user_id, puzzle_date, puzzle_id, selected_map_id, clues_used, map_correct,
  map_points, bonus_status, bonus_points, points_earned, completed_at,
  score_awarded, progression_applied
) VALUES
  ('stage_demo_01', '2026-10-01', 'staging-demo-2026-10-01', 'alpha-omega', 1, 1, 50, 'correct', 50, 100, CURRENT_TIMESTAMP, 100, 1),
  ('stage_demo_02', '2026-10-01', 'staging-demo-2026-10-01', 'alpha-omega', 1, 1, 50, 'incorrect', 0, 50, CURRENT_TIMESTAMP, 50, 1),
  ('stage_demo_03', '2026-10-01', 'staging-demo-2026-10-01', 'alpha-omega', 2, 1, 20, 'correct', 20, 40, CURRENT_TIMESTAMP, 40, 1),
  ('stage_demo_04', '2026-10-01', 'staging-demo-2026-10-01', 'alpha-omega', 2, 1, 20, 'incorrect', 0, 20, CURRENT_TIMESTAMP, 20, 1),
  ('stage_demo_05', '2026-10-01', 'staging-demo-2026-10-01', 'alpha-omega', 3, 1, 10, 'incorrect', 0, 10, CURRENT_TIMESTAMP, 10, 1),
  ('stage_demo_06', '2026-10-01', 'staging-demo-2026-10-01', 'alpha-omega', 3, 1, 10, 'incorrect', 0, 10, CURRENT_TIMESTAMP, 10, 1)
ON CONFLICT(user_id, puzzle_date) DO UPDATE SET
  clues_used = excluded.clues_used,
  map_correct = excluded.map_correct,
  map_points = excluded.map_points,
  bonus_status = excluded.bonus_status,
  bonus_points = excluded.bonus_points,
  points_earned = excluded.points_earned,
  completed_at = excluded.completed_at,
  score_awarded = excluded.score_awarded,
  progression_applied = excluded.progression_applied;

INSERT INTO daily_stats (puzzle_date, attempts, correct, answer_map_id, answer_map_name)
VALUES ('2026-10-01', 84, 58, 'alpha-omega', 'Alpha Omega')
ON CONFLICT(puzzle_date) DO UPDATE SET
  attempts = excluded.attempts,
  correct = excluded.correct,
  answer_map_id = excluded.answer_map_id,
  answer_map_name = excluded.answer_map_name;
