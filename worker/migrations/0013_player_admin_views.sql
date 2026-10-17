-- Administrative joins only: existing player rows and progress are untouched.
CREATE VIEW admin_player_overview AS
SELECT profiles.username, profiles.account_id, profiles.user_id,
  supabase.provider_subject AS supabase_user_id,
  clerk.provider_subject AS clerk_user_id,
  saves.score, saves.current_round AS stored_current_round, saves.best_round,
  saves.total_rounds AS solves, saves.last_played_date,
  profiles.leaderboard_visible, profiles.created_at AS registered_at,
  profiles.updated_at AS profile_updated_at, saves.updated_at AS progress_saved_at
FROM player_profiles AS profiles
LEFT JOIN player_saves AS saves ON saves.user_id = profiles.user_id
LEFT JOIN account_identities AS supabase
  ON supabase.account_id = profiles.account_id AND supabase.provider = 'supabase'
LEFT JOIN account_identities AS clerk
  ON clerk.account_id = profiles.account_id AND clerk.provider = 'clerk';

CREATE VIEW admin_player_results AS
SELECT profiles.username, profiles.account_id,
  identities.provider_subject AS supabase_user_id, results.*
FROM player_daily_results AS results
JOIN player_profiles AS profiles ON profiles.user_id = results.user_id
LEFT JOIN account_identities AS identities
  ON identities.account_id = profiles.account_id AND identities.provider = 'supabase';

CREATE VIEW admin_player_daily_saves AS
SELECT profiles.username, profiles.account_id,
  identities.provider_subject AS supabase_user_id, saves.*
FROM player_daily_saves AS saves
JOIN player_profiles AS profiles ON profiles.user_id = saves.user_id
LEFT JOIN account_identities AS identities
  ON identities.account_id = profiles.account_id AND identities.provider = 'supabase';

-- A checkpoint, not a second profile store. Missing/mismatched usernames are
-- backfilled or retried from player_profiles. Deletion cascades this state.
CREATE TABLE auth_profile_sync (
  account_id TEXT PRIMARY KEY REFERENCES player_profiles(account_id) ON DELETE CASCADE,
  synced_username TEXT,
  last_attempt_at TEXT,
  last_synced_at TEXT
);
