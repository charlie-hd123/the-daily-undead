-- Run in the project's SQL Editor and save as "Player lookup".
-- Administrative query only; do not expose auth.users through a public view.
SELECT
  raw_app_meta_data ->> 'daily_undead_username' AS username,
  email,
  id AS supabase_user_id,
  raw_app_meta_data ->> 'daily_undead_account_id' AS account_id,
  created_at AS signed_up_at,
  last_sign_in_at
FROM auth.users
ORDER BY username NULLS LAST, created_at DESC;
