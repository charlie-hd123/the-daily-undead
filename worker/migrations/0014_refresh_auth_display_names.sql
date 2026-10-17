-- Requeue previously synced profiles so the Auth Users "Display name" column
-- is populated too. Only sync checkpoints change; player progress is untouched.
UPDATE auth_profile_sync
SET synced_username = NULL, last_synced_at = NULL;
