-- EMERGENCY PRE-LAUNCH ROLLBACK ONLY.
-- Do not run after the new site has reopened and begun awarding permanent Score.
UPDATE player_saves
SET
  score = (
    SELECT backup.score_before
    FROM score_migration_backup AS backup
    WHERE backup.user_id = player_saves.user_id
  ),
  score_migration_method = 'current-balance-floor',
  score_migrated_at = CURRENT_TIMESTAMP
WHERE score_migration_method = 'lifetime-estimate-v1'
  AND EXISTS (
    SELECT 1
    FROM score_migration_backup AS backup
    WHERE backup.user_id = player_saves.user_id
  );
