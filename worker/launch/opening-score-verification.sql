-- READ-ONLY POST-WRITE CHECKS. Every problem count must be zero.
SELECT
  COUNT(*) AS accounts,
  SUM(CASE WHEN score < points_balance THEN 1 ELSE 0 END) AS score_below_old_balance,
  SUM(CASE WHEN score < 0 THEN 1 ELSE 0 END) AS negative_scores,
  SUM(CASE WHEN score_migration_method = 'lifetime-estimate-v1' THEN 1 ELSE 0 END)
    AS migrated_accounts,
  SUM(score) AS opening_score_total
FROM player_saves;

SELECT
  SUM(CASE WHEN saves.current_round <> backup.current_round_before THEN 1 ELSE 0 END)
    AS changed_current_rounds,
  SUM(CASE WHEN saves.best_round <> backup.best_round_before THEN 1 ELSE 0 END)
    AS changed_highest_rounds,
  SUM(CASE WHEN saves.total_rounds <> backup.total_rounds_before THEN 1 ELSE 0 END)
    AS changed_solves
FROM player_saves AS saves
JOIN score_migration_backup AS backup ON backup.user_id = saves.user_id;

SELECT
  profiles.username,
  saves.score,
  saves.total_rounds AS puzzle_solves,
  saves.current_round,
  saves.best_round AS highest_round,
  saves.score - backup.score_before AS recovered_score
FROM player_saves AS saves
JOIN player_profiles AS profiles ON profiles.user_id = saves.user_id
JOIN score_migration_backup AS backup ON backup.user_id = saves.user_id
ORDER BY saves.score DESC, saves.total_rounds DESC, profiles.username COLLATE NOCASE;
