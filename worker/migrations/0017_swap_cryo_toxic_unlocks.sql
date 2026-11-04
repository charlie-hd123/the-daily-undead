-- Cryo (outbreak) now unlocks at 50 solves; Toxic (afterlife) at 100.
-- Run once through the migration runner in each environment. Every profile
-- wearing the old 50-solve Toxic reward receives Cryo automatically, even if
-- it already has 100 solves. Eligible players can then choose Toxic again.
-- Existing Cryo and all other themes stay equipped. No gameplay data changes.
UPDATE player_profiles
SET theme_id = 'outbreak', updated_at = CURRENT_TIMESTAMP
WHERE theme_id = 'afterlife';
